"use client";
import { useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import "./module-ai-card.css";
import {
  AI_MODULE_METADATA,
  type ModuleAssistantData,
  type AiModuleId,
  MODULE_AI_DISCLOSURE,
  MODULE_AI_UNAVAILABLE_MESSAGE
} from "@/lib/ai/module-metadata";

interface Props { moduleId: AiModuleId; }

export default function ModuleAiCard({ moduleId }: Props) {
  const meta = AI_MODULE_METADATA[moduleId];
  const isEnabled = meta?.enabled ?? false;

  const [topic, setTopic] = useState("");
  const [data, setData] = useState<ModuleAssistantData | null>(null);
  const [metaInfo, setMetaInfo] = useState<{ model: string; generatedAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const factMap = new Map((data?.facts ?? []).map(f => [f.id, f]));

  if (!isEnabled) return null;

  async function generate() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setData(null);
    setMetaInfo(null);

    try {
      const res = await fetch(`/api/ai/module/${moduleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topic ? { topic } : {})
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.data) {
        setData(body.data);
        setMetaInfo({ model: body.model ?? "", generatedAt: body.generatedAt ?? "" });
      } else if (res.status === 429) {
        setNote(body.error ?? "This assistant's limit has been reached. Try again later.");
      } else if (res.status === 503) {
        setNote(body.error ?? MODULE_AI_UNAVAILABLE_MESSAGE);
      } else {
        setNote(body.message ?? body.error ?? MODULE_AI_UNAVAILABLE_MESSAGE);
      }
    } catch {
      setNote("Unable to reach HAVEN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel module-ai-card" aria-labelledby={`module-ai-${moduleId}-title`}>
      <div className="panel-heading">
        <div>
          <h2 id={`module-ai-${moduleId}-title`}>
            <Sparkles size={20} aria-hidden="true" />
            {meta.label}
          </h2>
          <p>{meta.description}</p>
        </div>
        <span className="status-badge" data-tone="neutral">
          <ShieldCheck size={14} aria-hidden="true" />
          Read-only
        </span>
      </div>

      <div className="module-ai-controls">
        <label htmlFor={`module-ai-topic-${moduleId}`}>Focus area</label>
        <select id={`module-ai-topic-${moduleId}`} value={topic} onChange={e => setTopic(e.target.value)} disabled={busy}>
          <option value="">All areas</option>
          {meta.topics.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <button className="btn btn-accent" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>

      <p className="module-ai-hint">No automatic calls. Usage metadata is audited; summaries are not saved.</p>

      {busy && <p role="status">Reading {meta.label.toLowerCase()}…</p>}
      {note && <p className="module-ai-note" role="alert">{note}</p>}

      {data && (
        <div className="module-ai-result" aria-live="polite">
          <p>{data.summary}</p>
          {data.findings.map((finding, index) => (
            <article key={index} className="module-ai-finding">
              <div className="module-ai-facts">
                {finding.fact_ids.map(id => {
                  const fact = factMap.get(id);
                  if (!fact) return null;
                  return (
                    <div key={id} className="module-ai-fact">
                      <span>{fact.label}</span>
                      <b>{fact.display}</b>
                      <small>{fact.basis}{fact.note ? ` — ${fact.note}` : ""}</small>
                    </div>
                  );
                })}
              </div>
              <p>{finding.explanation}</p>
            </article>
          ))}
          {data.suggested_actions.length > 0 && (
            <div className="module-ai-suggestions">
              <h3>Suggested next steps</h3>
              <ul>
                {data.suggested_actions.map((s, i) => (
                  <li key={i}><b>{s.action}</b> — {s.rationale}</li>
                ))}
              </ul>
            </div>
          )}
          {data.limitations.length > 0 && (
            <div className="module-ai-limitations">
              <h3>Limits</h3>
              <ul>{data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
          <p className="module-ai-footer">
            {MODULE_AI_DISCLOSURE}
            {metaInfo?.model ? ` · ${metaInfo.model}` : ""}
            {metaInfo?.generatedAt ? ` · ${new Date(metaInfo.generatedAt).toLocaleString()}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
