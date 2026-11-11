"use client";
import {useState} from "react";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
import type {Role} from "@/lib/types";
import type {GuestOperationalFlags,GuestOperationalFlag} from "@/lib/guest-flags";

const flagLabels={vip:"VIP",do_not_rent:"Do Not Rent",security_alert:"Security alert",accessibility:"Accessibility",special_handling:"Special handling"};
export default function GuestFlagsPanel({guestId,role,onChanged}:{guestId:string;role:Role;onChanged?:()=>void}){
 const{data,error,loading,refresh}=useHotelResource<GuestOperationalFlags>(`/api/staff/guests/${encodeURIComponent(guestId)}/flags`);
 const[flagType,setFlagType]=useState<GuestOperationalFlag["flagType"]>("vip"),[instructions,setInstructions]=useState(""),[restricted,setRestricted]=useState(""),[expiry,setExpiry]=useState(""),[reason,setReason]=useState(""),[revokeReason,setRevokeReason]=useState(""),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState(""),[notice,setNotice]=useState("");
 const canManage=role==="manager"||role==="owner";
 async function create(event:React.FormEvent){event.preventDefault();setBusy(true);setFailure("");setNotice("");
  try{await hotelRequest(`/api/staff/guests/${encodeURIComponent(guestId)}/flags`,{flagType,instructions:instructions.trim()||null,restrictedNote:restricted.trim()||null,expiresAt:expiry?new Date(expiry).toISOString():null,reason:reason.trim()});
   setInstructions("");setRestricted("");setExpiry("");setReason("");setNotice("Guest flag recorded.");onChanged?.();await refresh();
  }catch(e){setFailure(e instanceof Error?e.message:"Unable to record guest flag.");}finally{setBusy(false);}
 }
 async function revoke(flag:GuestOperationalFlag){setBusy(true);setFailure("");setNotice("");
  try{await hotelRequest(`/api/staff/guests/${encodeURIComponent(guestId)}/flags`,{flagId:flag.id,version:flag.version,reason:revokeReason.trim()},"PATCH");
   setSelected(null);setRevokeReason("");setNotice("Guest flag revoked and logged.");onChanged?.();await refresh();
  }catch(e){setFailure(e instanceof Error?e.message:"Unable to revoke guest flag.");}finally{setBusy(false);}
 }
 return <section className="hotel-ops guest-flags" aria-label="Guest operational flags">
  <h3>Operational guest flags</h3><p>Flags are visible only to authorized hotel staff. Restricted incident notes are shown to management only.</p>
  {(failure||error)&&<p role="alert">{failure||error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&!data?<p role="status">Loading guest flags…</p>:data?.items.length?<ul className="hotel-ops-list">{data.items.map(flag=><li key={flag.id}>
   <div><strong>{flagLabels[flag.flagType]}</strong><p>{flag.instructions??"No operational instruction recorded."}</p>
    {flag.restrictedNote?<small>Restricted management note: {flag.restrictedNote}</small>:flag.flagType==="security_alert"||flag.flagType==="do_not_rent"?<small>Restricted note available to Management only.</small>:null}
    {flag.expiresAt&&<small>Expires {new Date(flag.expiresAt).toLocaleString()}</small>}
   </div>
   {canManage&&<div className="hotel-ops-fields">{selected===flag.id?<><label>Revocation reason<textarea required minLength={3} maxLength={500} value={revokeReason} onChange={event=>setRevokeReason(event.target.value)}/></label><div className="btn-row"><button type="button" className="btn btn-accent" disabled={busy||revokeReason.trim().length<3} onClick={()=>void revoke(flag)}>Confirm revoke</button><button type="button" className="btn btn-soft" onClick={()=>setSelected(null)}>Cancel</button></div></>:<button className="btn btn-soft" type="button" onClick={()=>{setSelected(flag.id);setRevokeReason("");}}>Revoke flag</button>}</div>}
  </li>)}</ul>:<p>No active operational flags.</p>}
  {canManage&&<form onSubmit={create} className="hotel-ops-fields">
   <h4>Add operational flag</h4>
   <label>Flag type<select value={flagType} onChange={event=>setFlagType(event.target.value as GuestOperationalFlag["flagType"])}>{Object.entries(flagLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
   <label>Operational instruction<textarea maxLength={500} value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="Instructions visible to Front Desk"/></label>
   {flagType==="do_not_rent"||flagType==="security_alert"?<label>Restricted management note<textarea required={flagType==="do_not_rent"} minLength={3} maxLength={1000} value={restricted} onChange={event=>setRestricted(event.target.value)}/></label>:null}
   <label>Expires at (optional)<input type="datetime-local" value={expiry} onChange={event=>setExpiry(event.target.value)}/></label>
   <label>Reason<textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <div className="btn-row"><button className="btn btn-accent" disabled={busy||reason.trim().length<3||(flagType==="do_not_rent"&&restricted.trim().length<3)}>{busy?"Saving…":"Add flag"}</button><button type="button" className="btn btn-soft" disabled={loading||busy} onClick={()=>void refresh()}>Refresh flags</button></div>
  </form>}
 </section>;
}

type DnrItems={items:import("@/lib/guest-flags").ReservationDnrFlag[]};
export function ReservationDnrOverridePanel({reservationId}:{reservationId:string}){
 const{data,error,loading,refresh}=useHotelResource<DnrItems>(`/api/staff/reservations/${encodeURIComponent(reservationId)}/flag-overrides`);
 const[purpose,setPurpose]=useState<"booking"|"check_in">("check_in"),[expiresAt,setExpiresAt]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState<string|null>(null),[failure,setFailure]=useState(""),[notice,setNotice]=useState("");
 async function create(flag:import("@/lib/guest-flags").ReservationDnrFlag){setBusy(flag.flagId);setFailure("");setNotice("");
  if(!expiresAt){setFailure("Choose when this exception expires.");setBusy(null);return;}
  try{await hotelRequest(`/api/staff/reservations/${encodeURIComponent(reservationId)}/flag-overrides`,{flagId:flag.flagId,purpose,flagVersion:flag.flagVersion,reason:reason.trim(),expiresAt:new Date(expiresAt).toISOString()});
   setNotice("Reservation-specific Do Not Rent exception recorded.");setReason("");await refresh();
  }catch(e){setFailure(e instanceof Error?e.message:"Unable to record exception.");}finally{setBusy(null);}
 }
 async function revoke(id:string,version:number){setBusy(id);setFailure("");setNotice("");
  try{await hotelRequest(`/api/staff/reservations/${encodeURIComponent(reservationId)}/flag-overrides/${id}`,{version,reason:reason.trim()},"DELETE");setNotice("Reservation exception revoked.");setReason("");await refresh();}
  catch(e){setFailure(e instanceof Error?e.message:"Unable to revoke exception.");}finally{setBusy(null);}
 }
 return <section className="hotel-ops" aria-label="Do Not Rent reservation review"><h3>Do Not Rent review</h3><p>Management exceptions apply to one reservation, one active flag version, one purpose and a stated expiry. They do not waive other arrival requirements.</p>
  {(error||failure)&&<p role="alert">{failure||error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&!data?<p role="status">Checking active restrictions…</p>:data?.items.length?<>
   {data.items.map(flag=><article key={flag.flagId} className="hotel-ops-list"><strong>{flag.guestName} · Do Not Rent</strong><p>{flag.restrictedNote}</p>{flag.instructions&&<p>Operational instruction: {flag.instructions}</p>}
    {flag.overrides.map(item=><p key={item.id}>Active {item.purpose.replaceAll("_"," ")} exception until {new Date(item.expiresAt).toLocaleString()} <button type="button" className="btn btn-soft" disabled={busy===item.id||reason.trim().length<3} onClick={()=>void revoke(item.id,item.version)}>Revoke</button></p>)}
    <div className="hotel-ops-fields"><label>Exception purpose<select value={purpose} onChange={event=>setPurpose(event.target.value as typeof purpose)}><option value="check_in">Check-in</option><option value="booking">Booking confirmation</option></select></label>
     <label>Expires at<input type="datetime-local" value={expiresAt} onChange={event=>setExpiresAt(event.target.value)}/></label>
     <label>Approval reason<textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
     <button type="button" className="btn btn-accent" disabled={busy===flag.flagId||reason.trim().length<3||!expiresAt} onClick={()=>void create(flag)}>Approve this reservation exception</button>
    </div>
   </article>)}
  </>:<p>No active Do Not Rent flags are linked to this reservation.</p>}
  <button type="button" className="btn btn-soft" disabled={loading} onClick={()=>void refresh()}>Refresh flag review</button>
 </section>;
}
