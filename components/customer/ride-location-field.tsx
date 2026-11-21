"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import { MapPin } from "lucide-react";
import { FormFieldError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import "leaflet/dist/leaflet.css";
import "./ride-location-field.css";

type Point = { lat: number; lng: number };
const addressKeys = ["name", "housenumber", "street", "district", "city", "state", "postcode", "country"];

async function addressAt(point: Point, signal: AbortSignal) {
  const base = process.env.NEXT_PUBLIC_RIDE_GEOCODER_URL ?? "https://photon.komoot.io";
  const url = new URL("/reverse", base);
  url.search = new URLSearchParams({ lat: point.lat.toFixed(6), lon: point.lng.toFixed(6), limit: "1" }).toString();
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) return "";
  const { features } = await response.json();
  const place = features?.[0]?.properties;
  if (!place) return "";
  const parts = addressKeys.map(key => typeof place[key] === "string" ? place[key].trim().replace(/\s+/g, " ") : "").filter(Boolean);
  return [...new Set(parts)].join(", ").slice(0, 200);
}

export function RideLocationField({ name, label, placeholder, defaultValue = "", fields, prefix, wide, allowMap = true }: {
  name: "pickupLocation" | "dropoffLocation" | "returnLocation";
  label: string;
  placeholder: string;
  defaultValue?: string;
  fields: FormFieldErrors;
  prefix: string;
  wide?: boolean;
  allowMap?: boolean;
}) {
  const inputId = useId();
  const mapId = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  return <div className={wide ? "ride-location-field wide" : "ride-location-field"}>
    <div className="ride-location-heading">
      <label htmlFor={inputId}>{label}</label>
      {allowMap && <button type="button" className="ride-pin-button" aria-expanded={open} aria-controls={mapId}
        onClick={() => { setOpen(!open); setMessage(""); }}>
        <MapPin size={15} aria-hidden="true" />{open ? "Close map" : "Pin on map"}
      </button>}
    </div>
    <input id={inputId} ref={input} name={name} required minLength={5} maxLength={200} placeholder={placeholder}
      value={value} onChange={event => { setValue(event.target.value); setMessage(""); }} {...formFieldProps(fields, name, prefix)} />
    <FormFieldError errors={fields} field={name} prefix={prefix} />
    {message && <small role="status">{message}</small>}
    {open && <div id={mapId}>
      <RidePinMap label={label} onUse={(address, foundAddress) => {
        // Fire the same native input event as typing so the parent form clears stale field errors.
        const field = input.current;
        const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (field && setNativeValue) {
          setNativeValue.call(field, address);
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        setValue(address);
        setOpen(false);
        setMessage(foundAddress ? "Address filled from the pin. You can edit it." : "Pin coordinates filled in. You can add an address or landmark.");
        field?.focus();
      }} />
    </div>}
  </div>;
}

function RidePinMap({ label, onUse }: { label: string; onUse: (address: string, foundAddress: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const showPin = useRef<((point: Point) => void) | null>(null);
  const lookup = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let panel: LeafletMap | undefined;
    void import("leaflet").then(leaflet => {
      if (!active || !host.current) return;
      panel = leaflet.map(host.current, { scrollWheelZoom: false }).setView([14.5547, 121.0244], 12);
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(panel);
      const activeMap = panel;
      let marker: Marker | undefined;
      showPin.current = selected => {
        if (lookup.current) return;
        if (marker) marker.setLatLng(selected);
        else marker = leaflet.marker(selected, {
          icon: leaflet.divIcon({ className: "ride-map-pin", iconSize: [22, 22], iconAnchor: [11, 22] }),
          keyboard: false, interactive: false,
        }).addTo(activeMap);
        setPoint(selected);
      };
      panel.on("click", (event: LeafletMouseEvent) => showPin.current?.(event.latlng));
      map.current = panel;
      setReady(true);
    }).catch(() => { if (active) setUnavailable(true); });
    return () => {
      active = false;
      lookup.current?.abort();
      panel?.remove();
      map.current = null;
      showPin.current = null;
    };
  }, []);

  async function confirmPin() {
    if (!point || lookup.current) return;
    const controller = new AbortController();
    lookup.current = controller;
    setBusy(true);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    const address = await addressAt(point, signal).catch(() => "");
    if (controller.signal.aborted) return;
    const coordinates = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    onUse(address || coordinates, Boolean(address));
  }

  return <div className="ride-pin-picker">
    <p>Tap the map to drop a pin, or pan with the arrow keys and use the map center.</p>
    <div className="ride-pin-map" ref={host} role="region" aria-label={`Map for ${label.toLowerCase()}`} />
    {point && <small role="status">Pin placed. Use it to fill the location.</small>}
    {unavailable && <p role="status">The map could not load. Enter the location in the field above.</p>}
    <div className="ride-pin-actions">
      <button type="button" className="btn btn-soft" disabled={!ready || busy}
        onClick={() => { if (map.current) showPin.current?.(map.current.getCenter()); }}>Pin map center</button>
      <button type="button" className="btn btn-accent" disabled={!point || busy}
        onClick={confirmPin}>{busy ? "Finding address…" : "Use this pin"}</button>
    </div>
  </div>;
}
