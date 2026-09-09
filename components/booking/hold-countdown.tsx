"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

export function HoldCountdown({ expiresAt, recoveryUrl }: { expiresAt: string; recoveryUrl: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));
  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, Date.parse(expiresAt) - Date.now());
      setRemaining(next);
      if (next === 0) router.replace(recoveryUrl);
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [expiresAt, recoveryUrl, router]);
  const seconds = Math.ceil(remaining / 1000);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const urgent = seconds > 0 && seconds < 300;
  // Announce only on minute (and urgency) boundaries, not every tick
  const minutesLeft = Math.ceil(seconds / 60);
  const announcement = seconds === 0 ? "Room hold expired"
    : minutesLeft <= 5 ? `Room held for ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}${urgent ? " — completing payment soon is recommended" : ""}`
    : "";
  return <p className="hold-countdown" data-urgent={urgent ? "true" : undefined}><Clock3 size={15} aria-hidden="true"/><span aria-hidden="true">Room held for <strong>{label}</strong></span><span className="sr-only" aria-live="polite">{announcement}</span></p>;
}
