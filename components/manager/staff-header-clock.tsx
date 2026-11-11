"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true,
});

export default function StaffHeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = window.setTimeout(function updateClock() {
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(updateClock, 60_000 - current.getTime() % 60_000);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!now) return null;

  return (
    <time className="staff-header-clock" dateTime={now.toISOString()} title="Hotel local time (Asia/Manila)">
      <span><Clock3 size={14} aria-hidden="true" /> {dateFormat.format(now)}</span>{" "}
      <strong>{timeFormat.format(now)}</strong>
    </time>
  );
}
