"use client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import "./stay-calendar.css";

const dayName = new Intl.DateTimeFormat("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);

export function StayCalendar({ checkIn, checkOut, today, onChange, hero = false }: {
  checkIn: string; checkOut: string; today: string; onChange: (start: string, end: string) => void; hero?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const rangeTrigger = useRef<HTMLButtonElement>(null);
  const checkInTrigger = useRef<HTMLButtonElement>(null);
  const checkOutTrigger = useRef<HTMLButtonElement>(null);
  const title = useId();
  const [field, setField] = useState<"range" | "checkIn" | "checkOut" | null>(null);
  const [month, setMonth] = useState((checkIn || today).slice(0, 7));
  const [start, setStart] = useState("");
  const editingCheckout = field === "checkOut" && checkIn !== "";
  const first = utcDate(`${month}-01`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();

  function openCalendar(nextField: NonNullable<typeof field>) {
    setMonth(((nextField === "checkOut" && checkOut) || checkIn || today).slice(0, 7));
    setStart(nextField === "checkOut" ? checkIn : "");
    setField(nextField);
  }

  function close() {
    dialog.current?.close();
    setField(null);
    const trigger = field === "checkIn" ? checkInTrigger : field === "checkOut" ? checkOutTrigger : rangeTrigger;
    trigger.current?.focus();
  }

  function move(offset: number) {
    first.setUTCMonth(first.getUTCMonth() + offset);
    setMonth(first.toISOString().slice(0, 7));
  }

  return <>
    {hero ? (["checkIn", "checkOut"] as const).map(name => {
      const value = name === "checkIn" ? checkIn : checkOut;
      return <button key={name} ref={name === "checkIn" ? checkInTrigger : checkOutTrigger} type="button" className="hero-booking-field hero-booking-date" data-date-field={name}
        aria-haspopup="dialog" aria-expanded={field === name} onClick={() => openCalendar(name)}>
        <span className="hero-booking-label">{name === "checkIn" ? "Check in" : "Check out"}</span>
        <span className="hero-booking-value">
          <CalendarDays size={18} aria-hidden="true" />
          {value ? <time dateTime={value} aria-label={dayName.format(utcDate(value))}>{shortDate.format(utcDate(value))}</time> :
            <><span className="hero-date-desktop">Select date</span><span className="hero-date-mobile">Add date</span></>}
          <ChevronDown className="hero-field-chevron" size={16} aria-hidden="true" />
        </span>
      </button>;
    }) : <div className="stay-calendar">
      <button ref={rangeTrigger} type="button" className="stay-calendar-toggle" aria-haspopup="dialog" aria-expanded={field === "range"} onClick={() => openCalendar("range")}>
        <CalendarDays size={18} aria-hidden="true" /> Choose stay dates
      </button>
    </div>}
    {field && createPortal(<dialog ref={element => {
      dialog.current = element;
      if (element && !element.open) element.showModal();
    }} className={hero ? "stay-calendar-panel stay-calendar-panel--hero" : "stay-calendar-panel"} aria-labelledby={title} onCancel={event => {
      event.preventDefault();
      close();
    }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close();
    }}>
      <h2 id={title}>Choose your stay</h2>
      <header>
        <button type="button" aria-label="Previous month" disabled={month <= (editingCheckout ? checkIn : today).slice(0, 7)} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{monthName.format(first)}</strong>
        <button type="button" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={18} /></button>
      </header>
      <p role="status">{start ? "Choose your check-out date" : "Choose your check-in date"}</p>
      <div className="stay-calendar-grid">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day} aria-hidden="true">{day}</span>)}
        {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`blank${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          return <button key={date} type="button" disabled={date < today || (editingCheckout && date <= checkIn)}
            aria-label={dayName.format(utcDate(date))} aria-pressed={date === (start || checkIn) || ((!start || editingCheckout) && date === checkOut)}
            className={(!start || editingCheckout) && date > checkIn && date < checkOut ? "in-range" : ""}
            onKeyDown={event => {
              const offset = offsets[event.key];
              if (!offset) return;
              event.preventDefault();
              dialog.current?.querySelectorAll<HTMLButtonElement>(".stay-calendar-grid button")[i + offset]?.focus();
            }} onClick={() => {
              if (!start || date <= start) setStart(date);
              else { onChange(start, date); close(); }
            }}>{i + 1}</button>;
        })}
      </div>
      <button type="button" className="stay-calendar-cancel" onClick={close}>Cancel</button>
    </dialog>, document.body)}
  </>;
}
