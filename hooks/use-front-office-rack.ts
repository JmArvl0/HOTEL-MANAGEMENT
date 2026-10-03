"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

export interface RackSnapshot {
  from: string;
  days: number;
  rooms: RackRoom[];
  reservations: RackReservation[];
  /** Rooms Maintenance has blocked (active blocking diagnosis) — shown as out of service. */
  blockedRoomIds?: string[];
}

const todayManila = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

/**
 * Rack data hook: fetches GET /api/rack for the selected window
 * and refreshes on the workspace 30s cadence. All writes happen in the
 * panel through the existing assign / check-in / prioritize routes.
 */
export function useFrontOfficeRack() {
  const [from, setFrom] = useState(todayManila);
  // Free window length 1–14 days (the /api/rack cap); the range control
  // derives it from the picked end date.
  const [days, setDaysState] = useState<number>(7);
  const setDays = useCallback((value: number) => {
    setDaysState(Math.min(14, Math.max(1, Math.floor(value) || 1)));
  }, []);
  const [snapshot, setSnapshot] = useState<RackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      try {
        const res = await fetch(`/api/rack?from=${from}&days=${days}`, { cache: "no-store" });
        const body = (await res.json()) as { data?: RackSnapshot; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Unable to load the room rack.");
        setSnapshot(body.data ?? null);
        setError("");
      } catch (cause) {
        if (!quiet) setError(cause instanceof Error ? cause.message : "Unable to load the room rack.");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [from, days]
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const shift = useCallback(
    (delta: number) => {
      const base = Date.parse(`${from}T00:00:00Z`);
      setFrom(new Date(base + delta * 86_400_000).toISOString().slice(0, 10));
    },
    [from]
  );

  return useMemo(
    () => ({ from, days, setDays, setFrom, shift, goToday: () => setFrom(todayManila()), snapshot, loading, error, reload: load }),
    [from, days, setDays, shift, snapshot, loading, error, load]
  );
}
