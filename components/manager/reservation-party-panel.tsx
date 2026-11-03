"use client";
import {useState,useRef} from "react";
import type {Party} from "@/lib/hotel-operations";
import {hotelRequest,useHotelResource} from "./hotel-operations-client";
export default function ReservationPartyPanel({reservationId,editable=false}:{reservationId:string;editable?:boolean}){
 const url=`/api/staff/reservations/${encodeURIComponent(reservationId)}/guests`;
 const{data,error:loadError,loading,refresh,setData}=useHotelResource<Party>(url);
 const[draft,setDraft]=useState<Party["members"]|null>(null),[name,setName]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const retry=useRef<{body:string;key:string}|null>(null);
 const members=draft??data?.members??[];
 async function save(){if(!data)return;setBusy(true);setError("");const body=JSON.stringify(members);if(retry.current?.body!==body)retry.current={body,key:crypto.randomUUID()};try{setData(await hotelRequest<Party>(`/api/front-desk/reservations/${encodeURIComponent(reservationId)}/guests`,{members,expectedVersion:data.version,idempotencyKey:retry.current.key}));setDraft(null);retry.current=null;setNotice("Occupants saved.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="hotel-ops" aria-label="Staying guests"><h3>Staying guests</h3><p>Occupant identities are separate from the booking account. The registered primary stays linked to the reservation identity. {data&&`${members.length} of ${data.capacity} places recorded.`}</p>
 {(error||loadError)&&<p role="alert">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
 {loading?<p>Loading occupants…</p>:<ul className="hotel-ops-list">{members.map((member,index)=><li key={member.guestId??`draft-${index}`}><span>{member.name}</span><span>{member.role==="primary"?"Primary staying guest":"Companion"}</span>{editable&&<><button type="button" className="btn btn-soft" disabled={busy||member.role==="primary"} onClick={()=>setDraft(members.filter((_,i)=>i!==index))}>Remove {member.name}</button></>}</li>)}</ul>}
 {editable&&data&&<>{!members.some(m=>m.role==="primary")&&<p role="alert">Resolve the reservation’s registered primary guest before adding companions.</p>}<div className="hotel-ops-fields"><label>Companion name<input value={name} maxLength={160} onChange={e=>setName(e.target.value)} /></label><button className="btn btn-soft" type="button" disabled={busy||name.trim().length<2||members.length>=data.capacity||!members.some(m=>m.role==="primary")} onClick={()=>{setDraft([...members,{name:name.trim(),role:"accompanying"}]);setName("");setNotice("");}}>Add companion</button></div><div className="btn-row"><button type="button" className="btn btn-accent" disabled={busy||!draft||members.filter(m=>m.role==="primary").length!==1} onClick={()=>void save()}>Save occupants</button><button type="button" className="btn btn-soft" disabled={busy} onClick={()=>{setDraft(null);retry.current=null;void refresh();}}>Refresh occupants</button></div></>}
 {!editable&&<button type="button" className="btn btn-soft" onClick={()=>void refresh()}>Refresh occupants</button>}
 </section>;
}
