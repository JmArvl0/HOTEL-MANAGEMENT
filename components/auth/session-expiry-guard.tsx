"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { Clock3, LogIn } from "lucide-react";

const STATUS_SYNC_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 60_000;

export type SessionCountdownTone = "normal" | "warning" | "critical";

export function formatSessionCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pair = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pair(hours)}:${pair(minutes)}:${pair(seconds)}` : `${pair(minutes)}:${pair(seconds)}`;
}

export function sessionCountdownTone(remainingMs: number): SessionCountdownTone {
  if (remainingMs <= 60_000) return "critical";
  if (remainingMs <= 5 * 60_000) return "warning";
  return "normal";
}

export function sessionCountdownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "",
    `${seconds} second${seconds === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return `Session expires in ${parts.join(" and ")}.`;
}

const deadlineFromBody = (body: unknown) => {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: { expiresAt?: unknown } }).data;
  return typeof data?.expiresAt === "string" && Number.isFinite(Date.parse(data.expiresAt)) ? data.expiresAt : null;
};

export function SessionExpiryGuard({ expiresAt }: { expiresAt?: string | null }) {
  const [deadline, setDeadline] = useState(expiresAt ?? null);
  const [now, setNow] = useState(() => Date.now());
  const signInRef = useRef<HTMLButtonElement>(null);
  const lastActivitySentAt = useRef(0);
  const remaining = deadline ? Date.parse(deadline) - now : Number.POSITIVE_INFINITY;
  const expired = Boolean(deadline) && remaining <= 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const response = await fetch("/api/auth/session-status", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) { setDeadline(new Date(0).toISOString()); return; }
        const next = deadlineFromBody(await response.json().catch(() => null));
        if (next) setDeadline(next);
      } catch { /* A network failure never invents a new deadline. */ }
    };
    const timer = window.setInterval(sync, STATUS_SYNC_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    let active = true;
    const reportActivity = async () => {
      const occurredAt = Date.now();
      if (expired || occurredAt - lastActivitySentAt.current < ACTIVITY_THROTTLE_MS) return;
      lastActivitySentAt.current = occurredAt;
      try {
        const response = await fetch("/api/auth/session-status", { method: "POST" });
        if (!active) return;
        if (response.status === 401) { setDeadline(new Date(0).toISOString()); return; }
        const next = deadlineFromBody(await response.json().catch(() => null));
        if (next) setDeadline(next);
      } catch { /* Keep the last server-provided deadline when offline. */ }
    };
    const onPointer = () => { void reportActivity(); };
    const onKey = (event: KeyboardEvent) => { if (!event.metaKey && !event.ctrlKey && !event.altKey) void reportActivity(); };
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => { active = false; document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [expired]);

  useEffect(() => {
    if (!expired) return;
    const previousOverflow = document.body.style.overflow;
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      signInRef.current?.focus();
    };
    document.body.style.overflow = "hidden";
    signInRef.current?.focus();
    document.addEventListener("keydown", keepFocusInDialog);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocusInDialog);
    };
  }, [expired]);

  if (!deadline) return null;
  const tone = sessionCountdownTone(remaining);
  return <>
    <span className={`session-countdown session-countdown--${tone}`} aria-label={sessionCountdownLabel(remaining)} aria-live="off">
      <Clock3 size={14} aria-hidden="true" />
      <span aria-hidden="true" suppressHydrationWarning>{formatSessionCountdown(remaining)}</span>
    </span>
    {expired && typeof document !== "undefined" ? createPortal(
      <div className="session-expired-backdrop">
        <section className="session-expired-dialog" role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title" aria-describedby="session-expired-description">
          <span className="session-expired-icon"><Clock3 aria-hidden="true" /></span>
          <p className="eyebrow">Account security</p>
          <h2 id="session-expired-title">Session expired</h2>
          <p id="session-expired-description">Your secure session has ended. Sign in again to continue using HAVEN.</p>
          <button ref={signInRef} type="button" className="btn btn-accent" onClick={() => void signOut({ callbackUrl: "/login" })}>
            <LogIn size={16} aria-hidden="true" /> Sign in again
          </button>
        </section>
      </div>, document.body) : null}
  </>;
}
