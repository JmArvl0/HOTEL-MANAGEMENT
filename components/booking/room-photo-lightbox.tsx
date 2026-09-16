"use client";
// Shared full-screen room-photo viewer (Find a Room cards, the View Details
// gallery, and anywhere else room-type photography appears). One viewer, no
// per-surface copies: triggers own only their open/index state and hand the
// authoritative gallery (DB `photo_urls` first, existing order kept) down.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Minus, Plus, X, ZoomIn } from "lucide-react";

export const LIGHTBOX_ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2];
const MAX_ZOOM_INDEX = LIGHTBOX_ZOOM_LEVELS.length - 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface RoomPhotoLightboxProps {
  photos: string[];
  roomName: string;
  /** null = closed. Controlled so a gallery (card, details modal) stays in sync. */
  index: number | null;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function RoomPhotoLightbox({ photos, roomName, index, onClose, onIndexChange }: RoomPhotoLightboxProps) {
  const open = index !== null && photos.length > 0;
  const shown = open ? clamp(index as number, 0, photos.length - 1) : 0;
  const [zoomLevel, setZoomLevel] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const natural = useRef({ w: 0, h: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoom = LIGHTBOX_ZOOM_LEVELS[zoomLevel];

  // Latest-callback ref: parents pass inline arrows, so reading them through a
  // ref keeps the document-level handlers stable (same pattern as Modal).
  const latest = useRef({ onClose, onIndexChange });
  useEffect(() => { latest.current = { onClose, onIndexChange }; });

  // Fresh photo (or fresh open) resets the inspection state. Deliberate
  // reset-on-change, not external-store sync.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- zoom/pan/failure must clear when the shown photo changes
  useEffect(() => { setZoomLevel(0); setPan({ x: 0, y: 0 }); setFailed(false); }, [shown, open]);

  const step = useCallback((delta: number) => {
    if (photos.length < 2) return;
    latest.current.onIndexChange?.((shown + delta + photos.length) % photos.length);
  }, [photos.length, shown]);

  // Open/close lifecycle: opener capture, scroll lock (restores the PRIOR
  // value, so closing above an open details modal keeps it locked), focus in,
  // focus back to the exact trigger on close.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      if (opener.current && opener.current.isConnected) opener.current.focus();
    };
  }, [open ]);

  // Capture-phase keys: Escape/Arrows/Tab are swallowed here so the details
  // modal underneath (bubble-phase listener) never also reacts, and Tab can
  // never leave the viewer while it is open (same trap vocabulary as Modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); latest.current.onClose(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); step(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); step(1); }
      else if (event.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) { event.preventDefault(); event.stopPropagation(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); event.stopPropagation(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); event.stopPropagation(); first.focus(); }
        else { event.stopPropagation(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, step]);

  // Drag-to-pan while zoomed (pointer events cover mouse + touch; no gesture dep).
  const clampPan = useCallback((x: number, y: number) => {
    const stage = stageRef.current;
    const { w, h } = natural.current;
    if (!stage || !w || !h) {
      const m = 160 * (zoom - 1);
      return { x: clamp(x, -m, m), y: clamp(y, -m, m) };
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const fit = Math.min(rect.width / w, rect.height / h);
    const mx = Math.max(0, (w * fit * zoom - rect.width) / 2);
    const my = Math.max(0, (h * fit * zoom - rect.height) / 2);
    return { x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }, [zoom]);

  useEffect(() => {
    if (!open) return;
    const move = (event: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setPan(clampPan(d.panX + event.clientX - d.x, d.panY + event.clientY - d.y));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [open, clampPan]);

  if (!open) return null;
  const src = photos[shown];

  const beginPan = (event: React.PointerEvent) => {
    if (zoom <= 1 || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };
  const toggleZoom = () => {
    setZoomLevel((level) => (level === 0 ? MAX_ZOOM_INDEX : 0));
    setPan({ x: 0, y: 0 });
  };

  return createPortal(
    <div ref={dialogRef} className="room-lightbox" role="dialog" aria-modal="true" aria-label={`${roomName} photo gallery`}>
      <div className="room-lightbox-backdrop" onClick={() => latest.current.onClose()} />
      <div className="room-lightbox-top">
        <p>{roomName} · Photo {shown + 1} of {photos.length}</p>
        <button ref={closeRef} type="button" className="room-lightbox-close" aria-label="Close photo viewer" onClick={() => latest.current.onClose()}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="room-lightbox-arrow room-lightbox-prev" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => step(-1)}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <div
        ref={stageRef}
        className={`room-lightbox-stage${zoom > 1 ? " is-zoomed" : ""}`}
        onPointerDown={beginPan}
        onDoubleClick={toggleZoom}
      >
        {failed || src.trim() === "" ? (
          <div className="room-lightbox-fallback" role="img" aria-label={`${roomName} photo unavailable`}>
            <p>This photo couldn&apos;t be loaded.</p>
            <small>Use Previous / Next to keep browsing.</small>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- plain <img>: same CDN-allowlist rationale as the details gallery */
          <img
            key={src}
            src={src}
            alt={`${roomName} room photo ${shown + 1}`}
            draggable={false}
            onError={() => setFailed(true)}
            onLoad={(event) => { natural.current = { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight }; }}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        )}
      </div>
      <button type="button" className="room-lightbox-arrow room-lightbox-next" aria-label="Next photo" disabled={photos.length < 2} onClick={() => step(1)}>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      <div className="room-lightbox-zoom" role="group" aria-label="Photo zoom">
        <button type="button" aria-label="Zoom out" disabled={zoomLevel === 0} onClick={() => setZoomLevel((level) => Math.max(0, level - 1))}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Reset zoom" onClick={() => { setZoomLevel(0); setPan({ x: 0, y: 0 }); }}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" disabled={zoomLevel === MAX_ZOOM_INDEX} onClick={() => setZoomLevel((level) => Math.min(MAX_ZOOM_INDEX, level + 1))}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Clickable photo overlay for server-rendered cards: owns its open/index state
 *  so the card itself stays a server component. Lives inside the image cell
 *  only — the card copy and booking CTAs sit outside it and are unaffected. */
export function RoomPhotoTrigger({ photos, roomName, className }: { photos: string[]; roomName: string; className?: string }) {
  const [index, setIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={className ?? "room-photo-open"}
        aria-label={`Open ${roomName} photo gallery`}
        onClick={() => setIndex(0)}
      >
        <span className="room-photo-open-hint" aria-hidden="true"><ZoomIn size={15} /> View photo</span>
      </button>
      <RoomPhotoLightbox photos={photos} roomName={roomName} index={index} onClose={() => setIndex(null)} onIndexChange={setIndex} />
    </>
  );
}

/** Details-gallery trigger helper: wraps gallery imagery that already lives in
 *  a client component. */
export function RoomPhotoFigure({ photos, roomName, index, onOpen, className, label, children }: {
  photos: string[];
  roomName: string;
  index: number;
  onOpen: (index: number) => void;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  if (photos.length === 0) return <>{children}</>;
  return (
    <button type="button" className={className} aria-label={label ?? `Open ${roomName} photo ${index + 1} fullscreen`} onClick={() => onOpen(index)}>
      {children}
    </button>
  );
}
