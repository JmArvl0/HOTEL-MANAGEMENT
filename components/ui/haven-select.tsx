"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface HavenSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface HavenSelectGroup {
  label: string;
  options: HavenSelectOption[];
}

interface HavenSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: HavenSelectOption[];
  groups?: HavenSelectGroup[];
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  leadingIcon?: React.ReactNode;
  className?: string;
}

/**
 * HavenSelect — the one shared dropdown primitive for filter/selector UI.
 * Custom listbox (button + listbox) with the HAVEN visual language; form
 * data-entry keeps the styled native <select> (see haven-select.css).
 * Zero dependencies beyond lucide-react. Full keyboard support.
 */
export function HavenSelect({
  value,
  onChange,
  options = [],
  groups,
  ariaLabel,
  id,
  disabled,
  placeholder,
  leadingIcon,
  className = "",
}: HavenSelectProps) {
  const autoId = useId();
  const triggerId = id ?? `haven-select-${autoId.replace(/:/g, "")}`;
  const listboxId = `${triggerId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const flat: (HavenSelectOption & { group?: string })[] = groups
    ? groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.label })))
    : options;
  const selected = flat.find((o) => o.value === value);
  const display = selected?.label ?? placeholder ?? "Select";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open ]);

  useEffect(() => {
    if (open) {
      const idx = flat.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      // Keep selected option visible when opened.
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
      });
    }
  }, [open ]); // eslint-disable-line react-hooks/exhaustive-deps

  const enabledIndices = flat.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (dir: 1 | -1) => {
    if (!enabledIndices.length) return;
    setActiveIndex((prev) => {
      const pos = enabledIndices.indexOf(prev);
      const next = pos === -1 ? (dir === 1 ? 0 : enabledIndices.length - 1)
        : (pos + dir + enabledIndices.length) % enabledIndices.length;
      return enabledIndices[next];
    });
  };

  const commit = (idx: number) => {
    const opt = flat[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open ]);

  return (
    <div ref={rootRef} className={`haven-select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className="haven-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) setOpen(true); else move(e.key === "ArrowDown" ? 1 : -1); }
          else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!open) setOpen(true); else if (activeIndex >= 0) commit(activeIndex); }
          else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
          else if (e.key === "Home" && open) { e.preventDefault(); setActiveIndex(enabledIndices[0] ?? -1); }
          else if (e.key === "End" && open) { e.preventDefault(); setActiveIndex(enabledIndices[enabledIndices.length - 1] ?? -1); }
        }}
      >
        {leadingIcon && <span className="haven-select-icon" aria-hidden="true">{leadingIcon}</span>}
        <span className={`haven-select-value${selected ? "" : " is-placeholder"}`}>{display}</span>
        <ChevronDown size={16} aria-hidden="true" className={`haven-select-chevron${open ? " is-open" : ""}`} />
      </button>
      {open && !disabled && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          aria-activedescendant={activeIndex >= 0 ? `${triggerId}-opt-${activeIndex}` : undefined}
          className="haven-select-menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
          }}
        >
          {groups
            ? groups.map((g) => (
                <li key={g.label} role="presentation" className="haven-select-group">
                  <span className="haven-select-group-label" aria-hidden="true">{g.label}</span>
                  <ul role="group" aria-label={g.label}>
                    {g.options.map((o) => {
                      const idx = flat.findIndex((f) => f.value === o.value && f.group === g.label);
                      const isSel = o.value === value;
                      return (
                        <li
                          key={o.value}
                          id={`${triggerId}-opt-${idx}`}
                          data-index={idx}
                          role="option"
                          aria-selected={isSel}
                          aria-disabled={o.disabled || undefined}
                          className={`haven-select-item${isSel ? " is-selected" : ""}${idx === activeIndex ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                          onClick={() => commit(idx)}
                          onMouseEnter={() => !o.disabled && setActiveIndex(idx)}
                        >
                          <span className="haven-select-label">{o.label}</span>
                          {isSel && <Check size={15} aria-hidden="true" className="haven-select-check" />}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            : options.map((o) => {
                const idx = flat.findIndex((f) => f.value === o.value);
                const isSel = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${triggerId}-opt-${idx}`}
                    data-index={idx}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    className={`haven-select-item${isSel ? " is-selected" : ""}${idx === activeIndex ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                    onClick={() => commit(idx)}
                    onMouseEnter={() => !o.disabled && setActiveIndex(idx)}
                  >
                    <span className="haven-select-label">{o.label}</span>
                    {isSel && <Check size={15} aria-hidden="true" className="haven-select-check" />}
                  </li>
                );
              })}
          {flat.length === 0 && <li className="haven-select-empty" role="presentation">No options available.</li>}
        </ul>
      )}
    </div>
  );
}
