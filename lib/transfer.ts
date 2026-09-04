import { fromCentavos, toCentavos } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

/**
 * Grab-style hotel-transfer pricing (server-only).
 *
 * The guest books one optional pickup->hotel ride at checkout. The fare is priced by a
 * live route: TomTom geocodes the free-text pickup address, routes it to the hotel origin
 * stored on the single-row hotel_operational_policies table, and the total is
 *   base + per-km x distance + per-minute x duration + booking fee
 * computed in integer centavos. Everything below marked "pure" is unit-testable without a
 * network; the fetch wrappers are the only place TomTom is called.
 *
 * Client-submitted prices are never trusted -- the holds route re-runs estimateTransfer +
 * rideFare server-side and stores its own value. The feature is gated on TOMTOM_API_KEY
 * being present in env, matching the repo's config-presence conventions.
 */

export type TransferVehicleType = {
  id: string;
  name: string;
  description: string | null;
  seats: number;
  baseFare: number;
  perKm: number;
  perMinute: number;
  bookingFee: number;
};

export type TransferFare = {
  base: number;
  distanceCharge: number;
  timeCharge: number;
  bookingFee: number;
  total: number;
};

export type TransferEstimate = {
  dropoffLabel: string;
  pickupAddress: string;
  distanceKm: number;
  durationMin: number;
};

export class TransferError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "TransferError";
  }
}

export const TRANSFER_CODES = {
  NOT_CONFIGURED: "ERR_NOT_CONFIGURED",
  GEOCODE: "ERR_GEOCODE",
  ROUTE: "ERR_ROUTE",
} as const;

type LatLon = { lat: number; lon: number };

export const tomtomKey = () => process.env.TOMTOM_API_KEY?.trim();
export const transferEnabled = () => Boolean(tomtomKey());

/** Absolute sanity ceiling on a booked ride (Manila-island bound). Far beyond that is an error. */
const MAX_DISTANCE_KM = 400;
const MAX_DURATION_MIN = 600;

/**
 * Itemized fare in whole pesos from integer-centavo math, so per-km x fractional-km and
 * per-minute x fractional-minute never float-drift. Pure.
 */
export function rideFare(
  rate: Pick<TransferVehicleType, "baseFare" | "perKm" | "perMinute" | "bookingFee">,
  distanceKm: number,
  durationMin: number,
): TransferFare {
  const base = toCentavos(rate.baseFare);
  const distanceCharge = Math.round(toCentavos(rate.perKm) * distanceKm);
  const timeCharge = Math.round(toCentavos(rate.perMinute) * durationMin);
  const bookingFee = toCentavos(rate.bookingFee);
  const total = base + distanceCharge + timeCharge + bookingFee;
  return {
    base: fromCentavos(base),
    distanceCharge: fromCentavos(distanceCharge),
    timeCharge: fromCentavos(timeCharge),
    bookingFee: fromCentavos(bookingFee),
    total: fromCentavos(total),
  };
}

// --- TomTom response parsers (pure) --------------------------------------------------

/** Active transfer vehicle fare catalogue, offered at checkout. Server-side service-role read. */
export async function getTransportVehicleTypes(): Promise<TransferVehicleType[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("transport_vehicle_types")
    .select("id,name,description,seats,base_fare,per_km,per_minute,booking_fee")
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Transfer vehicle query failed${error.code ? ` (${error.code})` : ""}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description as string | null,
    seats: Number(row.seats),
    baseFare: Number(row.base_fare),
    perKm: Number(row.per_km),
    perMinute: Number(row.per_minute),
    bookingFee: Number(row.booking_fee),
  }));
}

export function parseGeocode(body: unknown): LatLon | null {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const position = (results[0] as { position?: unknown })?.position as LatLon | undefined;
  if (!position || typeof position.lat !== "number" || typeof position.lon !== "number") return null;
  return { lat: position.lat, lon: position.lon };
}

export function parseRouteSummary(body: unknown): { meters: number; seconds: number } | null {
  const routes = (body as { routes?: unknown })?.routes;
  const summary = Array.isArray(routes) ? (routes[0] as { summary?: unknown })?.summary : null;
  if (!summary || typeof summary !== "object") return null;
  const meters = Number((summary as { lengthInMeters?: unknown }).lengthInMeters);
  const seconds = Number((summary as { travelTimeInSeconds?: unknown }).travelTimeInSeconds);
  if (!Number.isFinite(meters) || meters <= 0 || !Number.isFinite(seconds) || seconds < 0) return null;
  return { meters, seconds };
}

// --- TomTom fetch wrappers (the only network boundary) --------------------------------

async function geocodeAddress(key: string, query: string): Promise<LatLon | null> {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&countrySet=PH&limit=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!response.ok) return null;
  return parseGeocode(await response.json());
}

async function routeSummary(key: string, from: LatLon, to: LatLon): Promise<{ meters: number; seconds: number } | null> {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lon},${from.lat}:${to.lon},${to.lat}/json?key=${encodeURIComponent(key)}&travelMode=car&routeType=fastest`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!response.ok) return null;
  return parseRouteSummary(await response.json());
}

/** Small per-instance TTL cache so quote-then-submit on the same pickup doesn't double-call TomTom. */
const routeCache = new Map<string, { at: number; km: number; minutes: number }>();
const ROUTE_CACHE_TTL_MS = 5 * 60_000;

async function estimateRoute(key: string, from: LatLon, to: LatLon): Promise<{ km: number; minutes: number }> {
  const cacheKey = `${from.lat.toFixed(5)},${from.lon.toFixed(5)}|${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) return { km: cached.km, minutes: cached.minutes };
  const summary = await routeSummary(key, from, to);
  if (!summary) throw new TransferError("We could not route this trip.", TRANSFER_CODES.ROUTE);
  const value = { km: summary.meters / 1000, minutes: summary.seconds / 60 };
  if (routeCache.size > 200) routeCache.clear();
  routeCache.set(cacheKey, { at: Date.now(), ...value });
  return value;
}

async function hotelOrigin(): Promise<{ lat: number; lon: number; label: string }> {
  if (!supabase) throw new TransferError("Transfer is not configured.", TRANSFER_CODES.NOT_CONFIGURED);
  const { data } = await supabase
    .from("hotel_operational_policies")
    .select("transfer_hotel_lat,transfer_hotel_lon,transfer_hotel_label")
    .eq("key", "default")
    .maybeSingle();
  const lat = Number(data?.transfer_hotel_lat);
  const lon = Number(data?.transfer_hotel_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new TransferError("Transfer is not configured.", TRANSFER_CODES.NOT_CONFIGURED);
  return { lat, lon, label: String(data?.transfer_hotel_label ?? "The hotel") };
}

/** Resolve a pickup address to a drivable distance/duration to the hotel. Server-only. */
export async function estimateTransfer(pickupAddress: string): Promise<TransferEstimate> {
  const key = tomtomKey();
  if (!key) throw new TransferError("Transfer is not configured.", TRANSFER_CODES.NOT_CONFIGURED);
  const address = pickupAddress.trim();
  if (address.length < 5) throw new TransferError("Enter a more complete pickup address.", TRANSFER_CODES.GEOCODE);
  const origin = await hotelOrigin();
  const from = await geocodeAddress(key, address);
  if (!from) throw new TransferError("We could not locate that pickup address.", TRANSFER_CODES.GEOCODE);
  const { km, minutes } = await estimateRoute(key, from, origin);
  if (km > MAX_DISTANCE_KM || minutes > MAX_DURATION_MIN) throw new TransferError("That pickup is too far for a hotel transfer.", TRANSFER_CODES.ROUTE);
  return { dropoffLabel: origin.label, pickupAddress: address, distanceKm: km, durationMin: minutes };
}
