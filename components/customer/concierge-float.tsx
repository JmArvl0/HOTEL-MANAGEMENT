"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import GuestAiConciergePanel from "@/components/customer/guest-ai-concierge-panel";

/**
 * Floating virtual-concierge widget. Mounted once in CustomerShell so it
 * follows the guest across every module. Opening mounts a fresh
 * GuestAiConciergePanel; closing unmounts it, resetting the thread.
 */
export default function ConciergeFloat() {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`#${CSS.escape(panelId)} input`)?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open, panelId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <div className="concierge-float">
      {open && (
        <section aria-label="HAVEN virtual concierge" aria-modal="false" className="concierge-float-card" id={panelId} role="dialog">
          <header className="concierge-float-head">
            <span className="concierge-float-title">
              <Sparkles size={16} aria-hidden="true" />
              <strong>Ask HAVEN</strong>
            </span>
            <span className="concierge-float-actions">
              <button type="button" aria-label="Close chat panel" onClick={() => { setOpen(false); launcherRef.current?.focus(); }}>
                <X size={16} aria-hidden="true" />
              </button>
            </span>
          </header>
          <div className="concierge-float-body">
            <GuestAiConciergePanel />
          </div>
        </section>
      )}
      <button
        type="button"
        ref={launcherRef}
        className="concierge-float-launcher"
        aria-expanded={open}
        aria-label={open ? "Close concierge chat" : "Chat with HAVEN concierge"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
      </button>
    </div>
  );
}
