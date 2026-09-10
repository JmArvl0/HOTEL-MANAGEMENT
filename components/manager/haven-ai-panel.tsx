"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Sparkles } from "lucide-react";

/**
 * HAVEN AI — the Gemini assistance workspace for the Manager. Two features:
 * the daily operations brief (Gemini narrates HAVEN's analytics output) and
 * Ask HAVEN (advisory Q&A over the explicit read-only tool registry). Gemini
 * explains and recommends; every figure comes from HAVEN's own systems and
 * every decision stays with the authorized human.
 */

const AI_DISCLOSURE = "AI-generated operational guidance. Verify important decisions using authoritative HAVEN records.";

type Brief = {
  summary: string;
  priority_actions: { action: string; rationale: string }[];
  warnings: string[];
  prediction_explanations: { label: string; text: string }[];
};

type AskReply = { answer: string; data_basis: string };

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

export default function HavenAiPanel() {
  const [brief, setBrief] = useState<Brief | null>(null);
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
      if (body.data) {
        setBrief(body.data);
        setBriefUnavailable(null);
        setBriefMeta({ model: body.model ?? "", generatedAt: body.generatedAt ?? "", cached: Boolean(body.cached) });
      } else {
        setBrief(null);
        setBriefUnavailable(body.message ?? "AI assistance is temporarily unavailable. All HAVEN operations continue to work normally.");
      }
    } catch {
      setBriefUnavailable("Unable to load the AI brief.");
    } finally {
      setLoadingBrief(false);
      setRefreshingBrief(false);
    }
  }, []);

  useEffect(() => { void loadBrief(); }, [loadBrief]);

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

  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Gemini AI assistance</p>
          <h1>HAVEN AI</h1>
          <p>Advisory intelligence over HAVEN&apos;s own data. AI explains, summarizes and recommends — it never executes an operation or makes a prediction of its own.</p>
        </div>
      </div>

      <article className="panel ai-brief-panel">
        <div className="panel-heading">
          <div>
            <h3>Daily operations brief</h3>
            <p>Gemini&apos;s reading of today&apos;s HAVEN forecast output</p>
          </div>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void loadBrief(true)} disabled={refreshingBrief || loadingBrief}>
            <RefreshCw size={14} /> {refreshingBrief ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loadingBrief ? (
          <p className="snapshot-hint">Preparing today&apos;s brief…</p>
        ) : brief ? (
          <div className="ai-brief">
            <p className="ai-brief-summary">{brief.summary}</p>
            {brief.priority_actions.length > 0 && (
              <section>
                <h4>Priority actions to consider</h4>
                <ol>
                  {brief.priority_actions.map((action, index) => (
                    <li key={index}><b>{action.action}</b>{action.rationale && <small>{action.rationale}</small>}</li>
                  ))}
                </ol>
              </section>
            )}
            {brief.warnings.length > 0 && (
              <section>
                <h4>Warnings</h4>
                <ul>{brief.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </section>
            )}
            {brief.prediction_explanations.length > 0 && (
              <section>
                <h4>Forecast notes</h4>
                <ul>
                  {brief.prediction_explanations.map((note, index) => (
                    <li key={index}><b>{note.label}:</b> {note.text}</li>
                  ))}
                </ul>
              </section>
            )}
            <footer>
              <span>{AI_DISCLOSURE}</span>
              {briefMeta && <small>{briefMeta.model}{briefMeta.cached ? " · cached" : ""} · {fmtStamp(briefMeta.generatedAt)}</small>}
            </footer>
          </div>
        ) : (
          <div className="ai-unavailable">
            <Sparkles size={18} aria-hidden />
            <p>{briefUnavailable}</p>
          </div>
        )}
      </article>

      <article className="panel ai-ask-panel">
        <div className="panel-heading">
          <div>
            <h3>Ask HAVEN</h3>
            <p>Advisory answers from live operational data — through a fixed set of read-only tools, never raw database access</p>
          </div>
        </div>

        <div className="ai-conversation" ref={conversationRef} aria-live="polite">
          {history.length === 0 && !asking && (
            <div className="ai-conversation-empty">
              <p>Ask about operations, forecasts, workload or risks. Suggested questions:</p>
              <div className="ai-suggested">
                {SUGGESTED_QUESTIONS.map((chip) => (
                  <button type="button" key={chip} onClick={() => void ask(chip)}>{chip}</button>
                ))}
              </div>
            </div>
          )}
          {history.map((turn, index) => (
            <div className={`ai-turn ${turn.role}`} key={index}>
              <b>{turn.role === "user" ? "You" : "HAVEN AI"}</b>
              <p>{turn.text}</p>
            </div>
          ))}
          {asking && <div className="ai-turn assistant"><b>HAVEN AI</b><p><i className="ai-typing">Checking HAVEN&apos;s data…</i></p></div>}
        </div>

        {askNote && <p className="snapshot-hint" role="status">{askNote}</p>}

        <form
          className="ai-ask-form"
          onSubmit={(event) => { event.preventDefault(); void ask(question); }}
        >
          <label htmlFor="ai-question" className="sr-only">Ask HAVEN a question</label>
          <input
            id="ai-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about operations, forecasts, workload or risks…"
            maxLength={600}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-accent" disabled={!question.trim() || asking}>
            <Send size={15} /> Ask
          </button>
        </form>
        <p className="snapshot-hint">
          Every answer draws on the same figures the dashboards show, through read-only tools. {AI_DISCLOSURE}
        </p>
      </article>
    </>
  );
}
