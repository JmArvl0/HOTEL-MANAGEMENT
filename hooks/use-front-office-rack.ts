"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

export interface RackSnapshot {
  from: string;
  days: number;
  rooms: RackRoom[];
  reservations: RackReservation[];
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
  const [days, setDays] = useState<7 | 14>(7);
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
    () => ({ from, days, setDays, shift, goToday: () => setFrom(todayManila()), snapshot, loading, error, reload: load }),
    [from, days, shift, snapshot, loading, error, load]
  );
}
