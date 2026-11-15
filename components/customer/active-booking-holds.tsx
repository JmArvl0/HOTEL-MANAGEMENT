"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { MyStayCard, type MyStayCardData } from "./my-stay-card";

type Hold = {
  token: string;
  roomType: string;
  roomNumber: string | null;
  dates: string;
  expiresAt: string;
  expiryLabel: string;
  stay?: MyStayCardData;
  preferences?: string[];
};

export function ActiveBookingHolds({ holds, featured = false }: { holds: Hold[]; featured?: boolean }) {
  const router = useRouter();
  const dialogs = useActionDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [released, setReleased] = useState<string[]>([]);
  const visible = holds.filter((hold) => !released.includes(hold.token));
  useEffect(() => {
    if (!holds.length) return;
    const remaining = Math.min(...holds.map((hold) => new Date(hold.expiresAt).getTime())) - Date.now();
    const timer = setTimeout(() => router.refresh(), Math.max(0, remaining) + 200);
    return () => clearTimeout(timer);
  }, [holds, router]);
  if (!visible.length) return null;

  async function release(hold: Hold) {
    const confirmed = await dialogs.askConfirm({
      title: "Release this room hold?",
      message: "The room will become available for other guests to book.",
      confirmText: "Release hold",
      cancelText: "Keep hold",
      variant: "danger",
    });
    if (!confirmed) return;
    setBusy(hold.token);
    setError("");
    try {
      const response = await fetchPublic(`/api/booking/holds/${hold.token}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await readResponse(response).catch(() => ({}));
        setError(userMessage(body.error, "We couldn't confirm whether the hold was released. Refresh your bookings to check its status."));
        if (response.status === 409) router.refresh();
        return;
      }
      setReleased((tokens) => [...tokens, hold.token]);
      router.refresh();
    } catch {
      setError("We couldn't confirm whether the hold was released. Refresh your bookings to check its status.");
    } finally {
      setBusy(null);
    }
  }

  if (featured) return <section className="my-stay-holds" aria-label="Bookings in progress">
    {visible.map((hold) => hold.stay && <MyStayCard key={hold.token} stay={hold.stay}>
      <button type="button" className="my-stay-release" disabled={busy !== null} onClick={() => void release(hold)}>{busy === hold.token ? "Releasing…" : "Release hold"}</button>
    </MyStayCard>)}
    {error && <p role="alert">{error}</p>}{dialogs.view}
  </section>;

  return (
    <section className="customer-active-holds" aria-label="Bookings in progress">
      <h2>Bookings in progress</h2>
      <ul>
        {visible.map((hold) => (
          <li key={hold.token}>
            <div>
              <h3>{hold.roomType}{hold.roomNumber ? ` · Room ${hold.roomNumber}` : ""}</h3>
              <p>{hold.dates} · Held until <time dateTime={hold.expiresAt}>{hold.expiryLabel}</time> (hotel time)</p>
              {Boolean(hold.preferences?.length) && <details><summary>Saved preferences ({hold.preferences!.length})</summary><p>Saved; subject to confirmation. Requests are sent to hotel teams once your stay is confirmed.</p><ul>{hold.preferences!.map((preference, index) => <li key={index}>{preference}</li>)}</ul></details>}
            </div>
            <div className="customer-active-hold-actions">
              <Link className="btn btn-accent" href={`/booking/review/${hold.token}`}>Resume booking <ArrowRight size={15} aria-hidden="true" /></Link>
              <button type="button" className="btn btn-soft" disabled={busy !== null} onClick={() => void release(hold)}>
                {busy === hold.token ? "Releasing…" : "Release hold"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      {dialogs.view}
    </section>
  );
}
