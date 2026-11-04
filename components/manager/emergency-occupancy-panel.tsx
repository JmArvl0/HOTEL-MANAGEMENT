"use client";
import {useHotelResource} from "./hotel-operations-client";
type Occupant={name:string;type:string;status:string};
type InHouse={reservationId:string;confirmationNumber:string|null;roomId:string|null;roomNumber:string|null;checkIn:string;checkOut:string;declaredCount:number;registeredCount:number;registerComplete:boolean;occupants:Occupant[]};
type InHouseRegister={assessedAt:string;items:InHouse[]};
export default function EmergencyOccupancyPanel(){
 const{data,error,loading,refresh}=useHotelResource<InHouseRegister>("/api/staff/occupants/in-house");
 return <section className="hotel-ops" aria-label="In-house occupant register">
  <div className="hotel-ops-fields"><div><h3>In-house occupant register</h3><p>Recorded occupants and attendance for current room assignments. Incomplete or unknown entries need Front Desk confirmation.</p></div><button type="button" className="btn btn-soft" onClick={()=>window.print()} disabled={!data?.items.length}>Print list</button></div>
  {error&&<p role="alert">{error}</p>}{loading&&!data?<p role="status">Loading in-house register…</p>:data?.items.length?<ul className="hotel-ops-list">{data.items.map(stay=><li key={stay.reservationId}>
   <strong>Room {stay.roomNumber??"Unassigned"}</strong><span>{stay.confirmationNumber??stay.reservationId}</span>
   <span>{stay.registeredCount} / {stay.declaredCount} names recorded{stay.registerComplete?"":" · incomplete"}</span>
   <ul>{stay.occupants.map((occupant,index)=><li key={index}>{occupant.name} · {occupant.type} · {occupant.status}</li>)}</ul>
  </li>)}</ul>:<p>No checked-in stays have an active room assignment.</p>}
  {data&&<small>Snapshot generated {new Date(data.assessedAt).toLocaleString()}. This list reflects recorded data and may require on-site confirmation.</small>}
  <button type="button" className="btn btn-soft" disabled={loading} onClick={()=>void refresh()}>Refresh in-house list</button>
 </section>;
}
