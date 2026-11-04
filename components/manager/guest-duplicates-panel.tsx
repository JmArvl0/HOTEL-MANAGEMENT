"use client";
import {useRef,useState} from "react";
import type {DuplicateCandidate} from "@/lib/guest-duplicates";
import {guestMergeFields,type GuestMergeField,type GuestMergeFieldChoices,type GuestMergePreview} from "@/lib/guest-merge";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";

const fieldLabels:Record<GuestMergeField,string>={name:"Display name",first_name:"First name",last_name:"Last name",email:"Email",phone:"Phone",nationality:"Nationality",address:"Address",preferences:"Preferences",special_requests:"Special handling notes"};
const initialChoices:GuestMergeFieldChoices={name:"survivor",first_name:"survivor",last_name:"survivor",email:"survivor",phone:"survivor",nationality:"survivor",address:"survivor",preferences:"survivor",special_requests:"survivor"};
const showValue=(value:string|null)=>value?.trim()||"Not provided";

export default function GuestDuplicatesPanel(){
 const{data:items,error:loadError,loading,refresh}=useHotelResource<DuplicateCandidate[]>("/api/staff/guests/duplicates");
 const[selected,setSelected]=useState<DuplicateCandidate|null>(null),[decision,setDecision]=useState("needs_identity_review"),[reviewReason,setReviewReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[sourceId,setSourceId]=useState(""),[survivorId,setSurvivorId]=useState(""),[preview,setPreview]=useState<GuestMergePreview|null>(null),[choices,setChoices]=useState<GuestMergeFieldChoices>(initialChoices),[mergeReason,setMergeReason]=useState(""),[mergeBusy,setMergeBusy]=useState(false),[mergeError,setMergeError]=useState(""),[reviewed,setReviewed]=useState(false);
 const mergeRetry=useRef<{body:string;key:string}|null>(null);
 async function saveReview(){if(!selected)return;setBusy(true);setError("");try{await hotelRequest("/api/staff/guests/duplicates",{pairKey:selected.pairKey,decision,reason:reviewReason});setSelected(null);setReviewReason("");await refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to save this identity review.");}finally{setBusy(false);}}
 function beginMerge(source:string,survivor:string){setSourceId(source);setSurvivorId(survivor);setPreview(null);setChoices(initialChoices);setMergeReason("");setMergeError("");setReviewed(false);mergeRetry.current=null;}
 async function loadPreview(){setMergeBusy(true);setMergeError("");setPreview(null);setReviewed(false);try{const result=await hotelRequest<GuestMergePreview>("/api/staff/guests/merge/preview",{sourceId:sourceId.trim(),survivorId:survivorId.trim()});setPreview(result);}catch(e){setMergeError(e instanceof Error?e.message:"Unable to prepare this merge preview.");}finally{setMergeBusy(false);}}
 async function commitMerge(){if(!preview||!preview.canMerge||!reviewed||mergeReason.trim().length<3)return;setMergeBusy(true);setMergeError("");const payload={sourceId:preview.source.id,survivorId:preview.survivor.id,fieldChoices:choices,reason:mergeReason.trim(),fingerprint:preview.fingerprint};const body=JSON.stringify(payload);if(!mergeRetry.current||mergeRetry.current.body!==body)mergeRetry.current={body,key:crypto.randomUUID()};try{await hotelRequest("/api/staff/guests/merge",{...payload,idempotencyKey:mergeRetry.current.key});mergeRetry.current=null;setPreview(null);setSourceId("");setSurvivorId("");setMergeReason("");setReviewed(false);setNotice(`Guest profile ${payload.sourceId} was merged into ${payload.survivorId}.`);await refresh();}catch(e){setMergeError(e instanceof Error?e.message:"Unable to merge these guest profiles.");}finally{setMergeBusy(false);}}
 const linked=(kind:"source"|"survivor")=>Object.entries(preview?.referenceCounts??{}).filter(([,counts])=>counts[kind]>0).map(([name,counts])=>`${name}: ${counts[kind]}`);
 return <section className="hotel-ops guest-identity-review" aria-label="Guest identity review">
  <h2>Guest identity review</h2>
  <p>Shared email or phone details are review evidence only. Names never create automatic matches. Merges preserve historical links and aliases, and do not move login accounts or loyalty balances.</p>
  {(error||loadError)&&<p role="alert">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p>Checking candidate records…</p>:items?.length?<ul className="hotel-ops-list">{items.map(pair=><li key={pair.pairKey}>
   <strong>{pair.guests.map(g=>`${g.name} (${g.id})`).join(" · ")}</strong><span>{pair.reason} · {pair.evidence}</span>
   {pair.protected&&<strong>Protected: login account ownership cannot be merged</strong>}<span>{pair.decision?.replaceAll("_"," ")??"Awaiting review"}</span>
   <div className="btn-row"><button type="button" className="btn btn-soft" onClick={()=>{setSelected(pair);setDecision(pair.decision??"needs_identity_review");setReviewReason("");}}>Review pair</button>
    <button type="button" className="btn btn-soft" onClick={()=>beginMerge(pair.guests[1].id,pair.guests[0].id)}>Preview merge</button></div>
  </li>)}</ul>:<p>No candidates with exact shared email or phone. You can still prepare a manual review using two guest IDs.</p>}
  {selected&&<form onSubmit={event=>{event.preventDefault();void saveReview();}} className="hotel-ops-fields">
   <strong>Review {selected.guests.map(g=>g.name).join(" / ")}</strong>
   <label>Review decision<select value={decision} onChange={event=>setDecision(event.target.value)}><option value="needs_identity_review">Needs identity review</option><option value="dismissed">Dismiss candidate</option><option value="do_not_merge">Keep separate</option></select></label>
   <label>Evidence and reason<textarea required minLength={3} maxLength={500} value={reviewReason} onChange={event=>setReviewReason(event.target.value)}/></label>
   <div className="btn-row"><button className="btn btn-accent" disabled={busy||reviewReason.trim().length<3}>Record review</button><button className="btn btn-soft" type="button" onClick={()=>setSelected(null)}>Cancel</button></div>
  </form>}
  <section className="hotel-ops" aria-label="Prepare a reviewed guest profile merge">
   <h3>Prepare a profile merge</h3><p>Choose source and survivor explicitly. A preview checks account ownership, loyalty history, prior merge history, flags and linked records before enabling the commit.</p>
   <div className="hotel-ops-fields"><label>Source guest ID<input value={sourceId} onChange={event=>{setSourceId(event.target.value);setPreview(null);}} maxLength={100}/></label>
    <label>Surviving guest ID<input value={survivorId} onChange={event=>{setSurvivorId(event.target.value);setPreview(null);}} maxLength={100}/></label>
    <button type="button" className="btn btn-soft" disabled={mergeBusy||!sourceId.trim()||!survivorId.trim()||sourceId.trim()===survivorId.trim()} onClick={()=>void loadPreview()}>{mergeBusy?"Preparing…":"Load merge preview"}</button></div>
   {mergeError&&<p role="alert">{mergeError}</p>}
   {preview&&<div className="guest-merge-preview">
    <h4>Merge preview</h4><p>Source: <strong>{preview.source.name}</strong> ({preview.source.id}) · {showValue(preview.source.email)} · {showValue(preview.source.phone)}</p>
    <p>Survivor: <strong>{preview.survivor.name}</strong> ({preview.survivor.id}) · {showValue(preview.survivor.email)} · {showValue(preview.survivor.phone)}</p>
    <p>Active flags: source {preview.activeFlags.source}, survivor {preview.activeFlags.survivor}. Flags remain attached to their original guest IDs and apply through the survivor alias.</p>
    <details><summary>Linked record counts</summary><div className="hotel-ops-fields"><p>Source: {linked("source").join(" · ")||"No linked records"}</p><p>Survivor: {linked("survivor").join(" · ")||"No linked records"}</p></div></details>
    {preview.blockingReasons.length>0&&<div role="alert"><strong>This pair cannot be merged.</strong><ul>{preview.blockingReasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
    <div className="hotel-ops-fields" aria-label="Choose the surviving profile field values">{guestMergeFields.map(field=><label key={field}>{fieldLabels[field]}<span>Source: {showValue(preview.fields[field].source)}</span><span>Survivor: {showValue(preview.fields[field].survivor)}</span>
     <select value={choices[field]} disabled={!preview.canMerge} onChange={event=>setChoices(current=>({...current,[field]:event.target.value as "source"|"survivor"}))}><option value="survivor">Keep survivor value</option><option value="source">Use source value</option></select>
    </label>)}</div>
    {preview.canMerge&&<><label>Merge reason and identity evidence<textarea required minLength={3} maxLength={1000} value={mergeReason} onChange={event=>setMergeReason(event.target.value)}/></label>
     <label className="hotel-ops-check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/> I verified the two records refer to the same person and reviewed each selected field.</label>
     <button type="button" className="btn btn-accent" disabled={mergeBusy||!reviewed||mergeReason.trim().length<3} onClick={()=>void commitMerge()}>{mergeBusy?"Merging…":"Merge profiles"}</button>
    </>}
    <button type="button" className="btn btn-soft" disabled={mergeBusy} onClick={()=>void loadPreview()}>Refresh merge preview</button>
   </div>}
  </section>
  <button type="button" className="btn btn-soft" disabled={loading||busy} onClick={()=>void refresh()}>Refresh candidates</button>
 </section>;
}
