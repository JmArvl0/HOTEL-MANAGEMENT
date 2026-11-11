"use client";
import {useEffect,useState} from "react";
import {ChevronRight} from "lucide-react";
import {HavenSelect} from "@/components/ui/haven-select";
import {StatusBadge} from "@/components/ui/StatusBadge";
import type {Role} from "@/lib/types";
import type {Handover,NightAudit,OperatingDay} from "@/lib/hotel-operations";
import HandoverPanel from "./handover-panel";
import {NightAuditView,auditIssueLabel} from "./night-audit-panel";
import GuestDuplicatesPanel from "./guest-duplicates-panel";
import EmergencyOccupancyPanel from "./emergency-occupancy-panel";
import {RoomDiscrepancyPanel} from "./room-discrepancy-panel";
import {HotelFeeCatalog} from "./hotel-fee-picker";
import {useHotelResource} from "./hotel-operations-client";
function useOperatingDay(){
 const resource=useHotelResource<OperatingDay>("/api/staff/operational-date");
 const {error,refresh}=resource;
 useEffect(()=>{if(error)return;const timer=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(timer);},[refresh,error]);
 return resource;
}
export function OperatingDateBanner(){
 const{data,error,loading,refresh}=useOperatingDay();
 if(error)return <div className="hotel-ops-banner" role="alert"><span>Operating day unavailable. {error}</span><button type="button" className="btn btn-soft" onClick={()=>void refresh()} disabled={loading}>{loading?"Retrying…":"Retry operating day"}</button></div>;
 if(!data&&loading)return <p className="hotel-ops-banner" role="status">Checking operating day…</p>;
 return data?.active&&data.lagging?<p className="hotel-ops-banner" role="status">Operating day {data.businessDate} remains open · Calendar day {data.calendarDate} ({data.timezone})</p>:null;
}

const operationsRoles: Role[] = ["front_desk","housekeeping","maintenance","accounting","manager","owner"];
const roomReviewRoles: Role[] = ["front_desk","manager","owner"];
const auditRoles: Role[] = ["front_desk","accounting","manager","owner"];
const tabs = [
 {id:"handover",label:"Shift briefing",roles:operationsRoles},
 {id:"occupants",label:"In-house occupants",roles:roomReviewRoles},
 {id:"discrepancies",label:"Room discrepancies",roles:roomReviewRoles},
 {id:"audit",label:"Operating day & close",roles:auditRoles},
 {id:"fees",label:"Fee catalog",roles:auditRoles},
 {id:"duplicates",label:"Identity review",roles:["manager","owner"] as Role[]},
] as const;
const dateFormat = new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const formatDay = (date: string) => dateFormat.format(new Date(date+"T00:00:00Z"));

type Props = {role:Role;onReservation?:(id:string)=>void;onTasks?:()=>void;onRoom?:(id:string)=>void;onGuest?:(id:string)=>void};

export default function HotelOperationsPanel(props: Props) {
 return operationsRoles.includes(props.role) ? <HotelOperations key={props.role} {...props} /> : null;
}

function HotelOperations({role,onReservation,onTasks,onRoom,onGuest}: Props) {
 const [tab,setTab] = useState<typeof tabs[number]["id"]>("handover");
 const [now,setNow] = useState(Date.now);
 const finance = auditRoles.includes(role);
 const available = tabs.filter(view=>view.roles.includes(role));
 const day = useOperatingDay();
 const audit = useHotelResource<NightAudit>(finance ? "/api/staff/night-audit" : null);
 const current = useHotelResource<{items:Handover[]}>("/api/staff/handover?archived=false");
 const {refresh:refreshHandover} = current;
 useEffect(()=>{
  const timer=window.setInterval(()=>{setNow(Date.now());void refreshHandover();},30000);
  return()=>window.clearInterval(timer);
 },[refreshHandover]);
 const active = current.data?.items.filter(item=>item.status!=="resolved");
 const overdue = active?.filter(item=>item.due_at && Date.parse(item.due_at)<now).length;
 const assessment = audit.error ? null : audit.data;
 const blockers = assessment?.blockers ?? [];
 const blockerCounts = new Map<string,number>();
 for(const {code} of blockers) blockerCounts.set(code,(blockerCounts.get(code)??0)+1);
 function selectTab(next: typeof tab) {
  if(next==="audit" && tab!=="audit" && audit.data && !audit.loading) void audit.refresh();
  setTab(next);
 }
 return <div className="hotel-operations-workspace">
  <header className="hotel-brief-heading"><h2>Hotel Operations</h2><p>Review the operating day and hand over work by department.</p></header>
  <section className="hotel-brief" aria-label="Operating day briefing">
   <div className="hotel-brief-cell hotel-brief-day">
    <h3>Operating day</h3>
    {day.data ? <>
     <div><strong>{day.data.businessDate ? formatDay(day.data.businessDate) : "Tracking inactive"}</strong>
      {day.data.active && <StatusBadge status={day.data.lagging?"pending":"open"} label={day.data.lagging?"Prior day open":"Day open"} size="sm" showIcon={false}/>}</div>
     <small>Calendar day · {formatDay(day.data.calendarDate)}</small>
    </> : <p>{day.error?"Operating day unavailable":"Checking operating day…"}</p>}
   </div>
   {finance ? <>
    <div className="hotel-brief-cell">
     <h3>{assessment?.active && blockers.length ? `${blockers.length} close ${blockers.length===1?"blocker":"blockers"}` : "Close readiness"}</h3>
     {assessment?.active && blockers.length ? <ul className="hotel-brief-blockers">{Array.from(blockerCounts).slice(0,3).map(([code,count])=><li key={code}>{auditIssueLabel(code)}{count>1&&` · ${count}`}</li>)}{blockerCounts.size>3&&<li>More in close review</li>}</ul>
      : <p>{audit.error?"Assessment unavailable":!assessment?"Checking close readiness…":assessment.active?"Ready for Accounting review":"Operating-day tracking is inactive"}</p>}
    </div>
    <div className="hotel-brief-cell">
     <h3>Can carry forward</h3>
     {assessment?.active && assessment.warnings.length ? <ul>{assessment.warnings.map(({code})=><li key={code}>{auditIssueLabel(code)}</li>)}</ul>
      : <p>{assessment?.active?"No carry-forward warnings":audit.error?"Assessment unavailable":"Available with an open assessment"}</p>}
    </div>
    <div className="hotel-brief-cell hotel-brief-action"><button type="button" className="btn btn-accent" disabled={tab==="audit" && audit.loading}
     onClick={()=>{if(tab==="audit")void audit.refresh();else selectTab("audit");}}>{tab==="audit"?"Refresh assessment":"Review close"} <ChevronRight size={16} aria-hidden="true"/></button></div>
   </> : <>
    <div className="hotel-brief-cell"><h3>Your shift</h3>
     {active ? <ul><li>{active.length} active {active.length===1?"follow-up":"follow-ups"}</li><li>{overdue} overdue {overdue===1?"note":"notes"}</li></ul>
      : <p>{current.error?"Handover unavailable":"Loading shift follow-ups…"}</p>}
    </div>
    <div className="hotel-brief-cell"><h3>Handover scope</h3><ul><li>Notes assigned to your department</li><li>Notes you filed for another team</li></ul></div>
   </>}
  </section>
  {day.error && <div className="hotel-ops-banner" role="alert"><span>{day.error}</span><button type="button" className="btn btn-soft btn-sm" disabled={day.loading} onClick={()=>void day.refresh()}>Retry operating day</button></div>}
  {audit.error && tab!=="audit" && <div className="hotel-ops-banner" role="alert"><span>{audit.error}</span><button type="button" className="btn btn-soft btn-sm" disabled={audit.loading} onClick={()=>void audit.refresh()}>Retry assessment</button></div>}
  <nav className="hotel-brief-tabs" aria-label="Hotel operation views">
   {available.map(view=><button type="button" aria-pressed={tab===view.id} key={view.id} onClick={()=>selectTab(view.id)}>{view.label}</button>)}
  </nav>
  {available.length>1 && <div className="hotel-brief-mobile">
   <HavenSelect ariaLabel="Hotel operation view" value={tab} options={available.map(view=>({value:view.id,label:view.label}))}
    onChange={value=>{const view=available.find(option=>option.id===value);if(view)selectTab(view.id);}}/>
  </div>}
  {tab==="handover"?<HandoverPanel role={role} current={current} now={now} onReservation={onReservation} onTasks={onTasks} onRoom={onRoom} onGuest={onGuest}/>
   :tab==="occupants"?<EmergencyOccupancyPanel/>
   :tab==="discrepancies"?<RoomDiscrepancyPanel role={role}/>
   :tab==="audit"?<NightAuditView role={role} resource={audit} onReservation={onReservation} onOperatingDayChange={day.refresh}/>
   :tab==="fees"?<HotelFeeCatalog editable={role==="accounting"}/>
   :<GuestDuplicatesPanel/>}
 </div>;
}
