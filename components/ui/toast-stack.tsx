"use client";
// Transient in-app toast stack — the "new event just happened" surface of the
// staff notification triad (sidebar badge = pending workload, bell = live
// alerts, toast = momentary new-event alert). A toast never carries state of
// its own: dismissing one removes only the popup; the bell and the module
// badge keep showing the underlying work until it is resolved.
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { playNotificationTone } from "@/lib/notification-sound";

export type ToastTone = "info" | "success" | "warning" | "error";
export interface ToastOptions {
  id?: string;
  title: string;
  detail?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss; 0 keeps the toast until dismissed manually. */
  duration?: number;
  /** Skip the notification sound (e.g. initial-load catch-up toasts). */
  silent?: boolean;
}

interface ActiveToast extends ToastOptions {
  id: string;
  remaining: number;
  startedAt: number;
}

export const TOAST_DURATION: Record<ToastTone, number> = { info: 6000, success: 6000, warning: 8000, error: 8000 };
const MAX_VISIBLE = 3;

const TONE_ICONS: Record<ToastTone, React.ElementType> = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: TriangleAlert };

export interface ToastController {
  toasts: ActiveToast[];
  push: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}

// Auto-dismiss timer that pauses while the user hovers or focuses the toast,
// so a toast being read never vanishes mid-read. Timers live outside React
// state in a ref map; a paused toast stores its remaining time and restarts
// on resume.
export function useToasts(): ToastController {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const active = useRef<ActiveToast[]>([]);
  const queue = useRef<ToastOptions[]>([]);
  const known = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const expire = useRef<(id: string) => void>(() => {});

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);

  const arm = useCallback((toast: ActiveToast) => {
    clearTimer(toast.id);
    if (toast.remaining <= 0) return; // duration 0 = manual dismiss only
    toast.startedAt = Date.now();
    timers.current.set(toast.id, setTimeout(() => expire.current(toast.id), toast.remaining));
  }, [clearTimer]);

  const push = useCallback((options: ToastOptions) => {
    const id = options.id ?? crypto.randomUUID();
    if (known.current.has(id)) return;
    known.current.add(id);
    if (!options.silent) playNotificationTone(options.tone ?? "info");
    const toast: ActiveToast = { ...options, id, remaining: options.duration ?? TOAST_DURATION[options.tone ?? "info"], startedAt: 0 };
    if (active.current.length < MAX_VISIBLE) {
      active.current = [...active.current, toast]; arm(toast); setToasts(active.current);
    } else queue.current.push({ ...options, id });
  }, [arm]);

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    known.current.delete(id);
    if (!active.current.some(toast => toast.id === id)) {
      queue.current = queue.current.filter(toast => toast.id !== id);
      return;
    }
      const next = active.current.filter((toast) => toast.id !== id);
      // Retiring a toast frees a stack slot — promote the oldest queued one.
      const queued = queue.current.shift();
      if (queued) {
        const promoted: ActiveToast = { ...queued, id: queued.id ?? crypto.randomUUID(), remaining: queued.duration ?? TOAST_DURATION[queued.tone ?? "info"], startedAt: 0 };
        arm(promoted);
        active.current = [...next, promoted];
      } else {
        active.current = next;
      }
      setToasts(active.current);
  }, [arm, clearTimer]);
  useEffect(() => { expire.current = dismiss; }, [dismiss]);

  const pause = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    clearTimer(id);
    active.current = active.current.map((toast) => toast.id === id ? { ...toast, remaining: Math.max(toast.remaining - (Date.now() - toast.startedAt), 0) } : toast);
    setToasts(active.current);
  }, [clearTimer]);

  const resume = useCallback((id: string) => {
    const toast = active.current.find(toast => toast.id === id);
    if (toast) arm(toast);
  }, [arm]);

  return { toasts, push, dismiss, pause, resume };
}

export function ToastStack({ controller }: { controller: ToastController }) {
  const { toasts, dismiss, pause, resume } = controller;
  return <div className="toast-stack" role="region" aria-label="Notifications">
    {toasts.map((toast) => {
      const Icon = TONE_ICONS[toast.tone ?? "info"];
      return <div className={`toast-card ${toast.tone ?? "info"}`} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}
        onMouseEnter={() => pause(toast.id)} onMouseLeave={() => resume(toast.id)}
        onFocusCapture={() => pause(toast.id)} onBlurCapture={() => resume(toast.id)}>
        <span className="toast-icon"><Icon size={17} aria-hidden="true"/></span>
        <div className="toast-copy">
          <strong>{toast.title}</strong>
          {toast.detail && <small>{toast.detail}</small>}
          {toast.actionLabel && toast.onAction && <button type="button" className="toast-action" onClick={() => { toast.onAction?.(); dismiss(toast.id); }}>{toast.actionLabel}</button>}
        </div>
        <button type="button" className="toast-dismiss" aria-label={`Dismiss: ${toast.title}`} onClick={() => dismiss(toast.id)}><X size={14} aria-hidden="true"/></button>
      </div>;
    })}
  </div>;
}
