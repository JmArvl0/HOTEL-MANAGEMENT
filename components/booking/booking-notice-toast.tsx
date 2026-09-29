"use client";
// Inline booking notice with toast-card info function: same info look,
// auto-dismiss after 6s (TOAST_DURATION.info), × dismiss, pause on hover/focus.
import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";

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
  const pause = () => { clear(); setRemaining((r) => Math.max(r - (Date.now() - startedAt.current), 0)); };
  const resume = () => {
    clear();
    startedAt.current = Date.now();
    timer.current = setTimeout(() => setVisible(false), remaining);
  };

  if (!visible) return null;
  return (
    <div className="toast-card info toast-card-static" role="status"
      onMouseEnter={pause} onMouseLeave={resume}
      onFocusCapture={pause} onBlurCapture={resume}>
      <span className="toast-icon"><Info size={17} aria-hidden="true" /></span>
      <div className="toast-copy"><strong>{text}</strong></div>
      <button type="button" className="toast-dismiss" aria-label={`Dismiss: ${text}`} onClick={() => setVisible(false)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
