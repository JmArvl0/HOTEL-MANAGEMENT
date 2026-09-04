"use client";
import{useCallback,useEffect,useState}from"react";import{signOut}from"next-auth/react";import{Activity,Building2,CarTaxiFront,ChevronDown,ClipboardCheck,FileText,KeyRound,LogOut,Settings,ShieldCheck,Sparkles,Users}from"lucide-react";import{ThemeToggle}from"@/components/theme-toggle";import type{RecordItem,Role}from"@/lib/types";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { FormField } from "@/components/ui/FormDialog";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
type Section="overview"|"users"|"roles"|"rooms"|"room_types"|"transport_services"|"policy"|"audit"|"security"|"reports";type User={id:string;name?:string|null;email?:string|null;role:Role};type Overview={metrics:Record<string,number>;roleCounts:Record<string,number>;recentAudit:RecordItem[]};
const nav:[Section,string,React.ElementType][]=[["overview","Overview",Activity],["users","Users & Staff",Users],["roles","Roles & Permissions",ShieldCheck],["rooms","Room Configuration",Building2],["room_types","Room Types",Building2],["transport_services","Transfer Vehicles",CarTaxiFront],["policy","Hotel Policies",Settings],["audit","Audit Logs",FileText],["security","Security",KeyRound],["reports","Admin Reports",ClipboardCheck]];
const label=(value:unknown)=>String(value??"—").replaceAll("_"," ");const money=(value:unknown)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value||0));
const requiredText=(msg:string)=>(value:unknown)=>typeof value==="string"&&value.trim()?null:`${msg} is required`;
const requiredNumber=(msg:string)=>(value:unknown)=>{const n=value===""?NaN:Number(value);return Number.isFinite(n)?null:`${msg} is required`};
const emailField=(msg:string)=>(value:unknown)=>requiredText(msg)(value)??(typeof value==="string"&&/^\S+@\S+\.\S+$/.test(value.trim())?null:"Enter a valid email address");
const timeField=(msg:string)=>(value:unknown)=>typeof value==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?null:`${msg} must be HH:MM (24-hour)`;
const ROLE_OPTIONS=[["manager","Manager"],["front_desk","Front desk"],["housekeeping","Housekeeping"],["maintenance","Maintenance"],["accounting","Accounting"]].map(([value,optLabel])=>({value,label:optLabel}));
const STATUS_OPTIONS=[["active","Active"],["inactive","Inactive"],["suspended","Suspended"]].map(([value,optLabel])=>({value,label:optLabel}));
export default function AdminDashboardClient({user}:{user:User}){const[section,setSection]=useState<Section>("overview"),[data,setData]=useState<unknown>(null),[loading,setLoading]=useState(true),[toast,setToast]=useState(""),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("haven-admin-sidebar-collapsed")==="true"),[menu,setMenu]=useState(false);

  const dialogs = useActionDialogs();

  const notify=(message:string)=>{setToast(message);setTimeout(()=>setToast(""),3500)};

  const load=useCallback(async()=>{if(section==="room_types"||section==="transport_services"){setLoading(false);return}setLoading(true);const response=await fetch(`/api/admin/data?section=${section}`,{cache:"no-store"}),body=await response.json();if(response.ok)setData(body.data);else notify(body.error??"Unable to load administrative data.");setLoading(false)},[section]);useEffect(()=>{const timer=setTimeout(load,0);return()=>clearTimeout(timer)},[load]);
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
      {key:"hotelTimezone",label:"Hotel timezone (Owner-only to change)",type:"text",required:true,defaultValue:String(item.hotel_timezone??""),validation:requiredText("Hotel timezone")},
      {key:"checkInTime",label:"Check-in time",type:"text",required:true,defaultValue:time(item.check_in_time),validation:timeField("Check-in time")},
      {key:"checkOutTime",label:"Checkout time",type:"text",required:true,defaultValue:time(item.check_out_time),validation:timeField("Checkout time")},
      {key:"noShowCutoffTime",label:"No-show cutoff",type:"text",required:true,defaultValue:time(item.no_show_cutoff_time),validation:timeField("No-show cutoff")},
      {key:"minimumBookingAge",label:"Minimum booking age",type:"number",required:true,defaultValue:Number(item.minimum_booking_age),min:0,validation:requiredNumber("Minimum booking age")},
      {key:"full",label:"Full-refund days",type:"number",required:true,defaultValue:Number(item.cancellation_full_refund_days),min:0,validation:requiredNumber("Full-refund days")},
      {key:"partial",label:"Partial-refund days",type:"number",required:true,defaultValue:Number(item.cancellation_partial_refund_days),min:0,validation:requiredNumber("Partial-refund days")},
      {key:"percent",label:"Partial refund percent",type:"number",required:true,defaultValue:pct,min:0,max:100,step:0.01,validation:requiredNumber("Partial refund percent")},
      {key:"modification",label:"Self-service modification days",type:"number",required:true,defaultValue:Number(item.self_service_modification_days),min:0,validation:requiredNumber("Self-service modification days")},
      {key:"reason",label:"Policy change reason",type:"textarea",required:true,validation:requiredText("Policy change reason")},
    ],
  });
  if(!data)return;
  const body=await patch("/api/admin/policy",{hotelTimezone:String(data.hotelTimezone),checkInTime:String(data.checkInTime),checkOutTime:String(data.checkOutTime),noShowCutoffTime:String(data.noShowCutoffTime),validIdRequired:Boolean(item.valid_id_required),minimumBookingAge:Number(data.minimumBookingAge),cancellationFullRefundDays:Number(data.full),cancellationPartialRefundDays:Number(data.partial),cancellationPartialRefundBasisPoints:Math.round(Number(data.percent)*100),selfServiceModificationDays:Number(data.modification),earlyCheckInAllowed:Boolean(item.early_check_in_allowed),housekeepingInspectionRequired:Boolean(item.housekeeping_inspection_required),reason:String(data.reason),version:item.version});
  if(body)notify("Policy updated for future transactions; existing reservation snapshots were unchanged.")
}
 const rows=Array.isArray(data)?data as RecordItem[]:[];return <div className={`app-shell${collapsed?" sidebar-collapsed":""}`}><aside className={`sidebar${menu?" open":""}${collapsed?" collapsed":""}`}><div className="sidebar-top"><button className="brand sidebar-brand-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMenu(false)}else{const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label="Toggle navigation"><span className="brand-mark"><Sparkles size={17}/></span><span className="brand-copy">HAVEN<small>ADMIN GOVERNANCE</small></span></button></div><div className="property-pill"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>System administration</small></div><ChevronDown size={15}/></div><p className="nav-caption">Governance</p><nav>{nav.map(([key,text,Icon])=><button key={key} className={section===key?"active":""} onClick={()=>{setSection(key);setMenu(false)}}><Icon size={18}/><span className="nav-label">{text}</span></button>)}</nav><div className="sidebar-bottom"><button onClick={()=>signOut({callbackUrl:"/"})}><LogOut size={18}/><span className="nav-label">Sign out</span></button><div className="profile"><span>{(user.name??"A").slice(0,2).toUpperCase()}</span><div className="profile-copy"><b>{user.name}</b><small>{label(user.role)}</small></div></div></div></aside><main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={()=>setMenu(true)}><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find(x=>x[0]===section)?.[1]}</p><small>Provisional Admin Governance Baseline</small></div><div className="header-actions"><span className="mode-pill">Supabase live</span><ThemeToggle/></div></header><div className="workspace-body">{loading?<div className="empty"><Activity/><h3>Loading governance data…</h3></div>:section==="overview"?<Overview data={data as Overview} setSection={setSection}/>:section==="users"?<UsersView rows={rows} create={createStaff} action={userAction}/>:section==="rooms"?<TableView title="Physical room metadata" subtitle="Administrative configuration only—operational room state is read-only." rows={rows} columns={["number","floor","type","wing","administrative_designation","administratively_active","status","housekeeping"]} action={editRoom}/>:section==="room_types"?<RoomCatalogPanel/>:section==="transport_services"?<TransportServicesPanel/>:section==="policy"?<PolicyView item={data as RecordItem} edit={editPolicy}/>:section==="roles"?<RolesView data={data as Record<string,string[]>}/>:section==="audit"||section==="security"?<TableView title={section==="audit"?"Administrative audit":"Security and account events"} subtitle="Immutable administrative history; secrets and password hashes are never returned." rows={rows} columns={["created_at","action","entity_type","entity_id"]}/>:<Reports data={data as Overview}/>}</div></main>{toast&&<div className="toast"><ShieldCheck size={18}/>{toast}</div>}{dialogs.view}</div>}
function Overview({data,setSection}:{data:Overview;setSection:(s:Section)=>void}){const m=data.metrics??{};return <><div className="page-title"><div><p className="eyebrow">System governance</p><h1>Is Haven configured and secure?</h1><p>Account health, configuration warnings, and recent administrative events from live records.</p></div><button className="btn btn-accent" onClick={()=>setSection("users")}>Manage users</button></div><div className="metric-grid">{[["Active users",m.activeUsers],["Inactive users",m.inactiveUsers],["Staff accounts",m.staffAccounts],["Guest accounts",m.guestAccounts],["Needs attention",m.attention],["Room types",m.roomTypes],["Inactive rooms",m.inactiveRooms],["Active recovery links",m.activeRecoveryTokens]].map(([name,value])=><article className="metric-card" key={name}><div><span>{name}</span><b>{value}</b><small>Live administrative record</small></div><i><ShieldCheck size={21}/></i></article>)}</div><div className="data-panel"><div className="panel-heading"><div><h3>Recent administrative changes</h3><p>Immutable audit history</p></div></div><AuditRows rows={data.recentAudit??[]}/></div></>}
function UsersView({rows,create,action}:{rows:RecordItem[];create:()=>void;action:(x:RecordItem,a:"status"|"role"|"metadata"|"recovery")=>void}){return <><div className="page-title"><div><p className="eyebrow">Account governance</p><h1>Users and staff accounts</h1><p>Lifecycle, role, metadata, and secure recovery. Business history is never deleted.</p></div><button className="btn btn-accent" onClick={create}>Create staff account</button></div><div className="data-panel"><div className="table-scroll"><table aria-label="Staff accounts"><thead><tr>{["Name","Email","Role","Department","Status","Recovery","Version","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{label(item.role)}</td><td>{label(item.department)}</td><td><span className={`badge ${item.account_status}`}>{label(item.account_status)}</span></td><td>{item.recovery_required?"Required":"No"}</td><td>{item.auth_version}</td><td><div className="reservation-actions"><button className="table-action" onClick={()=>action(item,"metadata")}>Edit</button><button className="table-action" onClick={()=>action(item,"role")}>Role</button><button className="table-action" onClick={()=>action(item,"status")}>Lifecycle</button><button className="table-action" onClick={()=>action(item,"recovery")}>Recovery</button></div></td></tr>)}</tbody></table></div></div></>}
function TableView({title,subtitle,rows,columns,action}:{title:string;subtitle:string;rows:RecordItem[];columns:string[];action?:(x:RecordItem)=>void}){return <><div className="page-title"><div><p className="eyebrow">Hotel configuration</p><h1>{title}</h1><p>{subtitle}</p></div></div><div className="data-panel"><div className="table-scroll"><table aria-label="Staff records"><thead><tr>{columns.map(x=><th key={x}>{label(x)}</th>)}{action&&<th>Actions</th>}</tr></thead><tbody>{rows.map(item=><tr key={item.id}>{columns.map(x=><td key={x}>{x==="base_rate"?money(item[x]):typeof item[x]==="boolean"?(item[x]?"Yes":"No"):label(item[x])}</td>)}{action&&<td><button className="table-action" onClick={()=>action(item)}>Configure</button></td>}</tr>)}</tbody></table></div></div></>}
function PolicyView({item,edit}:{item:RecordItem;edit:(x:RecordItem)=>void}){return <><div className="page-title"><div><p className="eyebrow">Future operations</p><h1>Operational policy</h1><p>Updates affect future transactions. Existing reservation snapshots remain unchanged.</p></div><button className="btn btn-accent" onClick={()=>edit(item)}>Update policy</button></div><div className="data-panel"><div className="admin-policy-grid">{Object.entries(item??{}).filter(([key])=>!["key","updated_at"].includes(key)).map(([key,value])=><div key={key}><span>{label(key)}</span><strong>{label(value)}</strong></div>)}</div></div></>}
function RolesView({data}:{data:Record<string,string[]>}){return <><div className="page-title"><div><p className="eyebrow">Controlled catalogue</p><h1>Roles and permissions</h1><p>HAVEN uses one fixed role per account. Admin assigns permitted roles but cannot invent permissions or grant Owner authority.</p></div></div><div className="dashboard-grid">{Object.entries(data??{}).map(([role,values])=><article className="panel" key={role}><h3>{label(role)}</h3>{values.map(value=><p key={value}>{value}</p>)}</article>)}</div></>}
function AuditRows({rows}:{rows:RecordItem[]}){return <div className="table-scroll"><table aria-label="Activity log"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{new Date(String(item.created_at)).toLocaleString()}</td><td>{label(item.action)}</td><td>{label(item.entity_type)}</td><td>{label(item.entity_id)}</td></tr>)}</tbody></table></div>}
function Reports({data}:{data:Overview}){return <><div className="page-title"><div><p className="eyebrow">Administrative reporting</p><h1>Account and configuration summary</h1><p>Governance reporting only—operational and financial execution remain in their departments.</p></div></div><div className="dashboard-grid">{Object.entries(data.roleCounts??{}).map(([role,count])=><article className="metric-card" key={role}><div><span>{label(role)}</span><b>{count}</b><small>Accounts</small></div></article>)}</div></>}
