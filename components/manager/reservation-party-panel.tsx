"use client";
import {useRef,useState} from "react";
import type {Occupant,Party} from "@/lib/hotel-operations";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
import ReservationDndControl from "./reservation-dnd-control";
type DraftOccupant=Omit<Occupant,"occupantId"|"guestId"> & {occupantId?:string;guestId?:string|null;clientKey?:string};
export default function ReservationPartyPanel({reservationId,editable=false,canSetDnd=false}:{reservationId:string;editable?:boolean;canSetDnd?:boolean}){
 const url=`/api/staff/reservations/${encodeURIComponent(reservationId)}/guests`;
 const{data,error:loadError,loading,refresh,setData}=useHotelResource<Party>(url);
 const[draft,setDraft]=useState<DraftOccupant[]|null>(null),[name,setName]=useState(""),[newType,setNewType]=useState<Occupant["occupantType"]>("unknown");
 const[verifyId,setVerifyId]=useState<string|null>(null),[dob,setDob]=useState(""),[age,setAge]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[completeRegister,setCompleteRegister]=useState(false);
 const retry=useRef<{body:string;key:string}|null>(null);
 const presenceRetries=useRef(new Map<string,string>()),verifyRetries=useRef(new Map<string,{body:string;key:string}>());
 const members:DraftOccupant[]=draft??(data?.members??[]);
 async function save(){
  if(!data)return;setBusy(true);setError("");
  const payload=members.map(member=>({
   ...(member.occupantId?{occupantId:member.occupantId}:{}),
   ...(member.guestId!==undefined?{guestId:member.guestId}:{}),
   name:member.name,role:member.role,occupantType:member.occupantType,dateOfBirth:member.dateOfBirth,nationality:member.nationality,
  }));
  if(completeRegister&&payload.length!==data.declaredCount){setError("The list must match the declared guest count before it can be confirmed.");setBusy(false);return;}
  const body=JSON.stringify({members:payload,completeRegister,expectedVersion:data.version});
  if(retry.current?.body!==body)retry.current={body,key:crypto.randomUUID()};
  try{
   const result=await hotelRequest<Party>(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/guests`,{members:payload,completeRegister,expectedVersion:data.version,idempotencyKey:retry.current.key});
   setData(result);setDraft(null);retry.current=null;setCompleteRegister(false);setNotice("Staying guests saved.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function verify(member:DraftOccupant){
  if(!member.occupantId)return;setBusy(true);setError("");
  const payload={...(dob?{dateOfBirth:dob}:{}),...(age?{verifiedAgeYears:Number(age)}:{})},body=JSON.stringify(payload),previous=verifyRetries.current.get(member.occupantId!);
  if(!previous||previous.body!==body)verifyRetries.current.set(member.occupantId!,{body,key:crypto.randomUUID()});
  try{
   await hotelRequest(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/occupants/${member.occupantId}/verify`,{
    ...payload,idempotencyKey:verifyRetries.current.get(member.occupantId!)!.key,
   });verifyRetries.current.delete(member.occupantId!);setVerifyId(null);setDob("");setAge("");await refresh();setNotice("ID check recorded by Front Desk.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function presence(member:DraftOccupant,action:"arrive"|"depart"){
  if(!data||!member.occupantId)return;setBusy(true);setError("");
  const retryKey=`${member.occupantId}:${action}:${data.version}`;
  if(!presenceRetries.current.has(retryKey))presenceRetries.current.set(retryKey,crypto.randomUUID());
  try{
   await hotelRequest(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/occupants/${member.occupantId}/presence`,{action,expectedVersion:data.version,idempotencyKey:presenceRetries.current.get(retryKey)});
   presenceRetries.current.delete(retryKey);
   await refresh();setNotice(action==="arrive"?"Arrival recorded.":"Departure recorded.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="hotel-ops" aria-label="Staying guests">
  {editable&&data?.status==="checked_in"&&<ReservationDndControl reservationId={reservationId} checkedIn canSet={canSetDnd}/>}
  <h3>Staying guests</h3>
  <p>Companions are recorded on this stay and do not need permanent guest profiles. {data&&`${members.filter(member=>member.occupantId||member.name.trim()).length} of ${data.declaredCount} declared guests · room capacity ${data.capacity}.`}</p>
  {data&&!data.complete&&<p role="status">The staying guest list is incomplete and must match the declared count before check-in when the register policy takes effect.</p>}
  {(error||loadError)&&<p role="alert">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p>Loading staying guests…</p>:<ul className="hotel-ops-list">{members.map((member,index)=><li key={member.occupantId||member.clientKey||index}>
   <span><strong>{member.name}</strong><br/><small>{member.role==="primary"?"Primary staying guest":"Accompanying guest"} · {member.occupantType} · {member.attendanceStatus}</small></span>
   {member.idVerified?<span>ID verified</span>:editable&&member.occupantId&&<button type="button" className="btn btn-soft" disabled={busy||Boolean(draft)} onClick={()=>{setVerifyId(verifyId===member.occupantId?null:member.occupantId??null);setDob("");setAge("");}}>Verify ID</button>}
   {editable&&draft&&<div className="hotel-ops-fields">
    <label>Occupant name<input value={member.name} maxLength={160} onChange={e=>setDraft(members.map((item,i)=>i===index?{...item,name:e.target.value}:item))}/></label>
    <label>Age group<select value={member.occupantType} onChange={e=>setDraft(members.map((item,i)=>i===index?{...item,occupantType:e.target.value as Occupant["occupantType"]}:item))}><option value="unknown">Not provided</option><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option></select></label>
    {member.role!=="primary"&&member.attendanceStatus!=="present"&&<button type="button" className="btn btn-soft" onClick={()=>setDraft(members.filter((_,i)=>i!==index))}>Remove {member.name}</button>}
   </div>}
   {editable&&!draft&&data?.status==="checked_in"&&member.occupantId&&<><button type="button" className="btn btn-soft" disabled={busy||member.attendanceStatus==="present"} onClick={()=>void presence(member,"arrive")}>{member.attendanceStatus==="unknown"?"Confirm present":"Record arrival"}</button>{member.attendanceStatus==="present"&&<button type="button" className="btn btn-soft" disabled={busy} onClick={()=>void presence(member,"depart")}>Record departure</button>}{member.attendanceStatus==="unknown"&&<button type="button" className="btn btn-soft" disabled={busy} onClick={()=>void presence(member,"depart")}>Confirm absent</button>}</>}
   {verifyId===member.occupantId&&<form className="hotel-ops-fields" onSubmit={e=>{e.preventDefault();void verify(member);}}>
    <label>Date of birth from ID<input type="date" value={dob} onChange={e=>setDob(e.target.value)}/></label>
    <label>Verified age if DOB is not recorded<input type="number" min="0" max="120" value={age} onChange={e=>setAge(e.target.value)} /></label>
    <small>Front Desk must inspect official ID in person. An uploaded document is not age verification.</small>
    <button type="submit" className="btn btn-accent" disabled={busy||(!dob&&!age)}>Record ID verification</button>
   </form>}
  </li>)}</ul>}
  {editable&&data&&<>{!members.some(m=>m.role==="primary")&&data.primaryGuestId&&<button type="button" className="btn btn-soft" disabled={Boolean(draft)||busy} onClick={()=>{setDraft([{guestId:data.primaryGuestId,name:data.primaryGuestName??"",role:"primary",occupantType:"unknown",dateOfBirth:null,nationality:null,idVerified:false,ageVerified:false,attendanceStatus:"expected",clientKey:crypto.randomUUID()}]);}}>Add the reservation’s primary guest to this register</button>}{!draft&&<div className="hotel-ops-fields">
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
   <button type="button" className="btn btn-soft" disabled={busy||loading||!members.some(member=>member.role==="primary")} onClick={()=>{setDraft(members.map(member=>({...member})));setCompleteRegister(Boolean(data.complete));setVerifyId(null);setError("");setNotice("");retry.current=null;}}>Edit staying guests</button>
   <button type="button" className="btn btn-soft" disabled={loading||busy} onClick={()=>void refresh()}>Refresh staying guests</button>
  </div>}
  </>}
 </section>;
}
