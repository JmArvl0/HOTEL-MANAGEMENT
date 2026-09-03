"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import "./haven-loader.css";

type Variant = "fullscreen" | "inline";

export function HavenLoader({
  variant = "fullscreen",
  label = "Preparing your stay",
  minShowMs = 900,
  delayMs = 240,
}: {
  variant?: Variant;
  label?: string;
  minShowMs?: number;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(showTimer);
  }, [delayMs]);

  // auto-dismiss for inline demo; fullscreen is controlled by Suspense unmount
  useEffect(() => {
    if (variant !== "inline" || !visible) return;
    const t = window.setTimeout(() => setLeaving(true), minShowMs);
    return () => window.clearTimeout(t);
  }, [visible, variant, minShowMs]);

  if (!visible) return null;

  return (
    <div
      className={`haven-loader haven-loader--${variant} ${leaving ? "is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="haven-loader__bg" aria-hidden="true" />
      <div className="haven-loader__grain" aria-hidden="true" />

      <div className="haven-loader__card" aria-hidden="true">
        <div className="haven-loader__mark">
          <span className="haven-loader__ring" />
          <span className="haven-loader__ring haven-loader__ring--gold" />
          <span className="haven-loader__core">
            <Sparkles size={18} />
          </span>
          <span className="haven-loader__orbit" />
        </div>

        <div className="haven-loader__word" aria-hidden="true">
          {"HAVEN".split("").map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 70}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="haven-loader__sub">HOTEL & RESIDENCES</p>
        <p className="haven-loader__label">{label}</p>

        <div className="haven-loader__progress" aria-hidden="true">
          <span className="haven-loader__bar" />
          <span className="haven-loader__shimmer" />
        </div>

        <span className="haven-loader__keyline" aria-hidden="true">
          <span />
        </span>
      </div>

      <span className="sr-only">{label} — please wait</span>
    </div>
  );
}

/** Use in layout for the very first paint (auto-hides after ~1.1s). Replace with app/loading.tsx Suspense for route loads. */
export function HavenInitialLoader() {
  const [done, setDone] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setHiding(true), 980);
    const t2 = window.setTimeout(() => setDone(true), 1380);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (done) return null;
  return (
    <div className={`haven-initial ${hiding ? "is-hiding" : ""}`} aria-hidden={done} role="status" aria-label="Haven loading">
      <HavenLoader variant="fullscreen" label="Opening Haven" />
    </div>
  );
}
