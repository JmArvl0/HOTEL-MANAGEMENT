"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** "Go back" control: `to` navigates deterministically to a known step URL
 *  (booking flow pages); without it, returns to the previous page when the
 *  visitor arrived from this site, and falls back to `fallback` for direct
 *  visits/new tabs (search page hero). */
export function BackButton({ to, fallback = "/", label = "Go back", className = "" }: { to?: string; fallback?: string; label?: string; className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`booking-back ${className}`.trim()}
      onClick={() => {
        if (to) {
          router.push(to);
        } else if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
    >
      <span className="booking-back-icon" aria-hidden="true"><ArrowLeft size={14} /></span>
      <span>{label}</span>
    </button>
  );
}
