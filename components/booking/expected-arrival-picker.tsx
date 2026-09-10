"use client";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Clock3 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { arrivalFromParts, arrivalParts, arrivalValue, formatArrival, parseArrival } from "@/lib/arrival-time-options";

type Props = { value: string; onChange: (value: string) => void };
type Mode = "hour" | "minute";

const FACE = 260;                       // svg viewBox units; rendered at container width
const C = FACE / 2;                     // center
const R_LABEL = 84;                     // number ring
const DEFAULT_DRAFT = 15 * 60;          // policy check-in time — initial hand position only, never auto-saved
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // clock order, shared by clock face and wheel column
const MINUTE_MAJORS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function point(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: C + radius * Math.sin(rad), y: C - radius * Math.cos(rad) };
}
const pad2 = (value: number) => String(value).padStart(2, "0");

/* ------------------------------------------------------------------ clock */

function ClockPicker({ draft, setDraft, mode, setMode, onCancel, onApply }: {
  draft: number; setDraft: (total: number) => void; mode: Mode; setMode: (mode: Mode) => void; onCancel: () => void; onApply: () => void;
}) {
  const clockRef = useRef<HTMLDivElement>(null);
  const parts = arrivalParts(draft);
  const angleFor = (total: number, m: Mode) => {
    const p = arrivalParts(total);
    return m === "hour" ? (p.hour12 % 12) * 30 : p.minute * 6;
  };
  // Cumulative rotation so minute 59 → 00 turns 6° forward instead of spinning 354° back.
  // Every draft/mode change flows through move(), which keeps the angle and the value in step.
  const [handAngle, setHandAngle] = useState(() => angleFor(draft, mode));
  function move(total: number, nextMode: Mode) {
    setDraft(total);
    setMode(nextMode);
    setHandAngle(previous => previous + ((((angleFor(total, nextMode) - previous) % 360) + 540) % 360 - 180));
  }

  useEffect(() => { clockRef.current?.focus(); }, []);

  function selectHour(hour12: number) {
    move(arrivalFromParts(hour12, parts.minute, parts.period), "minute");
  }
  function selectMinute(minute: number) {
    move(arrivalFromParts(parts.hour12, minute, parts.period), mode);
  }
  function faceClick(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * FACE - C;
    const y = ((event.clientY - rect.top) / rect.height) * FACE - C;
    const degrees = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    if (mode === "hour") {
      const hour12 = Math.round(degrees / 30) % 12;
      selectHour(hour12 === 0 ? 12 : hour12);
    } else {
      selectMinute((Math.round(degrees / 6) % 60 + 60) % 60);
    }
  }
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // ±1 minute in minute mode, ±1 hour in hour mode — one mod-1440 total gives
    // 1:59 PM → 2:00 PM and 11:59 PM → 12:00 AM rollover for free.
    const step = mode === "hour" ? 60 : 1;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); move((draft + step) % 1440, mode); }
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); move((draft - step + 1440) % 1440, mode); }
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (mode === "hour") move(draft, "minute"); else onApply();
    }
  }

  const labels = mode === "hour" ? HOURS : MINUTE_MAJORS;
  const ticks = Array.from({ length: 60 }, (_, index) => {
    const from = point(index * 6, 104), to = point(index * 6, index % 5 === 0 ? 114 : 110);
    return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={index % 5 === 0 ? "arrival-tick major" : "arrival-tick"}/>;
  });

  return <div className="arrival-popover" role="dialog" aria-label="Select arrival time">
    <p className="arrival-caption">Select arrival time</p>
    <div className="arrival-head" aria-live="polite">
      <div className="arrival-segments">
        <button type="button" className="arrival-seg" aria-pressed={mode === "hour"} onClick={() => move(draft, "hour")} aria-label={`Hour ${parts.hour12} selected`}>{pad2(parts.hour12)}</button>
        <span className="arrival-seg-colon" aria-hidden="true">:</span>
        <button type="button" className="arrival-seg" aria-pressed={mode === "minute"} onClick={() => move(draft, "minute")} aria-label={`Minute ${parts.minute} selected`}>{pad2(parts.minute)}</button>
      </div>
      <div className="arrival-period" role="group" aria-label="AM or PM">
        <button type="button" aria-pressed={parts.period === "AM"} onClick={() => move(arrivalFromParts(parts.hour12, parts.minute, "AM"), mode)}>AM</button>
        <button type="button" aria-pressed={parts.period === "PM"} onClick={() => move(arrivalFromParts(parts.hour12, parts.minute, "PM"), mode)}>PM</button>
      </div>
    </div>
    <div className="arrival-clock" data-mode={mode} role="group" tabIndex={0} ref={clockRef} onKeyDown={keyDown} aria-label={`Clock face, ${mode} selection. Use arrow keys to adjust, Enter to continue.`}>
      <svg viewBox={`0 0 ${FACE} ${FACE}`} onClick={faceClick} aria-hidden="true">
        <circle cx={C} cy={C} r={118} className="arrival-face"/>
        {ticks}
        <g className="arrival-hand" style={{ transform: `rotate(${handAngle}deg)`, transformOrigin: `${C}px ${C}px`, transformBox: "view-box" }}>
          <line x1={C} y1={C + 18} x2={C} y2={mode === "hour" ? 48 : 36}/>
        </g>
        <circle cx={C} cy={C} r={4} className="arrival-hand-dot"/>
      </svg>
      {labels.map((label) => {
        const selected = mode === "hour" ? label === parts.hour12 : label === parts.minute;
        const position = point(mode === "hour" ? (label % 12) * 30 : label * 6, R_LABEL);
        return <button type="button" key={label} className={selected ? "arrival-number selected" : "arrival-number"}
          style={{ left: `${(position.x / FACE) * 100}%`, top: `${(position.y / FACE) * 100}%` }}
          onClick={() => (mode === "hour" ? selectHour(label) : selectMinute(label))}>
          {mode === "hour" ? label : pad2(label)}
        </button>;
      })}
    </div>
    <div className="arrival-actions">
      <button type="button" className="btn btn-soft btn-sm" onClick={onCancel}>Cancel</button>
      <button type="button" className="btn btn-accent btn-sm" onClick={onApply}>Apply</button>
    </div>
  </div>;
}

/* ------------------------------------------------------------------- wheel */

function WheelColumn({ label, items, selectedIndex, onSelect, format }: {
  label: string; items: readonly number[]; selectedIndex: number; onSelect: (index: number) => void; format: (item: number) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: "center" }); // jsdom-safe: guard keeps tests stub-free
    return () => window.clearTimeout(settleTimer.current);
  }, [selectedIndex]);

  function handleScroll() {
    const list = listRef.current; if (!list) return;
    window.clearTimeout(settleTimer.current);
    // Momentum settled: adopt whichever option ended up centered.
    settleTimer.current = window.setTimeout(() => {
      const center = list.scrollTop + list.clientHeight / 2;
      let best = 0, bestDistance = Infinity;
      for (let index = 0; index < list.children.length; index++) {
        const child = list.children[index] as HTMLElement;
        const distance = Math.abs(child.offsetTop + child.offsetHeight / 2 - center);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      }
      if (best !== selectedIndex) onSelect(best);
    }, 80);
  }
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onSelect(Math.max(0, Math.min(items.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Home") { event.preventDefault(); onSelect(0); }
    else if (event.key === "End") { event.preventDefault(); onSelect(items.length - 1); }
  }

  return <div className="arrival-wheel" role="listbox" aria-label={label} tabIndex={0} ref={listRef} onScroll={handleScroll} onKeyDown={keyDown}>
    {items.map((item, index) => (
      <div key={item} role="option" aria-selected={index === selectedIndex} className="arrival-wheel-item" onClick={() => onSelect(index)}>{format(item)}</div>
    ))}
  </div>;
}

function WheelPicker({ draft, setDraft, onCancel, onApply }: {
  draft: number; setDraft: (total: number) => void; onCancel: () => void; onApply: () => void;
}) {
  const parts = arrivalParts(draft);
  return <Modal isOpen onClose={onCancel} title="Select arrival time" size="sm" footer={
    <div className="arrival-actions">
      <button type="button" className="btn btn-soft btn-sm" onClick={onCancel}>Cancel</button>
      <button type="button" className="btn btn-accent btn-sm" onClick={onApply}>Apply</button>
    </div>
  }>
    <p className="arrival-readout" aria-live="polite">{formatArrival(arrivalValue(draft))}</p>
    <div className="arrival-wheels">
      <WheelColumn label="Hour" items={HOURS} selectedIndex={HOURS.indexOf(parts.hour12)}
        onSelect={(index) => setDraft(arrivalFromParts(HOURS[index], parts.minute, parts.period))} format={String}/>
      <WheelColumn label="Minute" items={Array.from({ length: 60 }, (_, minute) => minute)} selectedIndex={parts.minute}
        onSelect={(minute) => setDraft(arrivalFromParts(parts.hour12, minute, parts.period))} format={pad2}/>
      <WheelColumn label="AM or PM" items={[0, 1]} selectedIndex={parts.period === "PM" ? 1 : 0}
        onSelect={(index) => setDraft(arrivalFromParts(parts.hour12, parts.minute, index === 1 ? "PM" : "AM"))}
        format={(item) => (item === 1 ? "PM" : "AM")}/>
    </div>
  </Modal>;
}

/* ------------------------------------------------------------------ field */

export function ExpectedArrivalPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [mode, setMode] = useState<Mode>("hour");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Input-mode detection happens post-mount: the panel only renders after a user
  // click, so server and first client render stay identical (no hydration drift).
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function openPicker() {
    setDraft(parseArrival(value) ?? DEFAULT_DRAFT);
    setMode("hour");
    setOpen(true);
  }
  function cancel() { setOpen(false); triggerRef.current?.focus(); }
  function apply() { onChange(arrivalValue(draft)); setOpen(false); triggerRef.current?.focus(); }

  useEffect(() => {
    if (!open || coarse) return; // the wheel sheet uses Modal's own Escape/overlay handling
    const outside = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) cancel(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, coarse]);

  return <div className="arrival-picker" ref={rootRef}>
    <button type="button" ref={triggerRef} className="arrival-trigger" onClick={openPicker} aria-haspopup="dialog" aria-expanded={open} aria-label="Expected arrival time">
      <span className={value ? undefined : "arrival-placeholder"}>{value ? formatArrival(value) : "Select arrival time"}</span>
      <Clock3 size={12} aria-hidden="true"/>
    </button>
    {open && !coarse && <ClockPicker draft={draft} setDraft={setDraft} mode={mode} setMode={setMode} onCancel={cancel} onApply={apply}/>}
    {open && coarse && <WheelPicker draft={draft} setDraft={setDraft} onCancel={cancel} onApply={apply}/>}
  </div>;
}
