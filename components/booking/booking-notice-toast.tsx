"use client";
// Booking notice with toast-card info function: same info look, auto-dismiss
// after 6s (TOAST_DURATION.info), × dismiss, pause on hover/focus. It floats in
// the shared top-centered notice layer instead of rendering in place, so a
// notice raised inside .booking-search.compact never takes a cell of the search
// grid (and page-level notices never push the results down).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

// Every notice shares one layer, so notices raised together stack instead of
// overlapping. It is a direct <body> child — the same trick the shared
// ToastStack and Modal use — which also stops a transformed or filtered
// ancestor from becoming its containing block and clipping the card.
const LAYER_ID = "haven-booking-notice-layer";

function currentLayer() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(LAYER_ID);
  if (existing) return existing;
  const layer = document.createElement("div");
  layer.id = LAYER_ID;
  layer.className = "toast-layer";
  document.body.appendChild(layer);
  return layer;
}

// The layer is created once and keeps its identity for the life of the page,
// so there is nothing to notify subscribers about.
const subscribeLayer = () => () => {};

export function BookingNoticeToast({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  const [remaining, setRemaining] = useState(6000);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => {
    startedAt.current = Date.now();
    clear();
    timer.current = setTimeout(() => setVisible(false), remaining);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Portals are not server-rendered, so the server snapshot is null and the
  // notice joins the page right after hydration: nothing is ever server-
  // rendered where the caller placed it.
  const layer = useSyncExternalStore(subscribeLayer, currentLayer, () => null);
  const pause = () => { clear(); setRemaining((r) => Math.max(r - (Date.now() - startedAt.current), 0)); };
  const resume = () => {
    clear();
    startedAt.current = Date.now();
    timer.current = setTimeout(() => setVisible(false), remaining);
  };

  if (!visible || !layer) return null;
  return createPortal(
    <div className="toast-card info toast-card-static" role="status"
      onMouseEnter={pause} onMouseLeave={resume}
      onFocusCapture={pause} onBlurCapture={resume}>
      <span className="toast-icon"><Info size={17} aria-hidden="true" /></span>
      <div className="toast-copy"><strong>{text}</strong></div>
      <button type="button" className="toast-dismiss" aria-label={`Dismiss: ${text}`} onClick={() => setVisible(false)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    layer,
  );
}
