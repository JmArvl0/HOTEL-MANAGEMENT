"use client";
import {useEffect,useState} from "react";
import type {OccupantPolicy} from "@/lib/hotel-operations";
import "./occupant-policy.css";
export default function OccupantPolicySection(){
 const[policy,setPolicy]=useState<OccupantPolicy|null>(null),[registerDate,setRegisterDate]=useState(""),[ageDate,setAgeDate]=useState(""),
  [reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function load(){
  setLoading(true);setError("");
  try{const response=await fetch("/api/admin/occupant-policy",{cache:"no-store"}),result=await response.json();
   if(!response.ok)throw new Error(result.error??"Occupant policy is unavailable.");
   setPolicy(result.data);setRegisterDate(result.data.registerEffectiveFrom??"");setAgeDate(result.data.ageEffectiveFrom??"");
  }catch(e){setError(e instanceof Error?e.message:"Occupant policy is unavailable.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[]);
 const timezone=policy?.hotelTimezone??"Asia/Manila";
 const localDate=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const minimum=new Date(`${localDate}T00:00:00Z`);minimum.setUTCDate(minimum.getUTCDate()+7);
 const minDate=minimum.toISOString().slice(0,10);
 async function save(event:React.FormEvent){
  event.preventDefault();if(!policy)return;setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/occupant-policy",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    registerEffectiveFrom:registerDate||null,ageEffectiveFrom:ageDate||null,version:policy.version,reason,
   })}),result=await response.json();
   if(!response.ok)throw new Error(result.error??"Unable to update occupant policy.");
   setPolicy(result.data);setNotice("Occupant policy saved. Staff must complete each register and age check before the effective date.");
   setReason("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to update occupant policy.");}
  finally{setBusy(false);}
 }
 return <section className="data-panel admin-occupant-policy" aria-labelledby="occupant-policy-title">
  <div className="occupant-policy-intro"><h3 id="occupant-policy-title">Staying guest register and age checks</h3><p>Choose future dates so staff can prepare arrivals. Check-in enforces the complete guest list and the minimum age in the current hotel policy.</p></div>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p>Loading occupant policy…</p>:policy&&<form onSubmit={save}>
   <div className="occupant-policy-dates">
    <label>Require a complete named register from
     <input type="date" min={minDate} value={registerDate} onChange={e=>setRegisterDate(e.target.value)}/>
    </label>
    <label>Require verified primary guest age from
     <input type="date" min={minDate} value={ageDate} onChange={e=>setAgeDate(e.target.value)}/>
    </label>
   </div>
   <p>Minimum booking age: {policy.minimumBookingAge}. Effective dates are at least seven hotel-local calendar days ahead. Once enabled, an active rule cannot be cleared; move its effective date forward with a recorded reason.</p>
   <label>Policy change reason<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></label>
   <div className="btn-row"><button type="submit" className="btn btn-accent" disabled={busy||!reason.trim()}>{busy?"Saving…":"Save occupant policy"}</button><button type="button" className="btn btn-soft" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
  </form>}
 </section>;
}
