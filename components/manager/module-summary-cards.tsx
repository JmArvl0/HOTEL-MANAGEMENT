"use client";
import type { LucideIcon } from "lucide-react";

// Shared module-level quick-overview cards — the compact operational snapshot
// above a module's filters/table (NOT the Overview dashboard's big KPI cards).
// A card carrying `queue` is a button that activates the module's EXISTING
// filter value (no duplicated filtering logic) and shows an aria-pressed
// selected state; a card without one is informational and renders as a plain
// article. Visual system lifted from the Transportation KPI cards (.mod-kpi,
// formerly .tp-kpi) — tones reuse the same semantic icon-chip accents.
export type ModuleSummaryTone = "attention" | "today" | "active" | "done";
export type ModuleSummaryCard = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: ModuleSummaryTone;
  /** Filter value this card activates when clicked; absent → informational. */
  queue?: string;
};

export function ModuleSummaryCards({ cards, activeQueue, onSelect, ariaLabel }: {
  cards: ModuleSummaryCard[];
  /** Current filter value, so a linked card can show its selected state. */
  activeQueue?: string;
  /** Activates the module's existing filter when a card is clicked. */
  onSelect?: (queue: string) => void;
  /** Accessible name for the grid; defaults to "Module summary". */
  ariaLabel?: string;
}) {
  if (cards.length === 0) return null;
  return <div className="mod-kpis" role="group" aria-label={ariaLabel ?? "Module summary"}>
    {cards.map((card) => {
      const Icon = card.icon;
      const clickable = Boolean(card.queue && onSelect);
      const content = <>
        <span>{card.label}</span>
        <b>{card.value}</b>
        {card.hint && <small>{card.hint}</small>}
        {Icon && <i className={card.tone} aria-hidden="true"><Icon size={16} /></i>}
      </>;
      return clickable
        ? <button type="button" className={`mod-kpi${activeQueue === card.queue ? " active" : ""}`} key={card.label} aria-pressed={activeQueue === card.queue} onClick={() => onSelect!(card.queue!)}>{content}</button>
        : <article className="mod-kpi" key={card.label}>{content}</article>;
    })}
  </div>;
}
