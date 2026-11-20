"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { useCallback, useEffect, useState } from "react";
import { CarFront, ExternalLink, Share2 } from "lucide-react";
import type { FleetRideSafety as Ride } from "@/lib/fleet-safety";
import "./fleet-ride-safety.css";

export function FleetRideSafety({ requestId, active }: { requestId: string; active: boolean }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (document.hidden) return;
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetchPublic(`/api/account/transportation/${requestId}/ride-safety`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const body = await readResponse(response);
        if (!disposed) { setRides(body.rides ?? []); setError(false); setMessage(""); setNow(Date.now()); }
      } catch (e) {
        if (!disposed && !(e instanceof Error && e.name === "AbortError")) { setRides([]); setError(true); setMessage(""); }
      }
    }
    const changed = (event: Event) => { if ((event as CustomEvent).detail === requestId) void refresh(); };
    const focused = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(focused, 30000);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    window.addEventListener("haven-ride-details-updated", changed);
    return () => { disposed = true; controller?.abort(); clearInterval(timer); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); window.removeEventListener("haven-ride-details-updated", changed); };
  }, [requestId, active]);
  useEffect(() => {
    const expiries = rides.map(ride => Date.parse(ride.trackingExpiresAt ?? "")).filter(expiry => expiry > now);
    if (!expiries.length) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(0, Math.min(...expiries) - Date.now()) + 10));
    return () => clearTimeout(timer);
  }, [rides, now]);

  const handleShare = useCallback(async (ride: Ride) => {
    if (!ride.trackingUrl || Date.parse(ride.trackingExpiresAt ?? "") <= Date.now()) { setMessage("This tracking link expired. Wait for Fleet to provide a fresh link."); return; }
    setMessage("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Haven ride", text: ride.plateNumber ? `Follow my ride. Vehicle plate: ${ride.plateNumber}.` : "Follow my ride.", url: ride.trackingUrl });
        setMessage("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(ride.trackingUrl);
        setMessage("Tracking link copied. Share it with someone you trust.");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setMessage("Unable to share here. Open Track ride and copy the address from your browser.");
    }
  }, []);
  if (!active || (!rides.length && !error)) return null;
  return <section className="fleet-ride-safety" aria-label="Vehicle and ride tracking">
    <h3><CarFront size={17} aria-hidden="true" />Your ride</h3>
    {error ? <p>Ride details are temporarily unavailable. They will refresh automatically.</p> : rides.map(ride => {
      const usable = Boolean(ride.trackingUrl && Date.parse(ride.trackingExpiresAt ?? "") > now);
      return <div className="fleet-safety-leg" key={ride.id}>
        <div className="fleet-safety-vehicle"><div><small>{ride.leg === "RETURN" ? "Return ride" : "Outbound ride"}</small>{ride.plateNumber && <strong>{ride.plateNumber}</strong>}{(ride.driverName || ride.vehicleDescription) && <span>{[ride.driverName, ride.vehicleDescription].filter(Boolean).join(" · ")}</span>}</div></div>
        <div className="fleet-safety-actions">
          {usable ? <a className="btn btn-soft" href={ride.trackingUrl!} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />Track ride</a> : <button className="btn btn-soft" type="button" disabled><ExternalLink size={15} aria-hidden="true" />Track ride</button>}
          <button className="btn btn-soft" type="button" disabled={!usable} onClick={() => handleShare(ride)}><Share2 size={15} aria-hidden="true" />Share ride</button>
        </div>
        <p>{usable ? "Share Fleet’s tracking link with someone you trust. Anyone with the link may see your ride’s location." : "Fleet tracking link is unavailable or expired."}</p>
      </div>;
    })}
    {message && <p role="status">{message}</p>}
  </section>;
}
