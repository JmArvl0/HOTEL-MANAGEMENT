"use client";
import {useId,useRef,useState} from 'react';
import {Check,ChevronDown,Search} from 'lucide-react';
import './mobile-number-field.css';
const countries=[['PH','Philippines','63'],['AU','Australia','61'],['CA','Canada','1'],['JP','Japan','81'],['SG','Singapore','65'],['AE','United Arab Emirates','971'],['GB','United Kingdom','44'],['US','United States','1']];
function parse(raw:string,selected='PH'){
 let digits=raw.replace(/\D/g,'');let country=countries.find(c=>c[0]===selected)!;
 if(raw.trim().startsWith('+')||raw.trim().startsWith('00')){if(raw.trim().startsWith('00'))digits=digits.slice(2);const matches=countries.filter(c=>digits.startsWith(c[2])).sort((a,b)=>b[2].length-a[2].length);const match=matches.find(c=>c[0]===selected)||matches.find(c=>c[0]==='US')||matches[0];if(match){country=match;digits=digits.slice(match[2].length)}}
 else if(country[0]==='PH'&&digits.startsWith('63')&&digits.length>=12)digits=digits.slice(2);
 if(country[0]==='PH'&&digits.startsWith('0'))digits=digits.slice(1);
 return {country,digits};
}
export function MobileNumberField({name,defaultValue='',className=''}:{name:string;defaultValue?:string;className?:string}){
 const id=useId();const initial=parse(defaultValue);const [selected,setSelected]=useState(initial.country);const [digits,setDigits]=useState(initial.digits);const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [touched,setTouched]=useState(false);const root=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 const message=!digits?'Enter your mobile number.':selected[0]==='PH'&&digits.length!==10?'Enter 10 digits after +63, for example 917 000 0000.':digits.length<7||digits.length+selected[2].length>15?'Check the number for your country.':'';
 return <div className={`mobile-number-field ${className}`} ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
 <label htmlFor={id}>Mobile number</label><div className="mobile-number-control"><button ref={trigger} type="button" aria-label={`Country calling code, ${selected[1]} (+${selected[2]})`} aria-expanded={open} aria-controls={`${id}-countries`} onClick={()=>{setOpen(!open);setQuery('')}}><Flag code={selected[0]}/><span>+{selected[2]}</span><ChevronDown size={13}/></button>
 <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={30} value={selected[0]==='PH'&&digits.length===10?`${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`:digits} placeholder="917 000 0000" aria-describedby={`${id}-hint`} aria-invalid={touched&&!!message} ref={node=>{node?.setCustomValidity(message)}} onInvalid={()=>setTouched(true)} onBlur={()=>setTouched(true)} onChange={e=>{const next=parse(e.target.value,selected[0]);setSelected(next.country);setDigits(next.digits)}}/><input type="hidden" name={name} value={digits?`+${selected[2]}${digits}`:''}/>
 {open&&<div className="mobile-country-picker" id={`${id}-countries`} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}}}><label className="mobile-country-search"><Search size={16}/><input autoFocus type="search" aria-label="Search countries" placeholder="Search country or code" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="mobile-country-options">{countries.filter(c=>c.join(' ').toLowerCase().includes(query.toLowerCase().replace('+',''))).map(c=><button key={c[0]} type="button" aria-pressed={selected[0]===c[0]} onPointerDown={e=>e.preventDefault()} onClick={()=>{setSelected(c);setOpen(false);trigger.current?.focus()}}><Flag code={c[0]}/><span>{c[1]}</span><small>+{c[2]}</small>{selected[0]===c[0]&&<Check size={14}/>}</button>)}{!countries.some(c=>c.join(' ').toLowerCase().includes(query.toLowerCase().replace('+','')))&&<p>No matching countries.</p>}</div></div>}
 </div><small id={`${id}-hint`}>{touched&&message?message:'For reservation and arrival coordination.'}</small></div>;
}
// eslint-disable-next-line @next/next/no-img-element -- local SVG flag icons
function Flag({code}:{code:string}){return <img src={`/flags/${code.toLowerCase()}.svg`} width={24} height={18} alt=""/>}
