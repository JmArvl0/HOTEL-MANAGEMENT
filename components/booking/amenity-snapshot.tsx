import { normalizeAmenities } from "@/lib/room-amenities";

/** Historical bookings intentionally have no invented snapshot. */
export function AmenitySnapshot({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { effective?: unknown }).effective)) return null;
  const amenities = normalizeAmenities((value as { effective: unknown }).effective);
  return <section className="booking-amenity-snapshot"><h3>Room amenities at reservation</h3><p>{amenities.length ? amenities.join(" · ") : "No amenities were configured for this room when reserved."}</p><p className="muted">Saved with your booking. Contact Front Desk about any changes affecting your stay.</p></section>;
}
