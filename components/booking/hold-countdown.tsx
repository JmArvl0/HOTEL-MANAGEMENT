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
  return <p className="hold-countdown" aria-live="polite"><Clock3 size={15}/>Room held for <strong>{label}</strong></p>;
}
