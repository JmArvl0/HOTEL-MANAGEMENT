"use client";
import {useRef,useState} from "react";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
import type {RoomDiscrepancy,RoomDiscrepancyList} from "@/lib/room-discrepancies";

const occupancyLabel=(value:unknown)=>String(value??"unknown").replaceAll("_"," ");
export function RoomDiscrepancyPanel({role}:{role:string}){
 const{data,error,loading,refresh}=useHotelResource<RoomDiscrepancyList>("/api/staff/room-discrepancies");
 const[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState(""),[failure,setFailure]=useState(""),[reasons,setReasons]=useState<Record<string,string>>({});
 const retries=useRef(new Map<string,{body:string;key:string}>());
 async function act(item:RoomDiscrepancy,action:"investigate"|"resolve"){
  setBusy(item.id);setFailure("");setNotice("");
  const payload={action,reason:(reasons[item.id]??"").trim(),expectedVersion:item.version},body=JSON.stringify(payload),prior=retries.current.get(item.id);
  if(!prior||prior.body!==body)retries.current.set(item.id,{body,key:crypto.randomUUID()});
  try{
   await hotelRequest(`/api/front-desk/room-discrepancies/${item.id}/resolve`,{...payload,idempotencyKey:retries.current.get(item.id)!.key});
   retries.current.delete(item.id);
   setNotice(action==="investigate"?`Room ${item.roomNumber} snapshot refreshed for investigation.`:`Room ${item.roomNumber} discrepancy resolved.`);
   setReasons(current=>({...current,[item.id]:""}));await refresh();
  }catch(e){setFailure(e instanceof Error?e.message:"Unable to update discrepancy.");}
  finally{setBusy(null);}
 }
 return <section className="hotel-ops" aria-label="Room discrepancy investigation">
  <div className="hotel-ops-fields"><div><h3>Room discrepancy investigation</h3><p>Housekeeping reports a physical observation. Front Desk investigates it against the current room and reservation records.</p></div><button className="btn btn-soft" type="button" disabled={loading} onClick={()=>void refresh()}>Refresh</button></div>
  {(error||failure)&&<p role="alert">{failure||error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&!data?<p role="status">Loading open discrepancies…</p>:data?.items.length?<ul className="hotel-ops-list">{data.items.map(item=><li key={item.id}>
   <div><strong>Room {item.roomNumber} · {item.status}</strong><p>Observed {item.observedOccupancy}; system expected {occupancyLabel(item.systemSnapshot.expectedOccupancy)} · reported by {item.reporter??"staff"} at {new Date(item.reportedAt).toLocaleString()}</p><p>{item.reason}</p>
    {item.status==="investigating"&&<small>Current system snapshot: {occupancyLabel(item.systemSnapshot.roomStatus)}, housekeeping {occupancyLabel(item.systemSnapshot.housekeeping)}, reservation {occupancyLabel(item.systemSnapshot.reservationStatus)}.</small>}
   </div>
   {role==="front_desk"?<div className="hotel-ops-fields"><label>{item.status==="open"?"Investigation note":"Resolution reason"}<textarea maxLength={500} value={reasons[item.id]??""} onChange={event=>setReasons(current=>({...current,[item.id]:event.target.value}))}/></label>
    {item.status==="open"?<button className="btn btn-soft" type="button" disabled={busy===item.id||reasons[item.id]?.trim().length<3} onClick={()=>void act(item,"investigate")}>Refresh and investigate</button>:<button className="btn btn-accent" type="button" disabled={busy===item.id||reasons[item.id]?.trim().length<3} onClick={()=>void act(item,"resolve")}>Resolve discrepancy</button>}
   </div>:<small>Front Desk investigation required.</small>}
  </li>)}</ul>:<p>No open room discrepancies.</p>}
  {data&&<small>Snapshot generated {new Date(data.assessedAt).toLocaleString()}.</small>}
 </section>;
}

export function RoomDiscrepancyReporter({roomId,roomNumber,taskId,role}:{roomId:string;roomNumber:string;taskId?:string;role:string}){
 const[observed,setObserved]=useState<"occupied"|"vacant"|"uncertain">("uncertain"),[reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),retry=useState<{body:string;key:string}|null>(null);
 if(!["housekeeping","front_desk"].includes(role))return null;
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  const payload={observedOccupancy:observed,reason:reason.trim(),taskId:taskId??null},body=JSON.stringify(payload),prior=retry[0];
  const request=prior?.body===body?prior:{body,key:crypto.randomUUID()};if(request!==prior)retry[1](request);
  try{await hotelRequest(`/api/housekeeping/rooms/${encodeURIComponent(roomId)}/discrepancies`,{...payload,idempotencyKey:request.key});setNotice(`Occupancy observation for room ${roomNumber} sent to Front Desk.`);setReason("");retry[1](null);}
  catch(e){setError(e instanceof Error?e.message:"Unable to report room discrepancy.");}
  finally{setBusy(false);}
 }
 return <form className="hotel-ops room-discrepancy-report" onSubmit={submit}>
  <h3>Report occupancy discrepancy</h3><p>Use this when the physical room appears occupied, vacant or uncertain compared with the room assignment. Do not include guest names or private details in the report.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <label>What did you observe?<select value={observed} onChange={event=>setObserved(event.target.value as typeof observed)}><option value="uncertain">Uncertain</option><option value="occupied">Occupied</option><option value="vacant">Vacant</option></select></label>
  <label>What did you see?<textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  <button className="btn btn-soft" type="submit" disabled={busy||reason.trim().length<3}>{busy?"Sending…":"Send to Front Desk"}</button>
 </form>;
}
