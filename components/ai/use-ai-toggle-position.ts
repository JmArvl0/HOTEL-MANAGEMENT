"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const STORAGE_KEY = "haven-ai-toggle-top";
const EDGE_GAP = 12;
const DRAG_THRESHOLD = 6;

function limits(button: HTMLButtonElement) {
  const header = document.querySelector<HTMLElement>(".app-shell .app-header");
  const footer = document.querySelector<HTMLElement>(".app-shell > footer, .app-shell > .workspace > footer, .app-shell .app-footer");
  const viewportBottom = window.visualViewport?.height ?? window.innerHeight;
  const footerRect = footer?.getBoundingClientRect();
  const bottom = footerRect && footerRect.bottom > footerRect.top && footerRect.top < viewportBottom && footerRect.bottom > 0
    ? Math.min(viewportBottom, footerRect.top)
    : viewportBottom;
  const height = button.getBoundingClientRect().height || 58;
  const max = Math.max(0, Math.floor(bottom - height - EDGE_GAP));
  const min = Math.min(max, Math.max(0, Math.ceil((header?.getBoundingClientRect().bottom ?? 0) + EDGE_GAP)));
  return { min, max };
}

/** One per-device vertical position shared by the live and sample AI toggles. */
export function useAiTogglePosition(active = true) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<number | null>(null);
  const preferredRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startTop: number; moved: boolean; repositioned: boolean } | null>(null);
  const ignoreClickRef = useRef(false);
  const [top, setTop] = useState<number | null>(null);

  const place = useCallback((wanted: number, save = false) => {
    const button = toggleRef.current;
    if (!button) return;
    const { min, max } = limits(button);
    const next = Math.min(max, Math.max(min, Math.round(wanted)));
    topRef.current = next;
    setTop((current) => current === next ? current : next);
    if (save) {
      preferredRef.current = next;
      try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* local preference is optional */ }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const button = toggleRef.current;
    if (!button) return;
    const update = () => {
      let saved: number | null = null;
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        if (value !== null && Number.isFinite(Number(value))) saved = Number(value);
      } catch { /* use the current position */ }
      const preferred = preferredRef.current ?? saved ?? button.getBoundingClientRect().top;
      preferredRef.current = preferred;
      place(preferred);
    };
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const header = document.querySelector<HTMLElement>(".app-shell .app-header");
    const footer = document.querySelector<HTMLElement>(".app-shell > footer, .app-shell > .workspace > footer, .app-shell .app-footer");
    if (header) observer?.observe(header);
    if (footer) observer?.observe(footer);
    observer?.observe(button);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [active, place]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTop: event.currentTarget.getBoundingClientRect().top, moved: false, repositioned: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientY - drag.startY;
    if (Math.abs(distance) < DRAG_THRESHOLD) {
      if (Math.abs(event.clientX - drag.startX) >= DRAG_THRESHOLD) { drag.moved = true; event.preventDefault(); }
      return;
    }
    drag.moved = true;
    drag.repositioned = true;
    event.preventDefault();
    place(drag.startTop + distance);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.repositioned) place(topRef.current ?? drag.startTop, true);
    if (drag.moved) {
      ignoreClickRef.current = true;
      window.setTimeout(() => { ignoreClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const button = toggleRef.current;
    if (!button) return;
    const { min, max } = limits(button);
    const current = topRef.current ?? button.getBoundingClientRect().top;
    place(event.key === "Home" ? min : event.key === "End" ? max : current + (event.key === "ArrowDown" ? 24 : -24), true);
  }

  function consumeDragClick() {
    if (!ignoreClickRef.current) return false;
    ignoreClickRef.current = false;
    return true;
  }

  return { toggleRef, top, onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel: finishDrag, onKeyDown, consumeDragClick };
}
