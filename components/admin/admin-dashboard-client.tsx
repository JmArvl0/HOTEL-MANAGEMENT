"use client";
import{useCallback,useEffect,useRef,useState}from"react";import{signOut}from"next-auth/react";import Link from"next/link";import{Activity,BedDouble,Building2,CarTaxiFront,ChevronDown,ChevronRight,ClipboardCheck,CircleDollarSign,Crown,FileText,HeartPulse,KeyRound,LogOut,PanelLeftClose,Search,Settings,ShieldCheck,Sparkles,User,Users,Wrench}from"lucide-react";import{ThemeToggle}from"@/components/theme-toggle";import{SettingsDialog}from"@/components/ui/SettingsDialog";import type{RecordItem,Role}from"@/lib/types";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { FormField } from "@/components/ui/FormDialog";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
import { migrationStatus, type SystemHealth } from "@/lib/system-health";
type Section="overview"|"users"|"roles"|"rooms"|"room_types"|"transport_services"|"policy"|"audit"|"security"|"reports"|"system";type User={id:string;name?:string|null;email?:string|null;role:Role};type Overview={metrics:Record<string,number>;roleCounts:Record<string,number>;recentAudit:RecordItem[]};
const nav:[Section,string,React.ElementType][]=[["overview","Overview",Activity],["users","Users & Staff",Users],["roles","Roles & Permissions",ShieldCheck],["rooms","Room Configuration",Building2],["room_types","Room Types",Building2],["transport_services","Transfer Vehicles",CarTaxiFront],["policy","Hotel Policies",Settings],["audit","Audit Logs",FileText],["security","Security",KeyRound],["reports","Admin Reports",ClipboardCheck],["system","System Health",HeartPulse]];
// Presentational grouping only — admin sees every module; no RBAC filtering on this client.
export const NAV_GROUPS:{id:string;label:string;sections:Section[]}[]=[{id:"workspace",label:"Workspace",sections:["overview"]},{id:"accounts",label:"Accounts",sections:["users","roles"]},{id:"configuration",label:"Configuration",sections:["rooms","room_types","transport_services","policy"]},{id:"governance",label:"Governance",sections:["audit","security","reports","system"]}];
const label=(value:unknown)=>String(value??"—").replaceAll("_"," ");
// System Administrator display name: internal role id stays "admin"; only
// user-facing role renders use this.
const roleLabel=(role:unknown)=>String(role)==="admin"?"System Administrator":label(role);
const requiredText=(msg:string)=>(value:unknown)=>typeof value==="string"&&value.trim()?null:`${msg} is required`;
const requiredNumber=(msg:string)=>(value:unknown)=>{const n=value===""?NaN:Number(value);return Number.isFinite(n)?null:`${msg} is required`};
const emailField=(msg:string)=>(value:unknown)=>requiredText(msg)(value)??(typeof value==="string"&&/^\S+@\S+\.\S+$/.test(value.trim())?null:"Enter a valid email address");
const timeField=(msg:string)=>(value:unknown)=>typeof value==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?null:`${msg} must be HH:MM (24-hour)`;
const ROLE_OPTIONS=[["manager","Manager"],["front_desk","Front desk"],["housekeeping","Housekeeping"],["maintenance","Maintenance"],["accounting","Accounting"]].map(([value,optLabel])=>({value,label:optLabel}));
const STATUS_OPTIONS=[["active","Active"],["inactive","Inactive"],["suspended","Suspended"]].map(([value,optLabel])=>({value,label:optLabel}));
// Sidebar category dropdowns own their open/closed state here so a toggle
// re-renders only the sidebar, not the whole admin workspace (the root-level
// state made the dropdowns feel unresponsive on click).
function AdminSidebarNav({section,onSelect}:{section:Section;onSelect:(section:Section)=>void}){const[openGroups,setOpenGroups]=useState<Record<string,boolean>>({});const toggleGroup=(id:string)=>setOpenGroups(prev=>{const next={...prev,[id]:!(prev[id]??false)};localStorage.setItem("haven-admin-sidebar-groups",JSON.stringify(next));return next});useEffect(()=>{const timer=setTimeout(()=>{try{const saved:unknown=JSON.parse(localStorage.getItem("haven-admin-sidebar-groups")??"{}");if(saved&&typeof saved==="object")setOpenGroups(saved as Record<string,boolean>)}catch{}},0);return()=>clearTimeout(timer)},[]);return <nav aria-label="Modules">{NAV_GROUPS.map(group=>{const open=(openGroups[group.id]??false)||group.sections.includes(section);return <div className="nav-group-wrap" key={group.id}><button className="nav-caption nav-group-header" aria-expanded={open} aria-controls={`nav-group-${group.id}`} onClick={()=>toggleGroup(group.id)}><span className="nav-group-label">{group.label}</span><ChevronRight size={13} className="nav-group-chevron" aria-hidden="true"/></button><div className={`nav-group${open?" open":""}`} id={`nav-group-${group.id}`}><div className="nav-group-items">{nav.filter(([key])=>group.sections.includes(key)).map(([key,text,Icon])=><button key={key} className={section===key?"active":""} onClick={()=>onSelect(key)} title={text}><Icon size={18}/><span className="nav-label">{text}</span></button>)}</div></div></div>})}</nav>}
export default function AdminDashboardClient({user}:{user:User}){const[section,setSection]=useState<Section>("overview"),[data,setData]=useState<unknown>(null),[loading,setLoading]=useState(true),[toast,setToast]=useState(""),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("haven-admin-sidebar-collapsed")==="true"),[menu,setMenu]=useState(false),[profileOpen,setProfileOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);const profileMenu=useRef<HTMLDivElement>(null);
useEffect(()=>{if(!profileOpen)return;const outside=(event:Event)=>{if(profileMenu.current&&!profileMenu.current.contains(event.target as Node))setProfileOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setProfileOpen(false)};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)}},[profileOpen]);

  const dialogs = useActionDialogs();

  const notify=(message:string)=>{setToast(message);setTimeout(()=>setToast(""),3500)};

  const load=useCallback(async(silent=false)=>{if(section==="room_types"||section==="transport_services"){setLoading(false);return}if(!silent)setLoading(true);const response=await fetch(`/api/admin/data?section=${section}`,{cache:"no-store"}),body=await response.json();if(response.ok)setData(body.data);else notify(body.error??"Unable to load administrative data.");if(!silent)setLoading(false)},[section]);useEffect(()=>{const timer=setTimeout(()=>load(),0);return()=>clearTimeout(timer)},[load]);
 // System Health re-probes every minute while open; the silent flag keeps the
 // loading state off so the refresh does not blank the cards.
 useEffect(()=>{if(section!=="system")return;const timer=setInterval(()=>{load(true)},60000);return()=>clearInterval(timer)},[section,load]);
 async function post(url:string,payload:Record<string,unknown>){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok){notify(body.error??"Administrative action failed.");return null}await load();return body}
 async function patch(url:string,payload:Record<string,unknown>){const response=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok){notify(body.error??"Configuration update failed.");return null}await load();return body}
 async function createStaff(){
  const data=await dialogs.askForm({
    title:"Create staff account",
    description:"New accounts start inactive and require a secure recovery link to set a password.",
    submitText:"Create account",
    fields:[
      {key:"name",label:"Full name",type:"text",required:true,validation:requiredText("Full name")},
      {key:"email",label:"Work email",type:"email",required:true,validation:emailField("Work email")},
      {key:"role",label:"Role",type:"select",required:true,defaultValue:"front_desk",options:ROLE_OPTIONS},
      {key:"department",label:"Department",type:"text",defaultValue:"front desk",helpText:"Usually matches the assigned role."},
      {key:"employeeReference",label:"Employee reference (optional)",type:"text"},
      {key:"reason",label:"Creation reason",type:"textarea",required:true,validation:requiredText("Creation reason")},
    ],
  });
  if(!data)return;
  const email=String(data.email).trim();
  const body=await post("/api/admin/users",{name:String(data.name),email,role:String(data.role),department:String(data.department??""),employeeReference:String(data.employeeReference??""),reason:String(data.reason),idempotencyKey:crypto.randomUUID()});
  if(body)notify(`Staff account created inactive. Initiate recovery for ${email} to set a password.`)
}
 async function userAction(item:RecordItem,action:"status"|"role"|"metadata"|"recovery"){
  const title=action==="status"?"Change account status":action==="role"?"Change account role":action==="metadata"?"Edit account metadata":"Reset account access";
  const description=`${item.name} · ${item.email}`;
  const reason:FormField={key:"reason",label:"Reason",type:"textarea",required:true,validation:requiredText("Reason")};
  let fields:FormField[]=[reason];
  if(action==="status")fields=[{key:"status",label:"New status",type:"select",required:true,defaultValue:String(item.account_status),options:STATUS_OPTIONS},reason];
  if(action==="role")fields=[{key:"role",label:"New role",type:"select",required:true,defaultValue:String(item.role),options:ROLE_OPTIONS},reason];
  if(action==="metadata")fields=[
    {key:"name",label:"Name",type:"text",required:true,defaultValue:String(item.name??""),validation:requiredText("Name")},
    {key:"phone",label:"Phone",type:"tel",defaultValue:String(item.phone??"")},
    {key:"department",label:"Department",type:"text",defaultValue:String(item.department??"")},
    {key:"employeeReference",label:"Employee reference",type:"text",defaultValue:String(item.employee_reference??"")},
    reason,
  ];
  const data=await dialogs.askForm({title,description,submitText:"Apply change",fields});
  if(!data)return;
  const payload:Record<string,unknown>={action,reason:String(data.reason),version:item.auth_version};
  if(action==="status")payload.status=String(data.status);
  if(action==="role")payload.role=String(data.role);
  if(action==="metadata"){
    payload.name=String(data.name??"");
    payload.phone=String(data.phone??"");
    payload.department=String(data.department??"");
    payload.employeeReference=String(data.employeeReference??"");
  }
  const body=await post(`/api/admin/users/${item.id}/action`,payload);
  if(body&&action==="recovery"){await navigator.clipboard.writeText(body.data.recoveryUrl);notify(`Recovery link copied. It expires at ${new Date(body.data.expiresAt).toLocaleString()}.`)}
}
 async function editRoom(item:RecordItem){
  const data=await dialogs.askForm({
    title:`Configure room ${item.number}`,
    description:"Administrative metadata only — occupancy, Housekeeping, and Maintenance state are never touched.",
    submitText:"Save configuration",
    fields:[
      {key:"floor",label:"Floor",type:"number",required:true,defaultValue:Number(item.floor),min:0,max:99,validation:requiredNumber("Floor")},
      {key:"type",label:"Room type",type:"text",required:true,defaultValue:String(item.type??""),validation:requiredText("Room type")},
      {key:"wing",label:"Wing",type:"text",defaultValue:String(item.wing??"")},
      {key:"designation",label:"Administrative designation",type:"text",defaultValue:String(item.administrative_designation??"")},
      {key:"active",label:"Administrative status",type:"select",required:true,defaultValue:item.administratively_active?"active":"inactive",options:[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]},
      {key:"reason",label:"Configuration reason",type:"textarea",required:true,validation:requiredText("Configuration reason")},
    ],
  });
  if(!data)return;
  const body=await patch(`/api/admin/rooms/${item.id}`,{floor:Number(data.floor),type:String(data.type),wing:String(data.wing??""),designation:String(data.designation??""),active:data.active==="active",reason:String(data.reason),version:item.configuration_version});
  if(body)notify("Room metadata updated without changing occupancy, Housekeeping, or Maintenance state.")
}
 async function editPolicy(item:RecordItem){
  const time=(raw:unknown)=>String(raw??"").slice(0,5);
  const pct=Number(item.cancellation_partial_refund_basis_points)/100;
  const data=await dialogs.askForm({
    title:"Update operational policy",
    description:"Applies to future transactions only — existing reservation snapshots are unchanged.",
    size:"lg",
    submitText:"Update policy",
    fields:[
      {key:"hotelTimezone",label:"Hotel timezone",type:"text",required:true,defaultValue:String(item.hotel_timezone??""),validation:requiredText("Hotel timezone")},
      {key:"checkInTime",label:"Check-in time",type:"text",required:true,defaultValue:time(item.check_in_time),validation:timeField("Check-in time")},
      {key:"checkOutTime",label:"Checkout time",type:"text",required:true,defaultValue:time(item.check_out_time),validation:timeField("Checkout time")},
      {key:"noShowCutoffTime",label:"No-show cutoff",type:"text",required:true,defaultValue:time(item.no_show_cutoff_time),validation:timeField("No-show cutoff")},
      {key:"minimumBookingAge",label:"Minimum booking age",type:"number",required:true,defaultValue:Number(item.minimum_booking_age),min:0,validation:requiredNumber("Minimum booking age")},
      {key:"full",label:"Full-refund days",type:"number",required:true,defaultValue:Number(item.cancellation_full_refund_days),min:0,validation:requiredNumber("Full-refund days")},
      {key:"partial",label:"Partial-refund days",type:"number",required:true,defaultValue:Number(item.cancellation_partial_refund_days),min:0,validation:requiredNumber("Partial-refund days")},
      {key:"percent",label:"Partial refund percent",type:"number",required:true,defaultValue:pct,min:0,max:100,step:0.01,validation:requiredNumber("Partial refund percent")},
      {key:"modification",label:"Self-service modification days",type:"number",required:true,defaultValue:Number(item.self_service_modification_days),min:0,validation:requiredNumber("Self-service modification days")},
      {key:"vat",label:"VAT rate (%) — inclusive, shown on documents",type:"number",required:true,defaultValue:Number(item.vat_rate_bp??1200)/100,min:0,max:100,step:0.01,validation:requiredNumber("VAT rate")},
      {key:"serviceCharge",label:"Service charge (%) — inclusive, shown on documents",type:"number",required:true,defaultValue:Number(item.service_charge_bp??1000)/100,min:0,max:100,step:0.01,validation:requiredNumber("Service charge rate")},
      {key:"depositSla",label:"Deposit verification SLA (hours)",type:"number",required:true,defaultValue:Number(item.deposit_sla_hours??4),min:0,max:72,validation:requiredNumber("Deposit SLA")},
      {key:"reason",label:"Policy change reason",type:"textarea",required:true,validation:requiredText("Policy change reason")},
    ],
  });
  if(!data)return;
  const body=await patch("/api/admin/policy",{hotelTimezone:String(data.hotelTimezone),checkInTime:String(data.checkInTime),checkOutTime:String(data.checkOutTime),noShowCutoffTime:String(data.noShowCutoffTime),validIdRequired:Boolean(item.valid_id_required),minimumBookingAge:Number(data.minimumBookingAge),cancellationFullRefundDays:Number(data.full),cancellationPartialRefundDays:Number(data.partial),cancellationPartialRefundBasisPoints:Math.round(Number(data.percent)*100),selfServiceModificationDays:Number(data.modification),earlyCheckInAllowed:Boolean(item.early_check_in_allowed),housekeepingInspectionRequired:Boolean(item.housekeeping_inspection_required),vatRateBp:Math.round(Number(data.vat)*100),serviceChargeBp:Math.round(Number(data.serviceCharge)*100),depositSlaHours:Number(data.depositSla),reason:String(data.reason),version:item.version});
  if(body)notify("Policy updated for future transactions; existing reservation snapshots were unchanged.")
}
 const rows=Array.isArray(data)?data as RecordItem[]:[];return <div className={`app-shell${collapsed?" sidebar-collapsed":""}`}><aside id="admin-navigation" className={`sidebar${menu?" open":""}${collapsed?" collapsed":""}`}><div className="sidebar-top"><div className="brand"><button className="brand-mark sidebar-brand-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMenu(false)}else{const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label={collapsed?"Expand navigation":"Collapse navigation"} aria-controls="admin-navigation" aria-expanded={!collapsed} title={collapsed?"Expand navigation":"Collapse navigation"}><Sparkles size={17}/></button><Link href="/" className="brand-copy" aria-label="Hotel homepage" title="Hotel homepage">HAVEN<small>SYSTEM ADMINISTRATION</small></Link><button className="sidebar-collapse-button" onClick={()=>{if(!window.matchMedia("(max-width: 1000px)").matches){const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label="Collapse navigation" aria-controls="admin-navigation" aria-expanded={!collapsed} title="Collapse navigation"><PanelLeftClose size={16}/></button></div></div><div className="property-pill"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>System Administration</small></div><ChevronDown size={15}/></div><AdminSidebarNav section={section} onSelect={(key)=>{setSection(key);setMenu(false)}}/></aside><main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={()=>setMenu(true)}><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find(x=>x[0]===section)?.[1]}</p><small>Provisional Admin Governance Baseline</small></div><div className="header-actions"><span className="mode-pill">Supabase live</span><ThemeToggle/><div className="profile-menu-wrap" ref={profileMenu}><button className="profile-menu-btn" onClick={()=>setProfileOpen((value)=>!value)} aria-expanded={profileOpen} aria-haspopup="menu" aria-label="Account menu"><b>{(user.name??"A").slice(0,2).toUpperCase()}</b><span>{user.name}</span><ChevronDown size={14}/></button>{profileOpen&&<div className="popover-gap"><div className="profile-popover"><p><strong>{user.name}</strong><small>{user.email}</small><small>{roleLabel(user.role)}</small></p><button onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={15}/>Settings</button><button onClick={()=>signOut({callbackUrl:"/"})}><LogOut size={15}/>Sign Out</button></div></div>}</div></div></header><div className="workspace-body">{loading?<div className="empty"><Activity/><h3>Loading governance data…</h3></div>:section==="overview"?<Overview data={data as Overview} setSection={setSection}/>:section==="users"?<UsersView rows={rows} create={createStaff} action={userAction}/>:section==="rooms"?<RoomsView rows={rows} configure={editRoom}/>:section==="room_types"?<RoomCatalogPanel role="admin"/>:section==="transport_services"?<TransportServicesPanel/>:section==="policy"?<PolicyView item={data as RecordItem} edit={editPolicy}/>:section==="roles"?<RolesView data={data as Record<string,string[]>}/>:section==="audit"||section==="security"?<AuditView security={section==="security"} rows={rows}/>:section==="system"?<SystemHealthView data={data as SystemHealth} onRefresh={()=>load()} />:<Reports data={data as Overview}/>}</div></main>{settingsOpen&&<SettingsDialog isOpen onClose={()=>setSettingsOpen(false)}/>}{toast&&<div className="toast"><ShieldCheck size={18}/>{toast}</div>}{dialogs.view}</div>}
function Overview({data,setSection}:{data:Overview;setSection:(s:Section)=>void}){
 const m=data.metrics??{},attention=Number(m.attention??0);
 const quickActions:{label:string;detail:string;section:Section;Icon:React.ElementType}[]=[
  {label:"Manage accounts",detail:"Create staff and manage lifecycle",section:"users",Icon:Users},
  {label:"Review permissions",detail:"Inspect the fixed role catalogue",section:"roles",Icon:ShieldCheck},
  {label:"Configure rooms",detail:"Maintain room metadata and status",section:"rooms",Icon:Building2},
  {label:"Update hotel policy",detail:"Control rules for future bookings",section:"policy",Icon:Settings},
  {label:"Review security",detail:"Inspect access and recovery events",section:"security",Icon:KeyRound},
 ];
 const health:{label:string;value:number;detail:string;section:Section;Icon:React.ElementType;tone:string}[]=[
  {label:"Needs attention",value:attention,detail:"Suspended or recovery-required",section:"security",Icon:KeyRound,tone:attention>0?"attention":"healthy"},
  {label:"Active recovery links",value:Number(m.activeRecoveryTokens??0),detail:"Unused links that have not expired",section:"security",Icon:ShieldCheck,tone:Number(m.activeRecoveryTokens??0)>0?"caution":"neutral"},
  {label:"Inactive rooms",value:Number(m.inactiveRooms??0),detail:"Administratively disabled records",section:"rooms",Icon:Building2,tone:Number(m.inactiveRooms??0)>0?"caution":"neutral"},
  {label:"Inactive users",value:Number(m.inactiveUsers??0),detail:"Accounts currently disabled",section:"users",Icon:Users,tone:Number(m.inactiveUsers??0)>0?"caution":"neutral"},
  {label:"Active users",value:Number(m.activeUsers??0),detail:"Accounts currently enabled",section:"users",Icon:Users,tone:"healthy"},
  {label:"Staff accounts",value:Number(m.staffAccounts??0),detail:"Operational and governance users",section:"users",Icon:Users,tone:"neutral"},
  {label:"Guest accounts",value:Number(m.guestAccounts??0),detail:"Customer portal users",section:"users",Icon:Users,tone:"neutral"},
  {label:"Room types",value:Number(m.roomTypes??0),detail:"Room categories in the catalogue",section:"room_types",Icon:Building2,tone:"neutral"},
 ];
 const roles=Object.entries(data.roleCounts??{}).sort((a,b)=>b[1]-a[1]),maxRole=Math.max(1,...roles.map(([,count])=>count));
 return <div className="admin-overview">
  <div className="page-title admin-overview-title"><div><h1>Governance at a glance</h1><p>Live account health, hotel configuration, and immutable administrative activity.</p></div><div className={`admin-posture ${attention>0?"attention":"healthy"}`}><ShieldCheck size={19}/><span><strong>{attention>0?`${attention} account${attention===1?"":"s"} need review`:"Account access is clear"}</strong><small>Based on suspension and recovery flags</small></span><button type="button" onClick={()=>setSection("security")}>Review<ChevronRight size={15}/></button></div></div>
  <section className="admin-quick-section" aria-labelledby="admin-quick-title"><div className="admin-section-heading"><div><h2 id="admin-quick-title">Quick actions</h2><p>Open the most-used administration tools.</p></div></div><div className="admin-quick-actions">{quickActions.map(({label:actionLabel,detail,section:target,Icon})=><button type="button" key={target} onClick={()=>setSection(target)} aria-label={`${actionLabel}: ${detail}`}><Icon size={18}/><span><strong>{actionLabel}</strong><small>{detail}</small></span><ChevronRight size={16}/></button>)}</div></section>
  <section className="admin-health-section" aria-labelledby="admin-health-title"><div className="admin-section-heading"><div><h2 id="admin-health-title">System health</h2><p>Select an indicator to open its source module.</p></div><span>Live Supabase records</span></div><div className="admin-health-grid">{health.map(({label:metricLabel,value,detail,section:target,Icon,tone})=><button type="button" className={`admin-health-card ${tone}`} key={metricLabel} onClick={()=>setSection(target)} aria-label={`${metricLabel}: ${value}. Open ${nav.find(([key])=>key===target)?.[1]??target}`}><span className="admin-health-copy"><small>{metricLabel}</small><strong>{value}</strong><em>{detail}</em></span><i><Icon size={18}/></i><ChevronRight className="admin-health-arrow" size={15}/></button>)}</div></section>
  <div className="admin-overview-lower">
   <section className="panel admin-role-panel" aria-labelledby="admin-role-title"><div className="panel-heading"><div><h3 id="admin-role-title">Account distribution</h3><p>Current accounts by assigned role</p></div><button type="button" onClick={()=>setSection("roles")}>Review permissions</button></div><div className="admin-role-list">{roles.map(([role,count])=><div className="admin-role-row" key={role}><span><strong>{roleLabel(role)}</strong><small>{count} account{count===1?"":"s"}</small></span><div className="admin-role-meter" aria-hidden="true"><i style={{width:`${Math.max(4,count/maxRole*100)}%`}}/></div><b>{count}</b></div>)}</div></section>
   <section className="data-panel admin-audit-panel" aria-labelledby="admin-audit-title"><div className="panel-heading"><div><h3 id="admin-audit-title">Recent governance activity</h3><p>Latest immutable administrative events</p></div><button type="button" onClick={()=>setSection("audit")}>View audit log</button></div><AuditRows rows={data.recentAudit??[]}/></section>
  </div>
 </div>
}
// Exported for the jsdom render test (users-view.test.tsx). Filters are
// client-side over the already-loaded, unpaginated rows — same pattern as the
// approvals toolbar — and the option lists derive from the data so a select
// never offers a value that isn't there.
export function UsersView({rows,create,action}:{rows:RecordItem[];create:()=>void;action:(x:RecordItem,a:"status"|"role"|"metadata"|"recovery")=>void}){const[role,setRole]=useState("all");const[status,setStatus]=useState("all");const[recovery,setRecovery]=useState("all");const[department,setDepartment]=useState("all");const[search,setSearch]=useState("");
 const roles=Array.from(new Set(rows.map(item=>String(item.role))));const departments=Array.from(new Set(rows.map(item=>String(item.department??"")).filter(Boolean)));
 const visible=rows.filter(item=>(role==="all"||String(item.role)===role)&&(status==="all"||String(item.account_status)===status)&&(recovery==="all"||(recovery==="required")===Boolean(item.recovery_required))&&(department==="all"||String(item.department??"")===department)&&[item.name,item.email,item.department,item.employee_reference].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())));
  const clearFilters=()=>{setRole("all");setStatus("all");setRecovery("all");setDepartment("all");setSearch("")};
 // Snapshot cards reuse the exact filter predicates, so a card count always
 // equals what its filter shows (card == select == table rows).
 const counts={active:rows.filter(item=>String(item.account_status)==="active").length,suspended:rows.filter(item=>String(item.account_status)==="suspended").length,recovery:rows.filter(item=>Boolean(item.recovery_required)).length,staff:rows.filter(item=>String(item.role)!=="guest").length};
 const linkedQueue=status!=="all"?`status:${status}`:recovery==="required"?"recovery:required":undefined;
 const selectCard=(queue:string)=>{const[key,value]=queue.split(":");if(key==="status")setStatus(value);if(key==="recovery")setRecovery(value)};
 return <><div className="page-title"><div><p className="eyebrow">Account governance</p><h1>Users and staff accounts</h1><p>Lifecycle, role, metadata, and secure recovery. Business history is never deleted.</p></div><button className="btn btn-accent" onClick={create}>Create staff account</button></div>
 <ModuleSummaryCards ariaLabel="Accounts summary" activeQueue={linkedQueue} onSelect={selectCard} cards={[
  {label:"Accounts on record",value:rows.length,hint:"Immutable account history",icon:Users,tone:"active"},
  {label:"Active",value:counts.active,hint:"Enabled accounts",icon:ShieldCheck,tone:"done",queue:"status:active"},
  {label:"Suspended",value:counts.suspended,hint:"Access suspended",icon:KeyRound,tone:"attention",queue:"status:suspended"},
  {label:"Recovery required",value:counts.recovery,hint:"Awaiting an access reset",icon:KeyRound,tone:"today",queue:"recovery:required"},
  {label:"Staff accounts",value:counts.staff,hint:"Operational and governance roles",icon:Users},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters"><label>Role<select value={role} onChange={event=>setRole(event.target.value)}><option value="all">All roles</option>{roles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Recovery<select value={recovery} onChange={event=>setRecovery(event.target.value)}><option value="all">All accounts</option><option value="required">Recovery required</option><option value="no">No recovery needed</option></select></label><label>Department<select value={department} onChange={event=>setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label><label className="approval-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label="Search accounts" placeholder="Search name, email, department, or reference..."/></label></div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Staff accounts"><thead><tr>{["Name","Email","Role","Department","Status","Recovery","Version","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{roleLabel(item.role)}</td><td>{label(item.department)}</td><td><span className={`badge ${item.account_status}`}>{label(item.account_status)}</span></td><td>{item.recovery_required?"Required":"No"}</td><td>{item.auth_version}</td><td><div className="reservation-actions"><button className="table-action" onClick={()=>action(item,"metadata")}>Edit</button><button className="table-action" onClick={()=>action(item,"role")}>Role</button><button className="table-action" onClick={()=>action(item,"status")}>Lifecycle</button><button className="table-action" onClick={()=>action(item,"recovery")}>Recovery</button></div></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No accounts match these filters</h3><p>Try clearing the filters to see every account.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <div className="table-footer">Showing {visible.length} of {rows.length} account{rows.length!==1?"s":""}<span>Every lifecycle, role, and recovery change is server-authorized and audited.</span></div></div></>}
// Room metadata workspace. Operational state (status, housekeeping) is shown
// read-only for orientation; the only write path is administrative metadata
// (editRoom). Filters, cards, and the footer all count the same loaded rows.
export function RoomsView({rows,configure}:{rows:RecordItem[];configure:(x:RecordItem)=>void}){
 const[active,setActive]=useState("all");const[type,setType]=useState("all");const[wing,setWing]=useState("all");const[search,setSearch]=useState("");
 const types=Array.from(new Set(rows.map(item=>String(item.type??"")).filter(Boolean)));const wings=Array.from(new Set(rows.map(item=>String(item.wing??"")).filter(Boolean)));const floors=new Set(rows.map(item=>String(item.floor??""))).size;
 const visible=rows.filter(item=>(active==="all"||(active==="active")===Boolean(item.administratively_active))&&(type==="all"||String(item.type)===type)&&(wing==="all"||String(item.wing)===wing)&&[item.number,item.type,item.wing,item.administrative_designation].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())));
 const clearFilters=()=>{setActive("all");setType("all");setWing("all");setSearch("")};
 const inactive=rows.filter(item=>!item.administratively_active).length;
 return <><div className="page-title"><div><p className="eyebrow">Hotel configuration</p><h1>Physical room metadata</h1><p>Administrative configuration only — occupancy, Housekeeping, and Maintenance state are read-only.</p></div></div>
 <ModuleSummaryCards ariaLabel="Room configuration summary" activeQueue={active} onSelect={setActive} cards={[
  {label:"Rooms on record",value:rows.length,hint:"Every physical room",icon:BedDouble,tone:"active"},
  {label:"Administratively inactive",value:inactive,hint:"Disabled for governance reasons",icon:Building2,tone:inactive>0?"attention":"done",queue:"inactive"},
  {label:"Room types",value:types.length,hint:"Types present in inventory",icon:Building2},
  {label:"Floors",value:floors,hint:"Distinct floor levels",icon:Building2,tone:"today"},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters">
  <label>Status<select value={active} onChange={event=>setActive(event.target.value)}><option value="all">All statuses</option><option value="active">Administratively active</option><option value="inactive">Administratively inactive</option></select></label>
  <label>Type<select value={type} onChange={event=>setType(event.target.value)}><option value="all">All types</option>{types.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  <label>Wing<select value={wing} onChange={event=>setWing(event.target.value)}><option value="all">All wings</option>{wings.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
  <label className="approval-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label="Search rooms" placeholder="Search number, type, wing, or designation..."/></label>
 </div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Room configuration"><thead><tr>{["Room","Floor","Type","Wing","Designation","Admin status","Operational status","Housekeeping","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id}><td><strong>{label(item.number)}</strong></td><td>{label(item.floor)}</td><td>{label(item.type)}</td><td>{label(item.wing)}</td><td>{label(item.administrative_designation)}</td><td><span className={`badge ${item.administratively_active?"active":"inactive"}`}>{item.administratively_active?"Active":"Inactive"}</span></td><td><span className={`badge ${item.status}`}>{label(item.status)}</span></td><td><span className={`badge ${item.housekeeping}`}>{label(item.housekeeping)}</span></td><td><div className="reservation-actions"><button className="table-action" onClick={()=>configure(item)}>Configure</button></div></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No rooms match these filters</h3><p>Try clearing the filters to see every room.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <div className="table-footer">Showing {visible.length} of {rows.length} room{rows.length!==1?"s":""}<span>Occupancy and housekeeping state change only through their own departments.</span></div></div></>
}
// Audit Logs and Security share one immutable event stream; the section only
// changes the framing. Filters and cards are client-side over the loaded page
// of events, same pattern as UsersView.
export function AuditView({security,rows}:{security:boolean;rows:RecordItem[]}){
 const[action,setAction]=useState("all");const[entity,setEntity]=useState("all");const[search,setSearch]=useState("");
 const actions=Array.from(new Set(rows.map(item=>String(item.action))));const entities=Array.from(new Set(rows.map(item=>String(item.entity_type))));
 const visible=rows.filter(item=>(action==="all"||String(item.action)===action)&&(entity==="all"||String(item.entity_type)===entity)&&[item.action,item.entity_type,item.entity_id].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())));
 const clearFilters=()=>{setAction("all");setEntity("all");setSearch("")};
 const dayAgo=new Date().getTime()-24*60*60*1000;const last24h=rows.filter(item=>new Date(String(item.created_at)).getTime()>dayAgo).length;
 const latest=rows[0]?new Date(String(rows[0].created_at)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):null;
 const stamp=(value:unknown)=>new Date(String(value)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
 return <><div className="page-title"><div><p className="eyebrow">{security?"Access and recovery":"Administrative history"}</p><h1>{security?"Security and account events":"Administrative audit"}</h1><p>Immutable administrative history; secrets and password hashes are never returned.</p></div></div>
 <ModuleSummaryCards ariaLabel="Audit summary" cards={[
  {label:"Events on record",value:rows.length,hint:"Most recent first",icon:FileText,tone:"active"},
  {label:"Last 24 hours",value:last24h,hint:"Since this time yesterday",icon:Activity,tone:last24h>0?"today":"done"},
  {label:"Action types",value:actions.length,hint:"Distinct recorded actions",icon:ClipboardCheck},
  {label:"Latest event",value:latest?latest.split(", ")[0]:"—",hint:latest?`Recorded ${latest}`:"No events yet",icon:Activity},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters">
  <label>Action<select value={action} onChange={event=>setAction(event.target.value)}><option value="all">All actions</option>{actions.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
  <label>Entity<select value={entity} onChange={event=>setEntity(event.target.value)}><option value="all">All entities</option>{entities.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
  <label className="approval-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label="Search events" placeholder="Search action, entity, or record..."/></label>
 </div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Event log"><thead><tr>{["Time","Action","Entity","Record"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id}><td>{stamp(item.created_at)}</td><td><span className="badge pending">{label(item.action)}</span></td><td>{label(item.entity_type)}</td><td><code className="audit-record">{label(item.entity_id)}</code></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No events match these filters</h3><p>Try clearing the filters to see every recorded event.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <div className="table-footer">Showing {visible.length} of {rows.length} event{rows.length!==1?"s":""}<span>Newest first — the full history stays immutable in the database.</span></div></div></>
}
// One-line framing per fixed role; the capability lists come from
// ROLE_CAPABILITIES server-side. Display only — permissions are never edited.
const ROLE_META:Record<string,{summary:string;Icon:React.ElementType}>={
 owner:{summary:"Protected authority over the platform and its administrators",Icon:Crown},
 admin:{summary:"Governance of accounts, configuration, and policy",Icon:ShieldCheck},
 manager:{summary:"Operational oversight, approvals, and escalations",Icon:ClipboardCheck},
 front_desk:{summary:"Reservations, arrival, and departure coordination",Icon:Users},
 housekeeping:{summary:"Room care, inspection, and maintenance reporting",Icon:Sparkles},
 maintenance:{summary:"Work orders and technical serviceability",Icon:Wrench},
 accounting:{summary:"Payments, folios, refunds, and reconciliation",Icon:CircleDollarSign},
 guest:{summary:"Self-service access to own reservations and requests",Icon:User},
};
function RolesView({data}:{data:Record<string,string[]>}){return <><div className="page-title"><div><p className="eyebrow">Controlled catalogue</p><h1>Roles and permissions</h1><p>HAVEN uses one fixed role per account. Admin assigns permitted roles but cannot invent permissions or grant Owner authority.</p></div></div><div className="admin-roles-grid">{Object.entries(data??{}).map(([role,values])=>{const meta=ROLE_META[role];const Icon=meta?.Icon;return <article className="panel admin-role-card" key={role}><header>{Icon&&<span className="admin-role-icon"><Icon size={17} aria-hidden="true"/></span>}<div><h3>{roleLabel(role)}</h3><small>{meta?.summary??"Fixed system role"}</small></div></header><ul>{values.map(value=><li key={value}>{value}</li>)}</ul></article>})}</div></>}
// Policy display: raw snake_case columns become grouped, labeled, formatted
// sections. Unknown keys (schema additions) fall into "Additional settings"
// so nothing is ever hidden. The edit form (editPolicy) is untouched.
const POLICY_GROUPS:{title:string;note:string;fields:[string,string][]}[]=[
 {title:"Locale and daily schedule",note:"Times are enforced in the hotel timezone",fields:[["hotel_timezone","Hotel timezone"],["check_in_time","Check-in time"],["check_out_time","Checkout time"],["no_show_cutoff_time","No-show cutoff"]]},
 {title:"Booking eligibility",note:"Applies to every new public reservation",fields:[["minimum_booking_age","Minimum booking age"],["valid_id_required","Valid ID required at check-in"]]},
 {title:"Cancellation and refunds",note:"Windows count back from the arrival date",fields:[["cancellation_full_refund_days","Full-refund window (days)"],["cancellation_partial_refund_days","Partial-refund window (days)"],["cancellation_partial_refund_basis_points","Partial refund rate"]]},
 {title:"Self-service and operations",note:"What guests and staff may do without approval",fields:[["self_service_modification_days","Self-service modification window (days)"],["early_check_in_allowed","Early check-in allowed"],["housekeeping_inspection_required","Inspection before re-occupancy"],["deposit_sla_hours","Deposit verification SLA (hours)"]]},
 {title:"Tax and financial documents",note:"Inclusive rates — displayed prices are the full amount guests pay; documents derive the breakdown",fields:[["vat_rate_bp","VAT rate"],["service_charge_bp","Service charge rate"]]},
];
const policyValue=(key:string,value:unknown)=>{if(key==="cancellation_partial_refund_basis_points"||key==="vat_rate_bp"||key==="service_charge_bp")return `${Number(value)/100}%`;if(typeof value==="boolean")return value?"Yes":"No";if(key.endsWith("_time"))return String(value??"").slice(0,5);return label(value)};
// Exported for the jsdom render test (admin-views.test.tsx).
export function PolicyView({item,edit}:{item:RecordItem;edit:(x:RecordItem)=>void}){const entries=Object.entries(item??{}).filter(([key])=>!["key","version"].includes(key));const known=new Set(POLICY_GROUPS.flatMap(group=>group.fields.map(([key])=>key)));const extras=entries.filter(([key])=>!known.has(key)&&key!=="updated_at");const groups=[...POLICY_GROUPS,...extras.length?[{title:"Additional settings",note:"Recorded on the policy row",fields:extras.map(([key])=>[key,label(key).replace(/^./,c=>c.toUpperCase())] as [string,string])}]:[]];return <><div className="page-title"><div><p className="eyebrow">Future operations</p><h1>Operational policy</h1><p>Updates affect future transactions. Existing reservation snapshots remain unchanged.</p></div><button className="btn btn-accent" onClick={()=>edit(item)}>Update policy</button></div><div className="data-panel admin-policy-panel">{item?.updated_at&&<p className="admin-policy-meta">Version {label(item.version)} · updated {new Date(String(item.updated_at)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</p>}<div className="admin-policy-groups">{groups.map(group=><section key={group.title}><h4>{group.title}</h4><p>{group.note}</p><dl>{group.fields.filter(([key])=>key in (item??{})).map(([key,name])=><div key={key}><dt>{name}</dt><dd>{policyValue(key,item?.[key])}</dd></div>)}</dl></section>)}</div></div></>}
function AuditRows({rows}:{rows:RecordItem[]}){if(!rows.length)return <div className="admin-audit-empty"><FileText size={22}/><h3>No governance activity yet</h3><p>Administrative and security changes will appear here as they are recorded.</p></div>;return <div className="table-scroll"><table aria-label="Activity log"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{new Date(String(item.created_at)).toLocaleString()}</td><td>{label(item.action)}</td><td>{label(item.entity_type)}</td><td>{label(item.entity_id)}</td></tr>)}</tbody></table></div>}
// Governance report over the same overview payload the landing section uses:
// account totals, role distribution with shares, and configuration state.
// Reporting only — operational and financial execution stay in departments.
function Reports({data}:{data:Overview}){const m=data?.metrics??{};const total=Number(m.activeUsers??0)+Number(m.inactiveUsers??0);const roles=Object.entries(data?.roleCounts??{}).sort((a,b)=>b[1]-a[1]);return <><div className="page-title"><div><p className="eyebrow">Administrative reporting</p><h1>Account and configuration summary</h1><p>Governance reporting only — operational and financial execution remain in their departments.</p></div></div>
 <ModuleSummaryCards ariaLabel="Governance report summary" cards={[
  {label:"Accounts on record",value:total,hint:"Every account ever created",icon:Users,tone:"active"},
  {label:"Staff accounts",value:Number(m.staffAccounts??0),hint:"Operational and governance roles",icon:ShieldCheck},
  {label:"Guest accounts",value:Number(m.guestAccounts??0),hint:"Customer portal users",icon:User},
  {label:"Needs attention",value:Number(m.attention??0),hint:"Suspended or recovery-required",icon:KeyRound,tone:Number(m.attention??0)>0?"attention":"done"},
  {label:"Rooms disabled",value:Number(m.inactiveRooms??0),hint:"Administratively inactive",icon:Building2,tone:Number(m.inactiveRooms??0)>0?"today":"done"},
  {label:"Room types inactive",value:Number(m.inactiveRoomTypes??0),hint:"Hidden from the catalogue",icon:Building2,tone:Number(m.inactiveRoomTypes??0)>0?"today":"done"},
 ]}/>
 <div className="admin-report-lower">
  <section className="data-panel" aria-labelledby="admin-report-roles"><div className="panel-heading"><div><h3 id="admin-report-roles">Accounts by role</h3><p>Current distribution across the fixed role catalogue</p></div></div><div className="table-scroll"><table aria-label="Accounts by role"><thead><tr><th>Role</th><th>Accounts</th><th>Share</th></tr></thead><tbody>{roles.map(([role,count])=><tr key={role}><td><strong>{roleLabel(role)}</strong></td><td>{count}</td><td>{total?`${Math.round(count/total*100)}%`:"—"}</td></tr>)}</tbody></table></div><div className="table-footer">{total} account{total!==1?"s":""} on record<span>One fixed role per account</span></div></section>
  <section className="data-panel" aria-labelledby="admin-report-config"><div className="panel-heading"><div><h3 id="admin-report-config">Configuration summary</h3><p>Live hotel configuration state</p></div></div><ul className="admin-config-list"><li><span>Room types in catalogue</span><b>{Number(m.roomTypes??0)}</b></li><li><span>Room types inactive</span><b>{Number(m.inactiveRoomTypes??0)}</b></li><li><span>Rooms administratively inactive</span><b>{Number(m.inactiveRooms??0)}</b></li><li><span>Unused recovery links</span><b>{Number(m.activeRecoveryTokens??0)}</b></li><li><span>Accounts needing attention</span><b>{Number(m.attention??0)}</b></li></ul></section>
 </div></>}
// Exported for the jsdom render test (system-health-view.test.tsx). All
// figures arrive server-computed; the view only formats them. Auto-refreshes
// every minute while the section is open (AdminDashboardClient interval).
export function SystemHealthView({data,onRefresh}:{data:SystemHealth;onRefresh:()=>void}){
 // Shape-safe: during a section switch the view renders once with the previous
 // section's data before the new fetch lands (and a failed fetch keeps it), so
 // every field is defaulted rather than assumed.
 const db=data?.db??{},activity=data?.activity??{},rows=data?.migrations?.applied??[];
 const appliedCount=data?.migrations?.appliedCount??rows.length,localCount=data?.migrations?.localCount??null;
 const status=migrationStatus(appliedCount,localCount);
 const behind=(localCount??0)-appliedCount;
 const checked=db.checkedAt?new Date(db.checkedAt).toLocaleTimeString():"—";
 const lastAudit=activity.lastAuditAt?new Date(activity.lastAuditAt).toLocaleString():"No events yet";
  // Extended sections default to honest Unknowns while data is still loading.
  const app=data?.application??{environment:"Unknown",version:"Unknown",commit:null};
  const storageStatus=data?.storage?.status??"unknown";
  const emailLabel=!data?.email?"Unknown":data.email.status==="configured"?"Configured":"Not configured";
  const automations=data?.automations??[];
  const deployProvider=data?.deployment?.provider??"Unknown";
  const issues=data?.issues??[];
 const shown=rows.slice(0,20);
 return <><div className="page-title"><div><p className="eyebrow">Technical operations</p><h1>System health</h1><p>Live database condition, system activity, and deployment status. Re-checked every minute.</p></div><button className="btn btn-accent" onClick={onRefresh}>Run checks now</button></div>
 <div className="metric-grid">
  <article className="metric-card"><div><span>Database</span><b>{db.checkedAt?db.live?"Live":"Unreachable":"Checking…"}</b><small>{db.live?db.latencyMs!==null?`${db.latencyMs} ms response`:"Connected":db.checkedAt?"Connection failed":"Waiting for first probe"}</small></div><i><HeartPulse size={21}/></i></article>
  <article className="metric-card"><div><span>Audit events (24h)</span><b>{activity.auditEvents24h}</b><small>Last event: {lastAudit}</small></div><i><Activity size={21}/></i></article>
  <article className="metric-card"><div><span>Pending approvals</span><b>{activity.pendingApprovals}</b><small>Awaiting Manager review</small></div><i><ClipboardCheck size={21}/></i></article>
  <article className="metric-card"><div><span>Migrations applied</span><b>{appliedCount}{localCount!==null?` / ${localCount}`:""}</b><small>{status==="in_sync"?"Deployment in sync":status==="remote_behind"?`${behind} local migration${behind===1?"":"s"} not applied`:"Local files unavailable — remote count only"}</small></div><i><ShieldCheck size={21}/></i></article>
  <article className="metric-card"><div><span>Application</span><b>{app.environment}</b><small>v{app.version}{app.commit?` · ${app.commit}`:" · commit unknown"}</small></div><i><Activity size={21}/></i></article>
  <article className="metric-card"><div><span>Storage</span><b>{storageStatus==="operational"?"Operational":storageStatus==="unavailable"?"Unavailable":"Unknown"}</b><small>Photo bucket probe</small></div><i><Building2 size={21}/></i></article>
  <article className="metric-card"><div><span>Email</span><b>{emailLabel}</b><small>Resend service</small></div><i><FileText size={21}/></i></article>
  <article className="metric-card"><div><span>Deployment</span><b>Unknown</b><small>{deployProvider} · no deployment feed connected</small></div><i><HeartPulse size={21}/></i></article>
  <article className="metric-card"><div><span>Domain</span><b>Not connected</b><small>Health reporting not connected</small></div><i><Activity size={21}/></i></article>
 </div>
 {!db.live&&db.checkedAt&&<div className="data-panel" role="alert"><div className="panel-heading"><div><h3>Database unreachable</h3><p>{db.error??"The live database did not respond to the health probe."}</p></div></div></div>}
 {status==="remote_behind"&&<div className="data-panel" role="alert"><div className="panel-heading"><div><h3>Deployment drift</h3><p>{behind} local migration{behind===1?" is":"s are"} not applied to the live database — run <code>supabase db push</code> before relying on new features.</p></div></div></div>}
  {automations.length>0&&<div className="data-panel"><div className="panel-heading"><div><h3>Scheduled automations</h3><p>Jobs that exist · last run is untracked</p></div></div><div className="table-scroll"><table aria-label="Scheduled automations"><thead><tr><th>Job</th><th>Schedule</th><th>Last run</th></tr></thead><tbody>{automations.map(job=><tr key={job.name}><td><strong>{job.name}</strong></td><td>{job.schedule}</td><td>Unknown</td></tr>)}</tbody></table></div></div>}
  {issues.length>0&&<div className="data-panel"><div className="panel-heading"><div><h3>Recent technical issues</h3><p>Derived from live probes — no sensitive detail</p></div></div><ul className="admin-config-list">{issues.map(issue=><li key={issue}><span>{issue}</span></li>)}</ul></div>}
 <div className="data-panel"><div className="panel-heading"><div><h3>Applied migrations</h3><p>Newest first — the live supabase migration ledger, read server-side</p></div><span className={`badge ${status==="in_sync"?"healthy":status==="remote_behind"?"pending":""}`}>{label(status)}</span></div><div className="table-scroll"><table aria-label="Applied migrations"><thead><tr><th>Version</th><th>Name</th></tr></thead><tbody>{shown.map(row=><tr key={row.version}><td><strong>{row.version}</strong></td><td>{label(row.name)}</td></tr>)}</tbody></table></div><div className="table-footer">Showing {shown.length} of {appliedCount} applied migration{appliedCount!==1?"s":""}<span>Last checked {checked} · auto-refresh every minute</span></div></div></>}
