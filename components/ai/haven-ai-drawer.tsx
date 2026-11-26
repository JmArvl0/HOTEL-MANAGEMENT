"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { placementForRole } from "@/lib/ai/placement-policy";
import type { Role } from "@/lib/types";
import "./placement-preview-drawer.css";
import { useAiTogglePosition } from "./use-ai-toggle-position";

type Fact = { id: string; label: string; display: string; basis: "FACT" | "PREDICTION"; source: string; asOf: string; note?: string };
type PlacementData = { module: string; purpose: string; description: string; facts: Fact[]; state: "current" | "stale" | "absent" | "unavailable"; recommendation: string | null; analyzedAt?: string | null };
const ROLE_NAMES: Partial<Record<Role, string>> = { front_desk: "Front Desk", housekeeping: "Housekeeping", maintenance: "Maintenance", accounting: "Accounting", manager: "Manager", owner: "Owner", admin: "System Administrator" };

function SummaryPeek({ purpose, state, open }: { purpose: string; state: PlacementData["state"]; open: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (open || dismissed) return null;
  return <div className="haven-ai-placement-peek">
    <div className="haven-ai-placement-peek-head"><strong>HAVEN AI</strong><button type="button" className="haven-ai-placement-peek-close" aria-label="Dismiss HAVEN AI summary for this module" onClick={() => setDismissed(true)}><X size={14} aria-hidden="true" /></button></div>
    <span>{state === "current" ? "Guidance ready" : state === "stale" ? "Review updated facts" : state === "unavailable" ? "Guidance unavailable" : "Hotel focus"} · {purpose}</span>
  </div>;
}

export default function HavenAiDrawer({ role, module, open: controlledOpen, onOpenChange }: { role: Role; module: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const placement = placementForRole(role, module);
  const [headerBottom, setHeaderBottom] = useState(60);
  const [data, setData] = useState<PlacementData | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const panelId = useId();
  const { toggleRef, top: toggleTop, consumeDragClick, ...dragHandlers } = useAiTogglePosition(Boolean(placement));
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!placement) return;
    const controller = new AbortController();
    fetch(`/api/ai/placement?module=${encodeURIComponent(module)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Guidance is unavailable for this account.");
        return (await response.json()).data as PlacementData;
      })
      .then((value) => { if (!controller.signal.aborted) { setData(value); setLoadError(""); } })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setLoadError("Current guidance could not be loaded. Hotel modules remain available."); } });
    return () => controller.abort();
  }, [role, module, placement]);

  useEffect(() => {
    if (!placement) return;
    const header = document.querySelector<HTMLElement>(".app-shell .app-header");
    if (!header) return;
    const update = () => setHeaderBottom(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (onOpenChange) onOpenChange(false); else setInternalOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, toggleRef]);

  if (!placement) return null;
  const currentData = data?.module === module ? data : null;
  const state = currentData?.state ?? "absent";
  const purpose = currentData?.purpose ?? placement.purpose;
  const description = currentData?.description ?? placement.description;

  function changeOpen(next: boolean) { if (onOpenChange) onOpenChange(next); else setInternalOpen(next); }
  function closePanel() { changeOpen(false); toggleRef.current?.focus(); }
  async function ask() {
    if (busy || !question.trim()) return;
    setBusy(true); setAnswer("");
    try {
      const response = await fetch("/api/ai/placement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, question: question.trim() }) });
      const body = await response.json();
      setAnswer(response.ok ? String(body.data?.answer ?? "No answer was returned.") : String(body.error ?? "HAVEN AI is unavailable."));
    } catch { setAnswer("HAVEN AI is unavailable. Check the hotel records directly."); }
    finally { setBusy(false); }
  }

  return <div className="haven-ai-placement-preview" data-open={open} style={{ "--haven-ai-header-bottom": `${headerBottom}px`, ...(toggleTop === null ? {} : { "--haven-ai-toggle-top": `${toggleTop}px` }) } as CSSProperties}>
    <SummaryPeek key={`${role}:${module}`} purpose={purpose} state={state} open={open} />
    <span id={`${panelId}-drag-help`} className="haven-ai-placement-drag-help">Drag vertically to move this button. Arrow keys also reposition it.</span>
    <button ref={toggleRef} type="button" className="haven-ai-placement-toggle" aria-label={open ? "Close HAVEN AI" : "Open HAVEN AI"} aria-describedby={`${panelId}-drag-help`} aria-controls={panelId} aria-expanded={open} {...dragHandlers} onClick={() => { if (consumeDragClick()) return; if (open) closePanel(); else changeOpen(true); }}><Sparkles size={18} aria-hidden="true" /><span>AI</span></button>
    {open && <aside id={panelId} className="haven-ai-placement-panel" role="dialog" aria-modal="false" aria-labelledby={`${panelId}-title`}>
      <header className="haven-ai-placement-header"><div><span className="haven-ai-placement-eyebrow">Hotel assistance</span><h2 id={`${panelId}-title`}>HAVEN AI</h2><p>{ROLE_NAMES[role] ?? role} · {module}</p></div><button ref={closeRef} type="button" className="haven-ai-placement-icon-button" aria-label="Close HAVEN AI" onClick={closePanel}><X size={18} aria-hidden="true" /></button></header>
      <div className="haven-ai-placement-scroll">
        <p className="haven-ai-placement-disclosure">AI guidance supports hotel work. Verify decisions in HAVEN; this assistant cannot approve, check in, issue, or change records.</p>
        <section className="haven-ai-placement-block" aria-label="Module purpose"><span className="haven-ai-placement-eyebrow">In this module</span><h3>{purpose}</h3><p>{description}</p></section>
        <section className="haven-ai-placement-block" aria-label="Current hotel facts"><span className="haven-ai-placement-eyebrow">HAVEN facts</span>{currentData?.facts.length ? <ul className="haven-ai-placement-facts">{currentData.facts.map((fact) => <li key={fact.id}><strong>{fact.label}: {fact.display}</strong><small>{fact.basis} · {fact.source}</small></li>)}</ul> : <p className="haven-ai-placement-empty">No scoped facts are available for this module. Open its records for the current state.</p>}</section>
        <section className="haven-ai-placement-block" aria-label="Stored AI guidance"><div className="haven-ai-placement-block-head"><span className="haven-ai-placement-eyebrow">AI recommendation</span><span className={`haven-ai-placement-state haven-ai-placement-state-${state}`}>{state === "current" ? "Current" : state === "stale" ? "Needs review" : state === "unavailable" ? "Unavailable" : "No stored result"}</span></div>{currentData?.recommendation ? <><p className="haven-ai-placement-guidance">{currentData.recommendation}</p><p className="haven-ai-placement-source">Analyzed {currentData.analyzedAt ? new Date(currentData.analyzedAt).toLocaleString() : "previously"}</p></> : <p className="haven-ai-placement-empty">No AI recommendation is stored for this module yet. Opening this page does not generate one.</p>}{loadError && <p className="haven-ai-placement-caution">{loadError}</p>}</section>
        <section className="haven-ai-placement-block" aria-label="Manual assistance"><span className="haven-ai-placement-eyebrow">Complex case</span><button type="button" className="haven-ai-placement-ask-toggle" aria-expanded={askOpen} onClick={() => setAskOpen((value) => !value)}><MessageCircle size={17} aria-hidden="true" /> Ask HAVEN AI</button>{askOpen && <div className="haven-ai-placement-ask"><label htmlFor={`${panelId}-question`}>Question about this module</label><textarea id={`${panelId}-question`} value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={600} placeholder="What should I check for this hotel task? Do not include personal details." /><button type="button" className="haven-ai-placement-submit" onClick={() => void ask()} disabled={busy || !question.trim()}>{busy ? "Asking…" : "Send question"}</button>{answer && <p className="haven-ai-placement-answer" role="status">{answer}</p>}</div>}</section>
      </div>
    </aside>}
  </div>;
}
