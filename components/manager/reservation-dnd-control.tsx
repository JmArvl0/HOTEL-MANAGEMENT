"use client";
import {useRef,useState} from "react";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
import type {ReservationServiceCondition} from "@/lib/housekeeping-service";
export default function ReservationDndControl({reservationId,checkedIn,canSet=true}:{reservationId:string;checkedIn:boolean;canSet?:boolean}){
 const{data,error,loading,refresh}=useHotelResource<ReservationServiceCondition>(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/service-condition`);
 const[busy,setBusy]=useState(false),[reason,setReason]=useState(""),[failure,setFailure]=useState(""),[notice,setNotice]=useState("");
 const retries=useRef(new Map<string,{body:string;key:string}>());
 async function update(action:"set"|"clear"){
  if(reason.trim().length<3){setFailure("Enter a service note before updating DND.");return;}
  setBusy(true);setFailure("");setNotice("");const body=JSON.stringify({action,reason:reason.trim()}),prior=retries.current.get(action);
  if(!prior||prior.body!==body)retries.current.set(action,{body,key:crypto.randomUUID()});
  try{await hotelRequest(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/service-condition`,{action,reason:reason.trim(),idempotencyKey:retries.current.get(action)!.key});
   retries.current.delete(action);setReason("");setNotice(action==="set"?"Do Not Disturb is active for this stay.":"Do Not Disturb was cleared and logged.");await refresh();
  }catch(e){setFailure(e instanceof Error?e.message:"Unable to update the service instruction.");}finally{setBusy(false);}
 }
 if(!checkedIn)return null;
 return <section className="hotel-ops reservation-dnd-control" aria-label="Do Not Disturb service instruction">
  <div><strong>{data?.dndActive?"Do Not Disturb active":"Do Not Disturb inactive"}</strong><p>Applies to routine stayover cleaning for this reservation and follows its room move. Checkout cleaning and inspection rules still apply.</p>{data?.setAt&&<small>Recorded {new Date(data.setAt).toLocaleString()}</small>}</div>
  {(error||failure)&&<p role="alert">{failure||error}</p>}{notice&&<p role="status">{notice}</p>}
  <label>Service note<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  <div className="btn-row">{data?.dndActive?<button type="button" className="btn btn-soft" disabled={loading||busy||reason.trim().length<3} onClick={()=>void update("clear")}>Clear DND</button>:canSet?<button type="button" className="btn btn-soft" disabled={loading||busy||reason.trim().length<3} onClick={()=>void update("set")}>Set DND</button>:null}
   <button type="button" className="btn btn-soft" disabled={loading||busy} onClick={()=>void refresh()}>Refresh service instruction</button></div>
 </section>;
}
