"use client";
import { userMessage } from "@/lib/errors";
import {useRef,useState} from "react";
import type {Occupant,Party} from "@/lib/hotel-operations";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
import ReservationDndControl from "./reservation-dnd-control";
type DraftOccupant=Omit<Occupant,"occupantId"|"guestId"> & {occupantId?:string;guestId?:string|null;clientKey?:string};
type Verification = { occupantId: string; checkInDate: string; version: number };
const arrivalDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" });

export default function ReservationPartyPanel({reservationId,editable=false,canSetDnd=false}:{reservationId:string;editable?:boolean;canSetDnd?:boolean}){
 const url=`/api/staff/reservations/${encodeURIComponent(reservationId)}/guests`;
 const{data,error:loadError,loading,refresh,setData}=useHotelResource<Party>(url);
 const[draft,setDraft]=useState<DraftOccupant[]|null>(null),[name,setName]=useState(""),[newType,setNewType]=useState<Occupant["occupantType"]>("unknown");
 const [verification, setVerification] = useState<Verification | null>(null);
 const [evidenceType, setEvidenceType] = useState<"dob" | "age">("dob");
 const [evidence, setEvidence] = useState("");
 const [idChecked, setIdChecked] = useState(false);
 const[error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[completeRegister,setCompleteRegister]=useState(false);
 const retry=useRef<{body:string;key:string}|null>(null);
 const presenceRetries=useRef(new Map<string,string>()),verifyRetries=useRef(new Map<string,{body:string;key:string}>());
 const members:DraftOccupant[]=draft??(data?.members??[]);
 const registeredPrimary = members.find(member => member.role === "primary");
 const primaryMatches = Boolean(registeredPrimary && registeredPrimary.guestId === data?.primaryGuestId);
 const canVerify = editable && Boolean(data?.checkInDate) && (data?.status === "confirmed" || data?.status === "checked_in");
 const ageIssue = data?.status === "confirmed" ? data.primaryAgeIssue : null;
 async function save(){
  if(!data)return;setBusy(true);setError("");
  const payload=members.map(member=>({
   ...(member.occupantId?{occupantId:member.occupantId}:{}),
   ...(member.guestId!==undefined?{guestId:member.guestId}:{}),
   name:member.name,role:member.role,occupantType:member.occupantType,dateOfBirth:member.dateOfBirth,nationality:member.nationality,
  }));
  if(completeRegister&&payload.length!==data.declaredCount){setError("Add or remove staying guests so the list matches the number on the reservation.");setBusy(false);return;}
  const body=JSON.stringify({members:payload,completeRegister,expectedVersion:data.version});
  if(retry.current?.body!==body)retry.current={body,key:crypto.randomUUID()};
  try{
   const result=await hotelRequest<Party>(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/guests`,{members:payload,completeRegister,expectedVersion:data.version,idempotencyKey:retry.current.key});
   setData(result);setDraft(null);retry.current=null;setCompleteRegister(false);setNotice("Staying guests saved.");
  }catch(e){setError(userMessage((e as Error), "We couldn't confirm the update. Check the record before trying again."));}finally{setBusy(false);}
 }
 function openVerification(occupantId: string) {
  if (!data?.checkInDate) return;
  setVerification({ occupantId, checkInDate: data.checkInDate, version: data.version });
  setEvidenceType("dob");
  setEvidence("");
  setIdChecked(false);
  setError("");
  setNotice("");
 }
 async function verify() {
  if (!verification || !idChecked || !evidence) return;
  setBusy(true);
  setError("");
  const { occupantId, checkInDate, version } = verification;
  const payload = {
   ...(evidenceType === "dob" ? { dateOfBirth: evidence } : { verifiedAgeYears: Number(evidence) }),
   expectedCheckIn: checkInDate,
   expectedVersion: version,
   idChecked,
  };
  const body = JSON.stringify(payload);
  const previous = verifyRetries.current.get(occupantId);
  const key = previous?.body === body ? previous.key : crypto.randomUUID();
  verifyRetries.current.set(occupantId, { body, key });
  try{
   await hotelRequest(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/occupants/${occupantId}/verify`,{
    ...payload,idempotencyKey:key,
   });
   verifyRetries.current.delete(occupantId);
   setVerification(null);
   setEvidence("");
   await refresh();
   setNotice("ID and age evidence recorded.");
  }catch(e){setError(userMessage((e as Error), "We couldn't confirm the update. Check the record before trying again."));}finally{setBusy(false);}
 }
 async function presence(member:DraftOccupant,action:"arrive"|"depart"){
  if(!data||!member.occupantId)return;setBusy(true);setError("");
  const retryKey=`${member.occupantId}:${action}:${data.version}`;
  if(!presenceRetries.current.has(retryKey))presenceRetries.current.set(retryKey,crypto.randomUUID());
  try{
   await hotelRequest(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/occupants/${member.occupantId}/presence`,{action,expectedVersion:data.version,idempotencyKey:presenceRetries.current.get(retryKey)});
   presenceRetries.current.delete(retryKey);
   await refresh();setNotice(action==="arrive"?"Arrival recorded.":"Departure recorded.");
  }catch(e){setError(userMessage((e as Error), "We couldn't confirm the update. Check the record before trying again."));}finally{setBusy(false);}
 }
 return <section className="hotel-ops" aria-label="Staying guests">
  {editable&&data?.status==="checked_in"&&<ReservationDndControl reservationId={reservationId} checkedIn canSet={canSetDnd}/>}
  <h3>Staying guests</h3>
  <p>Companions are recorded on this stay and do not need permanent guest profiles. {data&&`${members.filter(member=>member.occupantId||member.name.trim()).length} of ${data.declaredCount} declared guests · room capacity ${data.capacity}.`}</p>
  {data&&!data.complete&&<p role="status">The staying guest list is incomplete and must match the declared count before check-in when the register policy takes effect.</p>}
  {(error||loadError)&&<p role="alert">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p>Loading staying guests…</p>:<ul className="hotel-ops-list">{members.map((member,index)=><li key={member.occupantId||member.clientKey||index}>
   <span><strong>{member.name}</strong><br/><small>{member.role==="primary"?"Primary staying guest":"Accompanying guest"} · {member.occupantType} · {member.attendanceStatus}</small></span>
   {member.idVerified && <span>ID verified</span>}
   {member.role === "primary" && ageIssue && !draft && <p role="status">
    {ageIssue === "PARTY_PRIMARY_REQUIRED" ? "Confirm the primary guest on this reservation before verifying age."
     : ageIssue === "PRIMARY_UNDER_MINIMUM_AGE" ? `The primary guest is below the minimum check-in age of ${data?.minimumBookingAge}.`
     : `Check official ID to verify the primary guest’s age for ${arrivalDate.format(new Date(data!.checkInDate + "T00:00:00Z"))}.`}
   </p>}
   {canVerify && !draft && member.occupantId && verification?.occupantId !== member.occupantId
    && (member.role === "primary" ? primaryMatches : !member.idVerified)
    && <button type="button" className="btn btn-soft" disabled={busy} onClick={() => openVerification(member.occupantId!)}>
     {member.idVerified ? "Verify age again" : "Verify ID and age"}
    </button>}
   {editable&&draft&&<div className="hotel-ops-fields">
    <label>Occupant name<input value={member.name} maxLength={160} onChange={e=>setDraft(members.map((item,i)=>i===index?{...item,name:e.target.value}:item))}/></label>
    <label>Age group<select value={member.occupantType} onChange={e=>setDraft(members.map((item,i)=>i===index?{...item,occupantType:e.target.value as Occupant["occupantType"]}:item))}><option value="unknown">Not provided</option><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option></select></label>
    {member.role!=="primary"&&member.attendanceStatus!=="present"&&<button type="button" className="btn btn-soft" onClick={()=>setDraft(members.filter((_,i)=>i!==index))}>Remove {member.name}</button>}
   </div>}
   {editable&&!draft&&data?.status==="checked_in"&&member.occupantId&&<><button type="button" className="btn btn-soft" disabled={busy||member.attendanceStatus==="present"} onClick={()=>void presence(member,"arrive")}>{member.attendanceStatus==="unknown"?"Confirm present":"Record arrival"}</button>{member.attendanceStatus==="present"&&<button type="button" className="btn btn-soft" disabled={busy} onClick={()=>void presence(member,"depart")}>Record departure</button>}{member.attendanceStatus==="unknown"&&<button type="button" className="btn btn-soft" disabled={busy} onClick={()=>void presence(member,"depart")}>Confirm absent</button>}</>}
   {verification && verification.occupantId === member.occupantId && <form className="hotel-ops-age-form" aria-label="Verify occupant ID and age" onSubmit={e=>{e.preventDefault();void verify();}}>
    <p>Check-in date <strong>{arrivalDate.format(new Date(verification.checkInDate + "T00:00:00Z"))}</strong></p>
    <div className="hotel-ops-fields">
     <label>Evidence type<select value={evidenceType} onChange={e=>{setEvidenceType(e.target.value === "age" ? "age" : "dob");setEvidence("");}}>
      <option value="dob">Date of birth from official ID</option>
      <option value="age">Exact age on the check-in date</option>
     </select></label>
     {evidenceType === "dob"
      ? <label>Date of birth<input key="dob" type="date" value={evidence} max={data?.hotelDate} required onChange={e=>setEvidence(e.target.value)}/></label>
      : <label>Age on the check-in date<input key="age" type="number" min="0" max="120" step="1" value={evidence} required onChange={e=>setEvidence(e.target.value)}/></label>}
    </div>
    <label className="hotel-ops-check"><input type="checkbox" checked={idChecked} onChange={e=>setIdChecked(e.target.checked)} required/> I checked this guest’s government-issued ID in person.</label>
    <div className="btn-row">
     <button type="submit" className="btn btn-accent" disabled={busy || !evidence || !idChecked}>Save age verification</button>
     <button type="button" className="btn btn-soft" disabled={busy} onClick={()=>{setVerification(null);setEvidence("");setError("");}}>Cancel verification</button>
    </div>
   </form>}
  </li>)}</ul>}
  {editable&&data&&<>{!primaryMatches && data.primaryGuestId && !draft && <button type="button" className="btn btn-soft" disabled={busy} onClick={()=>{
   setVerification(null);
   setDraft([{occupantId:registeredPrimary?.occupantId,guestId:data.primaryGuestId,name:data.primaryGuestName??"",role:"primary",occupantType:"unknown",nationality:null,idVerified:false,ageVerified:false,attendanceStatus:"expected",clientKey:crypto.randomUUID()},...members.filter(member=>member.role==="accompanying")]);
   setCompleteRegister(false);
  }}>Use the reservation’s primary guest</button>}{!draft&&<div className="hotel-ops-fields">
   <label>Companion name<input value={name} maxLength={160} onChange={e=>setName(e.target.value)} /></label>
   <label>Age group<select value={newType} onChange={e=>setNewType(e.target.value as Occupant["occupantType"])}><option value="unknown">Not provided</option><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option></select></label>
   <button className="btn btn-soft" type="button" disabled={busy||name.trim().length<2||members.length>=data.capacity||!members.some(m=>m.role==="primary")} onClick={()=>{setDraft([...members,{guestId:null,name:name.trim(),role:"accompanying",occupantType:newType,dateOfBirth:null,nationality:null,idVerified:false,ageVerified:false,attendanceStatus:"expected",clientKey:crypto.randomUUID()}]);setName("");setNotice("");}}>Add companion</button>
  </div>}
  {draft&&<><label className="hotel-ops-check"><input type="checkbox" checked={completeRegister} onChange={e=>setCompleteRegister(e.target.checked)} disabled={members.length!==data.declaredCount}/> I confirmed this list names everyone included in the reservation.</label><div className="btn-row">
   <button type="button" className="btn btn-accent" disabled={busy||members.filter(m=>m.role==="primary").length!==1||members.some(m=>!m.name.trim())||(completeRegister&&members.length!==data.declaredCount)} onClick={()=>void save()}>Save staying guests</button>
   <button type="button" className="btn btn-soft" disabled={busy} onClick={()=>{setDraft(null);retry.current=null;void refresh();}}>Cancel edits</button>
  </div></>}
  {!members.some(m=>m.role==="primary")&&<p role="alert">Resolve the reservation’s registered primary guest before adding companions.</p>}
  {!draft&&<div className="btn-row">
   <button type="button" className="btn btn-soft" disabled={busy||loading||!members.some(member=>member.role==="primary")} onClick={()=>{setDraft(members.map(member=>({...member})));setCompleteRegister(Boolean(data.complete));setVerification(null);setError("");setNotice("");retry.current=null;}}>Edit staying guests</button>
   <button type="button" className="btn btn-soft" disabled={loading||busy} onClick={()=>{setVerification(null);setEvidence("");setError("");void refresh();}}>Refresh staying guests</button>
  </div>}
  </>}
 </section>;
}
