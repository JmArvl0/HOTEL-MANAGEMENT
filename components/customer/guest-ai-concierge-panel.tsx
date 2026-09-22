"use client";

import { useState } from "react";
import AiMarkdown from "@/components/manager/ai-markdown";
import { GUEST_CONCIERGE_DISCLOSURE } from "@/lib/ai/guest-concierge";

interface Draft {
  requestTypes: string[];
  description?: string;
  reservationId: string;
}
interface Reply {
  replyText: string;
  suggestedPicks?: string[];
  actionDraft?: Draft;
}
interface Turn {
  role: "user" | "assistant";
  text: string;
  draft?: Draft;
}

const QUICK_STARTS = [
  "What time is check-out?",
  "How do I connect to Wi-Fi?",
  "Recommend restaurants nearby",
  "I need extra towels please",
];

export default function GuestAiConciergePanel({ reservationId }: { reservationId?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setConfirmed(null);
    const next = [...turns, { role: "user" as const, text: q }];
    setTurns(next);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/account/ai/concierge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: next.slice(-6).map((t) => ({ role: t.role, text: t.text.slice(0, 600) })),
          reservationId,
        }),
      });
      const payload = (await response.json()) as { data?: Reply; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      if (!payload.data) {
        setTurns([...next, { role: "assistant", text: payload.message ?? "AI assistance is temporarily unavailable." }]);
        return;
      }
      setTurns([...next, { role: "assistant", text: payload.data.replyText, draft: payload.data.actionDraft }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the concierge.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm(draft: Draft) {
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/account/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: draft.reservationId,
          requestTypes: draft.requestTypes,
          description: draft.description || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit your request.");
      setConfirmed("Request submitted — the team has been notified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit your request.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section aria-label="HAVEN virtual concierge" className="customer-card">
      <div aria-live="polite" className="concierge-thread">
        {turns.length === 0 && !loading && (
          <p className="concierge-empty">Ask about check-in times, amenities, Wi-Fi, or nearby places.</p>
        )}
        {turns.map((turn, i) => (
          <article key={i} className={`concierge-msg concierge-${turn.role}`}>
            {turn.role === "assistant" ? <AiMarkdown text={turn.text} /> : <p>{turn.text}</p>}
            {turn.draft && (
              <div className="concierge-draft" role="group" aria-label="Suggested service request">
                <strong>Request draft: {turn.draft.requestTypes.join(", ")}</strong>
                {turn.draft.description && <p>{turn.draft.description}</p>}
                <button type="button" disabled={confirming} onClick={() => void confirm(turn.draft!)}>
                  {confirming ? "Submitting…" : "Confirm Request"}
                </button>
              </div>
            )}
          </article>
        ))}
        {loading && (
          <div className="concierge-skeleton" aria-label="Waiting for concierge reply">
            <span className="pulse-bar" /><span className="pulse-bar short" />
          </div>
        )}
      </div>

      {error && <p role="alert" className="concierge-error">{error}</p>}
      {confirmed && <p role="status" className="concierge-ok">{confirmed}</p>}

      <div className="concierge-chips" role="group" aria-label="Suggested questions">
        {QUICK_STARTS.map((q) => (
          <button key={q} type="button" className="concierge-chip" disabled={loading} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>

      <form
        className="concierge-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="concierge-input" className="sr-only">Ask the concierge</label>
        <input
          id="concierge-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="Ask about your stay…"
          autoComplete="off"
        />
        <button type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
      <p className="concierge-disclosure">{GUEST_CONCIERGE_DISCLOSURE}</p>
    </section>
  );
}
