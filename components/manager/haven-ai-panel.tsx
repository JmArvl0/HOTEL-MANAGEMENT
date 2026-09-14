"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  ClipboardList,
  Database,
  Lightbulb,
  PackageSearch,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench
} from "lucide-react";
import AiMarkdown from "./ai-markdown";

/**
 * HAVEN AI — the Gemini assistance workspace for the Manager. Two features:
 * the daily operations brief (Gemini narrates HAVEN's analytics output) and
 * Ask HAVEN (advisory Q&A over the explicit read-only tool registry). Gemini
 * explains and recommends; every figure comes from HAVEN's own systems and
 * every decision stays with the authorized human.
 */

const AI_DISCLOSURE = "AI-generated operational guidance. Verify important decisions using authoritative HAVEN records.";
const BRIEF_UNAVAILABLE_MESSAGE = "HAVEN AI is temporarily unavailable. Hotel operations are not affected.";

type Brief = {
  summary: string;
  priority_actions: { action: string; rationale: string }[];
  warnings: string[];
  prediction_explanations: { label: string; text: string }[];
};

type BriefIndicators = {
  occupiedNow: number;
  arrivalsTomorrow: number;
  openGuestRequests: number;
  highRiskSupplies: number;
  openMaintenanceItems: number;
};

type Turn = { role: "user" | "assistant"; text: string };

const SUGGESTED_QUESTIONS = [
  "What should we prepare for tomorrow?",
  "Which rooms need maintenance attention?",
  "Are we at risk of running out of any supplies?",
  "How is housekeeping workload looking this week?"
];

const fmtStamp = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "—";

export default function HavenAiPanel({ userName }: { userName?: string | null }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [indicators, setIndicators] = useState<BriefIndicators | null>(null);
  const [briefMeta, setBriefMeta] = useState<{ model: string; generatedAt: string; cached: boolean } | null>(null);
  const [briefUnavailable, setBriefUnavailable] = useState<string | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [refreshingBrief, setRefreshingBrief] = useState(false);

  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  const loadBrief = useCallback(async (refresh = false) => {
    if (refresh) setRefreshingBrief(true);
    else setLoadingBrief(true);
    try {
      const response = await fetch(`/api/ai/brief${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load the AI brief.");
      setIndicators(body.indicators ?? null);
      if (body.data) {
        setBrief(body.data);
        setBriefUnavailable(null);
        setBriefMeta({ model: body.model ?? "", generatedAt: body.generatedAt ?? "", cached: Boolean(body.cached) });
      } else {
        setBrief(null);
        setBriefUnavailable(BRIEF_UNAVAILABLE_MESSAGE);
      }
    } catch {
      if (!refresh) setIndicators(null);
      setBriefUnavailable(BRIEF_UNAVAILABLE_MESSAGE);
    } finally {
      setLoadingBrief(false);
      setRefreshingBrief(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBrief(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBrief]);

  useEffect(() => {
    conversationRef.current?.scrollTo?.({ top: conversationRef.current.scrollHeight });
  }, [history, asking]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAskNote(null);
    setQuestion("");
    const priorHistory = [...history, { role: "user" as const, text: trimmed }];
    setHistory(priorHistory);
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, history: history.slice(-6) })
      });
      const body = await response.json();
      if (response.ok && body.data) {
        setHistory([...priorHistory, { role: "assistant", text: body.data.answer }]);
      } else if (response.status === 429) {
        setAskNote(body.error ?? "Ask HAVEN limit reached. Try again in a few minutes.");
        setHistory(priorHistory.slice(0, -1));
        setQuestion(trimmed);
      } else {
        setAskNote(body.message ?? body.error ?? "AI assistance is temporarily unavailable.");
      }
    } catch {
      setAskNote("Unable to reach HAVEN.");
    } finally {
      setAsking(false);
    }
  };

  const firstName = userName?.trim().split(/\s+/)[0];
  const metricValue = (value: number | undefined, unit: string) => value === undefined ? "Unavailable" : `${value} ${unit}`;

  return (
    <section className="haven-ai-workspace">
      <header className="page-title haven-ai-hero">
        <div>
          <p className="eyebrow">Gemini AI assistance</p>
          <h1>HAVEN AI</h1>
          <p>Advisory intelligence over HAVEN&apos;s own data. Forecasts come from HAVEN predictive analytics; AI explains, summarizes and recommends. It never executes operations.</p>
        </div>
        <aside className="haven-ai-advisory" aria-label="HAVEN AI permission boundary">
          <ShieldCheck size={20} aria-hidden="true" />
          <span><b>Read-only advisory</b><small>AI can&apos;t make changes in HAVEN.</small></span>
        </aside>
      </header>

      <section className="haven-ai-indicators" aria-labelledby="ai-indicators-title">
        <div className="haven-ai-section-heading">
          <h2 id="ai-indicators-title">Key operational indicators from today&apos;s data</h2>
          <p>Direct values from HAVEN&apos;s operational records.</p>
        </div>
        <div className="haven-ai-kpi-grid">
          {loadingBrief ? Array.from({ length: 5 }, (_, index) => <div className="haven-ai-kpi-skeleton" key={index} aria-hidden="true" />) : (
            <>
              <article className="haven-ai-kpi"><BedDouble size={18} aria-hidden="true"/><span><small>Occupied now</small><b>{metricValue(indicators?.occupiedNow, "rooms")}</b><em>Current room status</em></span></article>
              <article className="haven-ai-kpi"><CalendarCheck2 size={18} aria-hidden="true"/><span><small>Arrivals tomorrow</small><b>{metricValue(indicators?.arrivalsTomorrow, "reservations")}</b><em>Confirmed and checked-in stays</em></span></article>
              <article className="haven-ai-kpi"><ClipboardList size={18} aria-hidden="true"/><span><small>Open guest requests</small><b>{metricValue(indicators?.openGuestRequests, "requests")}</b><em>Awaiting completion</em></span></article>
              <article className="haven-ai-kpi warning"><PackageSearch size={18} aria-hidden="true"/><span><small>High-risk supplies</small><b>{metricValue(indicators?.highRiskSupplies, "items")}</b><em>Flagged by HAVEN analytics</em></span></article>
              <article className="haven-ai-kpi risk"><Wrench size={18} aria-hidden="true"/><span><small>Open maintenance items</small><b>{metricValue(indicators?.openMaintenanceItems, "items")}</b><em>Unresolved work orders</em></span></article>
            </>
          )}
        </div>
      </section>

      <div className="haven-ai-main-grid">
        <article className="panel ai-brief-panel">
          <div className="panel-heading">
            <div>
              <h2>Daily Operations Brief</h2>
              <p>Gemini&apos;s reading of today&apos;s HAVEN data, including forecasts from predictive analytics.</p>
            </div>
            <div className="ai-brief-controls">
              {briefMeta && <small>Updated {fmtStamp(briefMeta.generatedAt)}</small>}
              <button type="button" className="btn btn-soft btn-sm" aria-label="Refresh brief" onClick={() => void loadBrief(true)} disabled={refreshingBrief || loadingBrief}>
                <RefreshCw className={refreshingBrief ? "is-spinning" : ""} size={14} aria-hidden="true" /> {refreshingBrief ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {loadingBrief ? (
            <div className="ai-brief-loading" aria-label="Preparing today's brief"><i/><i/><i/><i/></div>
          ) : brief ? (
            <div className="ai-brief">
              <section className="ai-brief-block summary">
                <h3><Sparkles size={15} aria-hidden="true"/>Summary</h3>
                <p className="ai-brief-summary">{brief.summary}</p>
              </section>
              {brief.priority_actions.length > 0 && (
                <section className="ai-brief-block priorities">
                  <h3><Lightbulb size={15} aria-hidden="true"/>Priority actions to consider</h3>
                  <ol>
                    {brief.priority_actions.map((action, index) => (
                      <li key={index}><span>{index + 1}</span><div><b>{action.action}</b>{action.rationale && <small>{action.rationale}</small>}</div></li>
                    ))}
                  </ol>
                </section>
              )}
              {brief.warnings.length > 0 && (
                <section className="ai-brief-block warnings">
                  <h3><AlertTriangle size={15} aria-hidden="true"/>Warnings</h3>
                  <ul>{brief.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                </section>
              )}
              {brief.prediction_explanations.length > 0 && (
                <section className="ai-brief-block forecasts">
                  <h3><Sparkles size={15} aria-hidden="true"/>Forecast notes</h3>
                  <p>Forecasts below come from HAVEN predictive analytics.</p>
                  <ul>
                    {brief.prediction_explanations.map((note, index) => (
                      <li key={index}><b>{note.label}:</b> {note.text}</li>
                    ))}
                  </ul>
                </section>
              )}
              <footer>
                <span>{AI_DISCLOSURE}</span>
                {briefMeta && <small>{briefMeta.model}{briefMeta.cached ? " · cached" : ""}</small>}
              </footer>
            </div>
          ) : (
            <div className="ai-unavailable">
              <Sparkles size={18} aria-hidden="true" />
              <div><b>Brief unavailable</b><p>{briefUnavailable ?? BRIEF_UNAVAILABLE_MESSAGE}</p></div>
            </div>
          )}
        </article>

        <article className="panel ai-ask-panel">
          <div className="panel-heading">
            <div>
              <h2>Ask HAVEN</h2>
              <p>Explore operations, workload, forecasts and risks using read-only HAVEN data.</p>
            </div>
            <span className="ai-readonly-chip"><ShieldCheck size={13} aria-hidden="true"/>Read only</span>
          </div>

          <div className="ai-conversation" ref={conversationRef} aria-live="polite">
            {history.length === 0 && !asking && (
              <div className="ai-conversation-empty">
                <Sparkles size={20} aria-hidden="true" />
                <h3>{firstName ? `Hi ${firstName}!` : "How can I help today?"}</h3>
                <p>Ask me to explain what HAVEN&apos;s operational data and forecasts may need from your team.</p>
                <div className="ai-suggested">
                  {SUGGESTED_QUESTIONS.map((chip) => (
                    <button type="button" key={chip} onClick={() => void ask(chip)}>{chip}<ArrowRight size={13} aria-hidden="true"/></button>
                  ))}
                </div>
              </div>
            )}
            {history.map((turn, index) => (
              <div className={`ai-turn ${turn.role}`} key={index}>
                <b>{turn.role === "user" ? "You" : "HAVEN AI"}</b>
                {turn.role === "assistant"
                  ? <div className="ai-md"><AiMarkdown text={turn.text} /></div>
                  : <p>{turn.text}</p>}
              </div>
            ))}
            {asking && <div className="ai-turn assistant"><b>HAVEN AI</b><p><i className="ai-typing">Checking HAVEN&apos;s data…</i></p></div>}
          </div>

          <div className="ai-ask-dock">
            {askNote && <p className="ai-ask-note" role="status">{askNote}</p>}
            <form className="ai-ask-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
              <label htmlFor="ai-question" className="sr-only">Ask HAVEN a question</label>
              <input id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about operations, forecasts, workload or risks..." maxLength={600} autoComplete="off" />
              <button type="submit" className="btn btn-accent" disabled={!question.trim() || asking}>
                <Send size={15} aria-hidden="true" /> Ask
              </button>
            </form>
            <p>Answers are based on your HAVEN data. I can&apos;t make changes in the system.</p>
          </div>
        </article>
      </div>

      <section className="ai-workflow" aria-labelledby="ai-workflow-title">
        <div className="haven-ai-section-heading">
          <h2 id="ai-workflow-title">How HAVEN AI works</h2>
          <p>From your hotel data to better decisions — always read-only.</p>
        </div>
        <div className="ai-workflow-flow">
          <div className="ai-workflow-step"><Database size={18} aria-hidden="true"/><span><b>HAVEN data</b><small>Your operational records</small></span></div>
          <ArrowRight className="ai-workflow-arrow" size={17} aria-hidden="true"/>
          <div className="ai-workflow-step"><Sparkles size={18} aria-hidden="true"/><span><b>Predictive analytics</b><small>Forecasts from HAVEN</small></span></div>
          <ArrowRight className="ai-workflow-arrow" size={17} aria-hidden="true"/>
          <div className="ai-workflow-step"><Lightbulb size={18} aria-hidden="true"/><span><b>Gemini explanation</b><small>Summarizes and recommends</small></span></div>
          <ArrowRight className="ai-workflow-arrow" size={17} aria-hidden="true"/>
          <div className="ai-workflow-step"><ShieldCheck size={18} aria-hidden="true"/><span><b>Your decision</b><small>You stay in control</small></span></div>
          <aside><ShieldCheck size={19} aria-hidden="true"/><span><b>Advisory only</b><small>HAVEN AI never executes operations or makes changes in the system.</small></span></aside>
        </div>
      </section>
    </section>
  );
}
