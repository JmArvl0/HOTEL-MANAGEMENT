"use client";
import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Search } from "lucide-react";
import { normalizePhone } from "@/lib/input-validation";
import "./mobile-number-field.css";

const countries = [
  ["PH", "Philippines", "63"], ["AU", "Australia", "61"], ["CA", "Canada", "1"], ["JP", "Japan", "81"],
  ["SG", "Singapore", "65"], ["AE", "United Arab Emirates", "971"], ["GB", "United Kingdom", "44"], ["US", "United States", "1"],
] as const;
type Country = (typeof countries)[number];

function parse(raw: string, selected: Country = countries[0]) {
  const value = raw.trim();
  const explicit = value.startsWith("+") || value.startsWith("00");
  const cleanInternational = value.replace(/^00/, "+");
  if (explicit && /^\+[0-9 ().-]*$/.test(cleanInternational)) {
    const digits = cleanInternational.replace(/\D/g, "");
    const match = [selected, ...countries].find(country => digits.startsWith(country[2]));
    return match ? { country: match, text: digits.slice(match[2].length), international: false }
      : { country: selected, text: cleanInternational, international: true };
  }
  if (explicit) return { country: selected, text: cleanInternational, international: true };
  if (selected[0] === "PH" && /^639[0-9]{9}$/.test(value.replace(/[ ().-]/g, ""))) {
    return { country: selected, text: value.replace(/[ ().-]/g, "").slice(2), international: false };
  }
  const text = selected[0] === "PH" && /^0?9[0-9 ()-]*$/.test(value) ? value.replace(/^0/, "") : raw;
  return { country: selected, text, international: false };
}

export function MobileNumberField({ name, defaultValue = "", className = "", error, errorId }: {
  name: string; defaultValue?: string; className?: string; error?: string; errorId?: string;
}) {
  const id = useId();
  const [number, setNumber] = useState(() => parse(defaultValue));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { country, text, international } = number;
  const candidate = international ? text : `+${country[2]}${text}`;
  const canonical = text ? normalizePhone(candidate) : null;
  const validity = !text ? "Enter your mobile number." : !canonical ? "Check the number and country code." : "";
  const visibleError = error || (touched ? validity : "");
  const matching = countries.filter(item => item.join(" ").toLowerCase().includes(query.toLowerCase().replace("+", "")));

  return <div className={`mobile-number-field ${className}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <label htmlFor={id}>Mobile number</label>
    <div className="mobile-number-control">
      <button ref={trigger} type="button" aria-label={international ? "Country calling code, other international number"
        : `Country calling code, ${country[1]} (+${country[2]})`} aria-expanded={open} aria-controls={`${id}-countries`}
        onClick={() => { setOpen(!open); setQuery(""); }}>
        {international ? <Globe2 size={18} aria-hidden="true" /> : <><Flag code={country[0]} /><span>+{country[2]}</span></>}
        <ChevronDown size={13} aria-hidden="true"/>
      </button>
      <input id={id} type="tel" inputMode="tel" autoComplete={international ? "tel" : "tel-national"} required maxLength={40}
        data-error-field={name} value={text} placeholder={international ? "+49 151 2345 6789" : "917 000 0000"}
        aria-describedby={`${id}-hint${error && errorId ? " " + errorId : ""}`} aria-invalid={Boolean(visibleError) || undefined}
        ref={node => node?.setCustomValidity(validity)} onInvalid={() => setTouched(true)} onBlur={() => setTouched(true)}
        onChange={event => setNumber(parse(event.target.value, country))} />
      <input type="hidden" name={name} value={canonical ?? ""} />
      {open && <div className="mobile-country-picker" id={`${id}-countries`} onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }}>
        <label className="mobile-country-search"><Search size={16}/><input autoFocus type="search" aria-label="Search countries"
          placeholder="Search country or code" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="mobile-country-options">
          {matching.map(item => <button key={item[0]} type="button" aria-pressed={!international && country[0] === item[0]}
            onPointerDown={event => event.preventDefault()} onClick={() => {
              setNumber(parse(international ? "" : text, item)); setOpen(false); trigger.current?.focus();
            }}><Flag code={item[0]}/><span>{item[1]}</span><small>+{item[2]}</small>
            {!international && country[0] === item[0] && <Check size={14}/>}
          </button>)}
          <button type="button" aria-pressed={international} onPointerDown={event => event.preventDefault()} onClick={() => {
            setNumber({ country, text: international ? text : "+", international: true });
            setOpen(false); document.getElementById(id)?.focus();
          }}><Globe2 size={18}/><span>Other international number</span></button>
        </div>
      </div>}
    </div>
    <small id={`${id}-hint`}>{!error && visibleError ? visibleError : international ? "Enter the full number with its country code." : "For reservation and arrival coordination."}</small>
    {error && errorId && <small className="form-field-error" id={errorId}>{error}</small>}
  </div>;
}

function Flag({ code }: { code: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- local flag icons
  return <img src={`/flags/${code.toLowerCase()}.svg`} width={24} height={18} alt="" />;
}
