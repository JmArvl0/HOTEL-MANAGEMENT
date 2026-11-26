"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, MessageCircle, Sparkles, X } from "lucide-react";
import type { Role } from "@/lib/types";
import "./placement-preview-drawer.css";
import { useAiTogglePosition } from "./use-ai-toggle-position";

export const AI_PLACEMENT_PREVIEW_KEY = "haven-ai-placement-preview";

type Placement = { name: string; purpose: string; description: string };
type PlacementMap = Partial<Record<Role, Placement[]>>;
type ResultState = "current" | "stale" | "absent" | "unavailable";

const ROLE_NAMES: Partial<Record<Role, string>> = {
  front_desk: "Front Desk",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  accounting: "Accounting",
  manager: "Manager",
  owner: "Owner",
  admin: "System Administrator",
};

const STATE_NAMES: Record<ResultState, string> = {
  current: "Sample ready",
  stale: "Sample needs review",
  absent: "No sample result",
  unavailable: "AI unavailable",
};

function sampleGuidance(module: string, role: Role, description: string) {
  if (module === "Bookings" && role === "front_desk") return "Review the reservation, room readiness, deposit, and QR context before choosing the next booking step.";
  if (module === "Guest Requests") return "Check the submitted request batch against the active catalog and eligibility rules. Any charged or uncertain item stays with staff.";
  if (module === "Approvals & Escalations" || module === "Owner Exceptions") return "Compare the stated reason, room status, policy, and exact eligible alternatives before the authorized decision.";
  if (module === "Housekeeping") return "Compare assigned work with upcoming arrivals and inspection status before choosing the next room task.";
  if (module === "Maintenance") return "Review severity, room impact, and prior work before deciding which order needs attention.";
  if (module === "Deposit Verification") return "Compare the booking obligation with permitted payment evidence; leave verification with Accounting.";
  if (module === "Lost & Found") return "Review custody and claim steps before any authorized release decision.";
  return description;
}

function DismissiblePeek({ open, resultState, purpose }: { open: boolean; resultState: ResultState; purpose: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (open || dismissed) return null;
  return <div className="haven-ai-placement-peek" role="status">
    <div className="haven-ai-placement-peek-head">
      <strong>HAVEN AI</strong>
      <button type="button" className="haven-ai-placement-peek-close" aria-label="Dismiss HAVEN AI summary for this module" onClick={() => setDismissed(true)}><X size={14} aria-hidden="true" /></button>
    </div>
    <span>{STATE_NAMES[resultState]} · {purpose}</span>
  </div>;
}

/** Sample-only placement layer. It never reads a hotel record or calls an AI endpoint. */
export default function PlacementPreviewDrawer({ role, module, onExit, open: controlledOpen, onOpenChange }: { role: Role; module: string; onExit?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [headerBottom, setHeaderBottom] = useState(60);
  const [placements, setPlacements] = useState<PlacementMap | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [resultState, setResultState] = useState<ResultState>("current");
  const [revision, setRevision] = useState(1);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const panelId = useId();
  const { toggleRef, top: toggleTop, consumeDragClick, ...dragHandlers } = useAiTogglePosition(enabled);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setEnabled(window.sessionStorage.getItem(AI_PLACEMENT_PREVIEW_KEY) === "1");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/prototypes/haven-ai-system-preview-data.json")
      .then((response) => response.ok ? response.json() as Promise<PlacementMap> : Promise.reject(new Error("Placement map unavailable")))
      .then((data) => { if (!cancelled) setPlacements(data); })
      .catch(() => { if (!cancelled) setPlacements({}); });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const header = document.querySelector<HTMLElement>(".app-shell .app-header");
    if (!header) return;
    const update = () => setHeaderBottom(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onOpenChange) onOpenChange(false); else setInternalOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, toggleRef]);

  if (!enabled) return null;

  const placement = placements?.[role]?.find((entry) => entry.name.toLowerCase() === module.toLowerCase());
  const purpose = placement?.purpose ?? "Contextual hotel guidance";
  const description = placement?.description ?? `Explain the authorized ${module} records and suggest the next review step for this account.`;
  const guidance = sampleGuidance(module, role, description);
  const hasResult = resultState === "current" || resultState === "stale";

  function changeOpen(next: boolean) { if (onOpenChange) onOpenChange(next); else setInternalOpen(next); }

  function closePanel() {
    changeOpen(false);
    toggleRef.current?.focus();
  }

  function ask() {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (/\b(code|program|script|essay|homework|recipe|poem|song|personal)\b/i.test(trimmed)) {
      setAnswer("Sample boundary: HAVEN AI is for hotel work in the current account. This request is outside that scope.");
    } else {
      setAnswer(`Sample answer for ${module}: ${guidance} Check the actual HAVEN record and policy before taking action. No record was read for this prototype answer.`);
    }
  }

  return (
    <div className="haven-ai-placement-preview" data-open={open} style={{ "--haven-ai-header-bottom": `${headerBottom}px`, ...(toggleTop === null ? {} : { "--haven-ai-toggle-top": `${toggleTop}px` }) } as CSSProperties}>
      <DismissiblePeek key={`${role}:${module}`} open={open} resultState={resultState} purpose={purpose} />
      <span id={`${panelId}-drag-help`} className="haven-ai-placement-drag-help">Drag vertically to move this button. Arrow keys also reposition it.</span>
      <button
        ref={toggleRef}
        type="button"
        className="haven-ai-placement-toggle"
        aria-label={open ? "Close HAVEN AI placement preview" : "Open HAVEN AI placement preview"}
        aria-describedby={`${panelId}-drag-help`}
        aria-controls={panelId}
        aria-expanded={open}
        {...dragHandlers}
        onClick={() => { if (consumeDragClick()) return; if (open) closePanel(); else changeOpen(true); }}
      ><Sparkles size={18} aria-hidden="true" /><span>AI</span></button>
      {open && <aside id={panelId} className="haven-ai-placement-panel" role="dialog" aria-modal="false" aria-labelledby={`${panelId}-title`}>
        <header className="haven-ai-placement-header">
          <div><span className="haven-ai-placement-eyebrow">Placement prototype</span><h2 id={`${panelId}-title`}>HAVEN AI</h2><p>{ROLE_NAMES[role] ?? role} · {module}</p></div>
          <button ref={closeRef} type="button" className="haven-ai-placement-icon-button" aria-label="Close AI preview" onClick={closePanel}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="haven-ai-placement-scroll">
          <p className="haven-ai-placement-disclosure">Sample AI content only. This drawer reads no hotel records, makes no Gemini call, and cannot approve or change anything.</p>
          <section className="haven-ai-placement-block" aria-label="Module purpose">
            <span className="haven-ai-placement-eyebrow">In this module</span>
            <h3>{purpose}</h3>
            <p>{description}</p>
          </section>
          <section className="haven-ai-placement-block" aria-label="Sample stored guidance">
            <div className="haven-ai-placement-block-head"><span className="haven-ai-placement-eyebrow">Stored guidance example</span><span className={`haven-ai-placement-state haven-ai-placement-state-${resultState}`}>{STATE_NAMES[resultState]}</span></div>
            {hasResult ? <><p className="haven-ai-placement-guidance">{guidance}</p><p className="haven-ai-placement-source">Illustrative only · placement report · sample revision {revision}</p>{resultState === "stale" && <p className="haven-ai-placement-caution">New facts would require an event-driven refresh before this guidance could be trusted.</p>}</> : <p className="haven-ai-placement-empty">{resultState === "unavailable" ? "The assistant would show authorized HAVEN facts while AI guidance is unavailable." : "No stored guidance is available for this example. Opening the module does not start generation."}</p>}
          </section>
          <section className="haven-ai-placement-block haven-ai-placement-scenario" aria-label="Preview scenarios">
            <span className="haven-ai-placement-eyebrow">Prototype controls</span>
            <label htmlFor={`${panelId}-state`}>Result state</label>
            <select id={`${panelId}-state`} value={resultState} onChange={(event) => setResultState(event.target.value as ResultState)}>
              <option value="current">Sample ready</option><option value="stale">Sample needs review</option><option value="absent">No sample result</option><option value="unavailable">AI unavailable</option>
            </select>
            <button type="button" className="haven-ai-placement-secondary" onClick={() => { setRevision((value) => value + 1); setResultState("current"); }}>Simulate relevant new information <ChevronRight size={15} aria-hidden="true" /></button>
          </section>
          <section className="haven-ai-placement-block" aria-label="Manual assistance">
            <span className="haven-ai-placement-eyebrow">Complex case</span>
            <button type="button" className="haven-ai-placement-ask-toggle" aria-expanded={askOpen} onClick={() => setAskOpen((value) => !value)}><MessageCircle size={17} aria-hidden="true" /> Ask HAVEN AI</button>
            {askOpen && <div className="haven-ai-placement-ask"><label htmlFor={`${panelId}-question`}>Question about this module</label><textarea id={`${panelId}-question`} value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="What should I check for this case?" /><button type="button" className="haven-ai-placement-submit" onClick={ask} disabled={!question.trim()}>Show sample answer</button>{answer && <p className="haven-ai-placement-answer" role="status">{answer}</p>}</div>}
          </section>
          <button type="button" className="haven-ai-placement-exit" onClick={() => { window.sessionStorage.removeItem(AI_PLACEMENT_PREVIEW_KEY); setEnabled(false); changeOpen(false); onExit?.(); }}>Exit AI placement preview</button>
        </div>
      </aside>}
    </div>
  );
}
