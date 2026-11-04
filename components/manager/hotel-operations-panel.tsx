"use client";
import {useEffect,useState} from "react";
import type {Role} from "@/lib/types";
import type {OperatingDay} from "@/lib/hotel-operations";
import HandoverPanel from "./handover-panel";
import NightAuditPanel from "./night-audit-panel";
import GuestDuplicatesPanel from "./guest-duplicates-panel";
import EmergencyOccupancyPanel from "./emergency-occupancy-panel";
import {RoomDiscrepancyPanel} from "./room-discrepancy-panel";
import {HotelFeeCatalog} from "./hotel-fee-picker";
import {useHotelResource} from "./hotel-operations-client";
export function OperatingDateBanner(){
 const{data,error,loading,refresh}=useHotelResource<OperatingDay>("/api/staff/operational-date");
 useEffect(()=>{if(error)return;const timer=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(timer);},[refresh,error]);
 if(error)return <div className="hotel-ops-banner" role="alert"><span>Operating day unavailable. {error}</span><button type="button" className="btn btn-soft" onClick={()=>void refresh()} disabled={loading}>{loading?"Retrying…":"Retry operating day"}</button></div>;
 if(!data&&loading)return <p className="hotel-ops-banner" role="status">Checking operating day…</p>;
 return data?.active&&data.lagging?<p className="hotel-ops-banner" role="status">Operating day {data.businessDate} remains open · Calendar day {data.calendarDate} ({data.timezone})</p>:null;
}
export default function HotelOperationsPanel({role,onReservation,onTasks,onRoom,onGuest}:{role:Role;onReservation?:(id:string)=>void;onTasks?:()=>void;onRoom?:(id:string)=>void;onGuest?:(id:string)=>void}){
 const[tab,setTab]=useState("handover");const finance=["front_desk","accounting","manager","owner"].includes(role),identity=["manager","owner"].includes(role);
 const occupants=["front_desk","manager","owner"].includes(role);
 const discrepancies=["front_desk","manager","owner"].includes(role);
 const tabs=[{id:"handover",label:"Shift handover"},...(occupants?[{id:"occupants",label:"In-house occupants"}]:[]),...(discrepancies?[{id:"discrepancies",label:"Room discrepancies"}]:[]),...(finance?[{id:"audit",label:"Operating day & close"},{id:"fees",label:"Fee catalog"}]:[]),...(identity?[{id:"duplicates",label:"Identity review"}]:[])];
 return <div className="hotel-ops"><h2>Hotel operations</h2><nav className="hotel-ops-tabs" aria-label="Hotel operation views">{tabs.map(t=><button type="button" className={`btn ${tab===t.id?"btn-accent":"btn-soft"}`} aria-pressed={tab===t.id} key={t.id} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>{tab==="handover"?<HandoverPanel onReservation={onReservation} onTasks={onTasks} onRoom={onRoom} onGuest={onGuest}/>:tab==="occupants"&&occupants?<EmergencyOccupancyPanel/>:tab==="discrepancies"&&discrepancies?<RoomDiscrepancyPanel role={role}/>:tab==="audit"&&finance?<NightAuditPanel role={role} onReservation={onReservation}/>:tab==="fees"&&finance?<HotelFeeCatalog editable={role==="accounting"}/>:tab==="duplicates"&&identity?<GuestDuplicatesPanel/>:null}</div>;
}
