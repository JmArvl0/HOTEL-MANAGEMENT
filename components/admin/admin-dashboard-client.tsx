"use client";
import{useCallback,useEffect,useRef,useState}from"react";import{signOut}from"next-auth/react";import Link from"next/link";import{Activity,AlertTriangle,BedDouble,Building2,CarTaxiFront,CheckSquare,ChevronDown,ChevronRight,ClipboardCheck,CircleDollarSign,Clock,Cpu,CreditCard,Crown,Database,FileText,FlaskConical,Globe,HardDrive,HeartPulse,History,Hourglass,KeyRound,Layers,Lock,LogOut,Mail,MailCheck,PanelLeftClose,RefreshCw,Search,Send,Settings,Shield,ShieldCheck,Sparkles,User,UserCheck,Users,Wrench}from"lucide-react";import{ThemeToggle}from"@/components/theme-toggle";import{ToastStack,useToasts}from"@/components/ui/toast-stack";import{SettingsDialog}from"@/components/ui/SettingsDialog";import{Modal}from"@/components/ui/Modal";import type{RecordItem,Role}from"@/lib/types";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { HavenSelect } from "@/components/ui/haven-select";
import { HavenSearchInput } from "@/components/ui/haven-data-controls";
import { HavenActionItem, type HavenActionItemTone } from "@/components/ui/haven-action-item";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { FormField } from "@/components/ui/FormDialog";
import { TablePagination, sortTableRows, useTablePagination } from "@/components/ui/table-pagination";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
import { migrationStatus, type SystemHealth } from "@/lib/system-health";
import { SessionExpiryGuard } from "@/components/auth/session-expiry-guard";
type Section="overview"|"users"|"roles"|"rooms"|"room_types"|"transport_services"|"policy"|"audit"|"security"|"security_config"|"password_resets"|"reports"|"system";type User={id:string;name?:string|null;email?:string|null;role:Role};type Overview={metrics:Record<string,number>;roleCounts:Record<string,number>;recentAudit:RecordItem[]};
const nav:[Section,string,React.ElementType][]=[["overview","Overview",Activity],["users","Users & Staff",Users],["roles","Roles & Permissions",ShieldCheck],["rooms","Room Configuration",Building2],["room_types","Room Types",Building2],["transport_services","Transfer Vehicles",CarTaxiFront],["policy","Hotel Policies",Settings],["audit","Audit Logs",FileText],["security","Security events",KeyRound],["security_config","Security Configuration",ShieldCheck],["password_resets","Password reset audit",UserCheck],["reports","Admin Reports",ClipboardCheck],["system","System Health",HeartPulse]];
// Presentational grouping only — admin sees every module; no RBAC filtering on this client.
export const NAV_GROUPS:{id:string;label:string;sections:Section[]}[]=[{id:"workspace",label:"Workspace",sections:["overview"]},{id:"accounts",label:"Accounts",sections:["users","roles"]},{id:"configuration",label:"Configuration",sections:["rooms","room_types","transport_services","policy"]},{id:"governance",label:"Governance",sections:["audit","security","security_config","password_resets","reports","system"]}];
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
export default function AdminDashboardClient({user,sessionExpiresAt}:{user:User;sessionExpiresAt?:string|null}){const[section,setSection]=useState<Section>("overview"),[data,setData]=useState<unknown>(null),[loadedSection,setLoadedSection]=useState<Section|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(""),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("haven-admin-sidebar-collapsed")==="true"),[menu,setMenu]=useState(false),[profileOpen,setProfileOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);const profileMenu=useRef<HTMLDivElement>(null);const loadRequest=useRef(0);
useEffect(()=>{if(!profileOpen)return;const outside=(event:Event)=>{if(profileMenu.current&&!profileMenu.current.contains(event.target as Node))setProfileOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setProfileOpen(false)};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)}},[profileOpen]);

  const dialogs = useActionDialogs();

  const toastController=useToasts();const notify=(message:string)=>{toastController.push({title:message})};

  const load=useCallback(async(silent=false)=>{const requestedSection=section;const requestId=++loadRequest.current;if(requestedSection==="room_types"||requestedSection==="transport_services"){setLoadedSection(requestedSection);setLoadError("");setLoading(false);return}if(!silent){setLoading(true);setLoadError("")}const url=requestedSection==="security_config"?"/api/admin/security-policy":`/api/admin/data?section=${requestedSection}`;try{const response=await fetch(url,{cache:"no-store"}),body=await response.json().catch(()=>({}));if(requestId!==loadRequest.current)return;if(!response.ok)throw new Error(body.error??"Unable to load administrative data.");setData(body.data);setLoadedSection(requestedSection);setLoadError("")}catch(cause){if(requestId!==loadRequest.current||silent)return;setLoadError(cause instanceof Error&&cause.message!=="Failed to fetch"?cause.message:"Unable to reach the administration service. Check your connection and try again.")}finally{if(requestId===loadRequest.current&&!silent)setLoading(false)}},[section]);useEffect(()=>{const timer=setTimeout(()=>load(),0);return()=>clearTimeout(timer)},[load]);
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
  const converting=action==="role"&&String(item.role)==="guest";
  const title=action==="status"?"Change account status":converting?"Convert guest to staff":action==="role"?"Change account role":action==="metadata"?"Edit account metadata":"Reset account access";
  const description=converting?`${item.name} · ${item.email}. Conversion creates an inactive staff account and a one-hour recovery link; accounts with booking or financial history need the Owner-only history-carrying conversion.`:`${item.name} · ${item.email}`;
  const reason:FormField={key:"reason",label:"Reason",type:"textarea",required:true,validation:requiredText("Reason")};
  let fields:FormField[]=[reason];
  if(action==="status")fields=[{key:"status",label:"New status",type:"select",required:true,defaultValue:String(item.account_status),options:STATUS_OPTIONS},reason];
  if(action==="role")fields=[
    {key:"role",label:"New role",type:"select",required:true,defaultValue:converting?"front_desk":String(item.role),options:ROLE_OPTIONS},
    ...(converting?[{key:"department",label:"Department",type:"text",helpText:"Leave blank to use the department assigned to this role."} as FormField,{key:"employeeReference",label:"Employee reference (optional)",type:"text"} as FormField,{key:"withHistory",label:"Carry existing booking history (Owner only)",type:"checkbox",helpText:"Converts despite holds/reservations; history is preserved and audited. Requires an active Owner session."} as FormField]:[]),
    reason
  ];
  if(action==="metadata")fields=[
    {key:"name",label:"Name",type:"text",required:true,defaultValue:String(item.name??""),validation:requiredText("Name")},
    {key:"phone",label:"Phone",type:"tel",defaultValue:String(item.phone??"")},
    {key:"department",label:"Department",type:"text",defaultValue:String(item.department??"")},
    {key:"employeeReference",label:"Employee reference",type:"text",defaultValue:String(item.employee_reference??"")},
    reason,
  ];
  const data=await dialogs.askForm({title,description,submitText:"Apply change",fields});
  if(!data)return;
  const payload:Record<string,unknown>={action:converting?"convert":action,reason:String(data.reason),version:item.auth_version};
  if(action==="status")payload.status=String(data.status);
  if(action==="role")payload.role=String(data.role);
  if(converting){payload.expectedEmail=item.email;payload.department=String(data.department??"");payload.employeeReference=String(data.employeeReference??"");payload.withHistory=Boolean(data.withHistory)}
  if(action==="metadata"){
    payload.name=String(data.name??"");
    payload.phone=String(data.phone??"");
    payload.department=String(data.department??"");
    payload.employeeReference=String(data.employeeReference??"");
  }
  const body=await post(`/api/admin/users/${item.id}/action`,payload);
  if(body&&(action==="recovery"||converting)){await navigator.clipboard.writeText(body.data.recoveryUrl);notify(`${converting?"Guest converted to inactive staff. ":""}Recovery link copied. It expires at ${new Date(body.data.expiresAt).toLocaleString()}.`)}
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
 async function saveSessionPolicy(item:RecordItem){
  const idleOpts=[["10","10 minutes"],["15","15 minutes"],["30","30 minutes"],["45","45 minutes"],["60","1 hour"],["120","2 hours"],["240","4 hours"],["480","8 hours"]].map(([value,optLabel])=>({value,label:optLabel}));
  const absoluteOpts=[["60","1 hour"],["120","2 hours"],["240","4 hours"],["480","8 hours"],["720","12 hours"],["1440","24 hours"]].map(([value,optLabel])=>({value,label:optLabel}));
  const data=await dialogs.askForm({
    title:"Configure session settings",
    description:"Takes effect at the next session validation. Existing sessions are never silently revoked.",
    size:"lg",
    submitText:"Review changes",
    fields:[
      {key:"persistent",label:"Persistent login / Remember Me",type:"select",required:true,defaultValue:item.persistent_session_enabled?"on":"off",options:[{value:"on",label:"On — offer Keep me signed in"},{value:"off",label:"Off — standard sessions only"}]},
      {key:"idle",label:"Inactivity timeout",type:"select",required:true,defaultValue:String(item.idle_timeout_minutes??30),options:idleOpts},
      {key:"absolute",label:"Maximum session lifetime",type:"select",required:true,defaultValue:String(item.absolute_session_minutes??480),options:absoluteOpts},
      {key:"reason",label:"Reason for change",type:"textarea",required:true,validation:requiredText("Reason for change")},
    ],
  });
  if(!data)return;
  const persistent=String(data.persistent)==="on",idle=Number(data.idle),absolute=Number(data.absolute);
  if(!Number.isInteger(idle)||!Number.isInteger(absolute)||absolute<idle){notify("Maximum session lifetime must not be shorter than the inactivity timeout.");return}
  const fmt=(minutes:number)=>minutes<60?`${minutes} min`:`${minutes/60} h`;
  const changes:string[]=[];
  if(persistent!==Boolean(item.persistent_session_enabled))changes.push(`Persistent login\n${item.persistent_session_enabled?"On":"Off"} → ${persistent?"On":"Off"}`);
  if(idle!==Number(item.idle_timeout_minutes))changes.push(`Inactivity timeout\n${fmt(Number(item.idle_timeout_minutes))} → ${fmt(idle)}`);
  if(absolute!==Number(item.absolute_session_minutes))changes.push(`Maximum session lifetime\n${fmt(Number(item.absolute_session_minutes))} → ${fmt(absolute)}`);
  if(!changes.length){notify("No session changes to apply.");return}
  const ok=await dialogs.askConfirm({title:"Update session settings?",message:`These changes affect authentication and session behavior for HAVEN users.\n\nSummary:\n\n${changes.join("\n\n")}`,confirmText:"Confirm update",variant:"warning"});
  if(!ok)return;
  const body=await patch("/api/admin/security-policy",{persistentSessionEnabled:persistent,idleTimeoutMinutes:idle,absoluteSessionMinutes:absolute,loginOtpEnabled:Boolean(item.login_otp_enabled),otpTtlSeconds:Number(item.otp_ttl_seconds??300),otpResendCooldownSeconds:Number(item.otp_resend_cooldown_seconds??60),otpMaxAttempts:Number(item.otp_max_attempts??5),reason:String(data.reason),version:item.version});
  if(body)notify("Session settings updated and audited.")
}
 async function saveOtpPolicy(item:RecordItem){
  const data=await dialogs.askForm({
    title:"Manage OTP policy",
    description:"Password plus a single-use emailed code at login. Takes effect for new sign-ins.",
    size:"lg",
    submitText:"Review changes",
    fields:[
      {key:"otp",label:"Require email OTP at login",type:"select",required:true,defaultValue:item.login_otp_enabled?"on":"off",options:[{value:"on",label:"On — password plus emailed code"},{value:"off",label:"Off — password only"}]},
      {key:"ttl",label:"OTP validity",type:"select",required:true,defaultValue:String(item.otp_ttl_seconds??300),options:[["180","3 minutes"],["300","5 minutes"],["600","10 minutes"]].map(([value,optLabel])=>({value,label:optLabel}))},
      {key:"cooldown",label:"Resend cooldown",type:"select",required:true,defaultValue:String(item.otp_resend_cooldown_seconds??60),options:[["30","30 seconds"],["60","60 seconds"],["120","120 seconds"]].map(([value,optLabel])=>({value,label:optLabel}))},
      {key:"attempts",label:"Maximum attempts",type:"select",required:true,defaultValue:String(item.otp_max_attempts??5),options:[["3","3 attempts"],["5","5 attempts"],["10","10 attempts"]].map(([value,optLabel])=>({value,label:optLabel}))},
      {key:"reason",label:"Reason for change",type:"textarea",required:true,validation:requiredText("Reason for change")},
    ],
  });
  if(!data)return;
  const otp=String(data.otp)==="on",ttl=Number(data.ttl),cooldown=Number(data.cooldown),attempts=Number(data.attempts);
  const ttlFmt=(s:number)=>`${s/60} min`;
  const changes:string[]=[];
  if(otp!==Boolean(item.login_otp_enabled))changes.push(`Login OTP\n${item.login_otp_enabled?"On":"Off"} → ${otp?"On":"Off"}`);
  if(ttl!==Number(item.otp_ttl_seconds??300))changes.push(`OTP validity\n${ttlFmt(Number(item.otp_ttl_seconds??300))} → ${ttlFmt(ttl)}`);
  if(cooldown!==Number(item.otp_resend_cooldown_seconds??60))changes.push(`Resend cooldown\n${Number(item.otp_resend_cooldown_seconds??60)} sec → ${cooldown} sec`);
  if(attempts!==Number(item.otp_max_attempts??5))changes.push(`Maximum attempts\n${Number(item.otp_max_attempts??5)} → ${attempts}`);
  if(!changes.length){notify("No OTP changes to apply.");return}
  const enablingOtp=otp&&!item.login_otp_enabled;
  const ok=await dialogs.askConfirm({title:"Update OTP policy?",message:`These changes affect authentication and session behavior for HAVEN users.\n\nSummary:\n\n${changes.join("\n\n")}${enablingOtp?"\n\nEnable login OTP only after SMTP is configured and the connection test passes — without delivery, nobody can sign in.":""}`,confirmText:"Confirm update",variant:"warning"});
  if(!ok)return;
  const body=await patch("/api/admin/security-policy",{persistentSessionEnabled:Boolean(item.persistent_session_enabled),idleTimeoutMinutes:Number(item.idle_timeout_minutes),absoluteSessionMinutes:Number(item.absolute_session_minutes),loginOtpEnabled:otp,otpTtlSeconds:ttl,otpResendCooldownSeconds:cooldown,otpMaxAttempts:attempts,reason:String(data.reason),version:item.version});
  if(body)notify("OTP policy updated and audited.")
}
 
 const rows=Array.isArray(data)?data as RecordItem[]:[];const contentLoading=loading||(!loadError&&loadedSection!==section);return <div className={`app-shell${collapsed?" sidebar-collapsed":""}`}><aside id="admin-navigation" className={`sidebar${menu?" open":""}${collapsed?" collapsed":""}`}><div className="sidebar-top"><div className="brand"><button className="brand-mark sidebar-brand-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMenu(false)}else{const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label={collapsed?"Expand navigation":"Collapse navigation"} aria-controls="admin-navigation" aria-expanded={!collapsed} title={collapsed?"Expand navigation":"Collapse navigation"}><Sparkles size={17}/></button><Link href="/" className="brand-copy" aria-label="Hotel homepage" title="Hotel homepage">HAVEN<small>SYSTEM ADMINISTRATION</small></Link><button className="sidebar-collapse-button" onClick={()=>{if(!window.matchMedia("(max-width: 1000px)").matches){const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label="Collapse navigation" aria-controls="admin-navigation" aria-expanded={!collapsed} title="Collapse navigation"><PanelLeftClose size={16}/></button></div></div><div className="property-pill" title="HAVEN Hotel & Residences"><span>HV</span><div className="property-copy"><b>HAVEN</b><small>HOTEL &amp; RESIDENCES</small></div></div><AdminSidebarNav section={section} onSelect={(key)=>{setSection(key);setMenu(false)}}/></aside><main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={()=>setMenu(true)}><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find(x=>x[0]===section)?.[1]}</p><small>Secure hotel governance workspace</small></div><div className="header-actions"><SessionExpiryGuard expiresAt={sessionExpiresAt}/><ThemeToggle/><div className="profile-menu-wrap" ref={profileMenu}><button className="profile-menu-btn" onClick={()=>setProfileOpen((value)=>!value)} aria-expanded={profileOpen} aria-haspopup="menu" aria-label="Account menu"><b>{(user.name??"A").slice(0,2).toUpperCase()}</b><span>{user.name}</span><ChevronDown size={14}/></button>{profileOpen&&<div className="popover-gap"><div className="profile-popover"><p><strong>{user.name}</strong><small>{user.email}</small><small>{roleLabel(user.role)}</small></p><button onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={15}/>Settings</button><button onClick={()=>signOut({callbackUrl:"/"})}><LogOut size={15}/>Sign Out</button></div></div>}</div></div></header><ToastStack controller={toastController}/><div className={`workspace-body admin-workspace admin-section-${section}`} aria-busy={contentLoading}>{contentLoading?<div className="empty admin-loading"><Activity/><h3>Loading governance data…</h3><p>Preparing the {nav.find(x=>x[0]===section)?.[1].toLowerCase()} workspace.</p></div>:loadError?<div className="empty admin-loading" role="alert"><Activity/><h3>Administrative data unavailable</h3><p>{loadError}</p><button className="btn btn-accent" onClick={()=>void load()}>Try again</button></div>:section==="overview"?<Overview data={data as Overview} setSection={setSection}/>:section==="users"?<UsersView rows={rows} create={createStaff} action={userAction}/>:section==="rooms"?<RoomsView rows={rows} configure={editRoom}/>:section==="room_types"?<RoomCatalogPanel role="admin"/>:section==="transport_services"?<TransportServicesPanel/>:section==="security_config"?<SecurityConfigView item={data as RecordItem} saveSession={saveSessionPolicy} saveOtp={saveOtpPolicy} notify={notify}/>:section==="policy"?<PolicyView item={data as RecordItem} edit={editPolicy}/>:section==="roles"?<RolesView data={data}/>:section==="password_resets"?<PasswordResetAuditView rows={rows} notify={notify}/>:section==="audit"||section==="security"?<AuditView security={section==="security"} rows={rows}/>:section==="system"?<SystemHealthView data={data as SystemHealth} onRefresh={()=>load()} />:<Reports data={data as Overview}/>}</div></main>{settingsOpen&&<SettingsDialog isOpen onClose={()=>setSettingsOpen(false)}/>}{dialogs.view}</div>}
function Overview({data,setSection}:{data:Overview;setSection:(s:Section)=>void}){
 const m=data.metrics??{},attention=Number(m.attention??0);
 const quickActions:{label:string;detail:string;section:Section;Icon:React.ElementType}[]=[
  {label:"Manage accounts",detail:"Create staff and manage lifecycle",section:"users",Icon:Users},
  {label:"Review permissions",detail:"Inspect the fixed role catalogue",section:"roles",Icon:ShieldCheck},
  {label:"Configure rooms",detail:"Maintain room metadata and status",section:"rooms",Icon:Building2},
  {label:"Update hotel policy",detail:"Control rules for future bookings",section:"policy",Icon:Settings},
  {label:"Review security",detail:"Inspect access and recovery events",section:"security",Icon:KeyRound},
  {label:"Security configuration",detail:"Control session and verification safeguards",section:"security_config",Icon:ShieldCheck},
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
  const healthTone=(tone:string):HavenActionItemTone=>tone==="attention"?"rose":tone==="caution"?"amber":tone==="healthy"?"green":"neutral";
  const healthQuiet=(tone:string,value:number)=>value===0&&(tone==="attention"||tone==="caution");
  const roles=Object.entries(data.roleCounts??{}).sort((a,b)=>b[1]-a[1]),maxRole=Math.max(1,...roles.map(([,count])=>count));
 return <div className="admin-overview">
  <div className="page-title admin-overview-title"><div><h1>Governance at a glance</h1><p>Live account health, hotel configuration, and immutable administrative activity.</p></div><div className={`admin-posture ${attention>0?"attention":"healthy"}`}><ShieldCheck size={19}/><span><strong>{attention>0?`${attention} account${attention===1?"":"s"} need review`:"Account access is clear"}</strong><small>Based on suspension and recovery flags</small></span><button type="button" onClick={()=>setSection("security")}>Review<ChevronRight size={15}/></button></div></div>
   <section className="admin-quick-section" aria-labelledby="admin-quick-title"><div className="admin-section-heading"><div><h2 id="admin-quick-title">Quick actions</h2><p>Open the most-used administration tools.</p></div></div><div className="admin-quick-actions">{quickActions.map(({label:actionLabel,detail,section:target,Icon})=><HavenActionItem key={target} icon={Icon} tone="neutral" title={actionLabel} description={detail} onAction={()=>setSection(target)} />)}</div></section>
   <section className="admin-health-section" aria-labelledby="admin-health-title"><div className="admin-section-heading"><div><h2 id="admin-health-title">System health</h2><p>Select an indicator to open its source module.</p></div><span>Live Supabase records</span></div><div className="admin-health-grid">{health.map(({label:metricLabel,value,detail,section:target,Icon,tone})=><HavenActionItem key={metricLabel} variant="stat" icon={Icon} tone={healthTone(tone)} quiet={healthQuiet(tone,Number(value))} title={metricLabel} value={value} description={detail} onAction={()=>setSection(target)} actionLabel={`${metricLabel}: ${value}. Open ${nav.find(([key])=>key===target)?.[1]??target}`} />)}</div></section>
  <div className="admin-overview-lower">
   <section className="panel admin-role-panel" aria-labelledby="admin-role-title"><div className="panel-heading"><div><h3 id="admin-role-title">Account distribution</h3><p>Current accounts by assigned role</p></div><button type="button" onClick={()=>setSection("roles")}>Review permissions</button></div><div className="admin-role-list">{roles.map(([role,count])=><div className="admin-role-row" key={role}><span><strong>{roleLabel(role)}</strong><small>{count} account{count===1?"":"s"}</small></span><div className="admin-role-meter" aria-hidden="true"><i style={{width:`${Math.max(4,count/maxRole*100)}%`}}/></div><b>{count}</b></div>)}</div></section>
   <section className="data-panel admin-audit-panel" aria-labelledby="admin-audit-title"><div className="panel-heading"><div><h3 id="admin-audit-title">Recent governance activity</h3><p>Latest immutable administrative events</p></div><button type="button" onClick={()=>setSection("audit")}>View audit log</button></div><AuditRows rows={data.recentAudit??[]}/></section>
  </div>
 </div>
}
// Exported for the jsdom render test (users-view.test.tsx). Filters are
// client-side over the already-loaded rows — same pattern as the
// approvals toolbar — and the option lists derive from the data so a select
// never offers a value that isn't there.
export function UsersView({rows,create,action}:{rows:RecordItem[];create:()=>void;action:(x:RecordItem,a:"status"|"role"|"metadata"|"recovery")=>void}){const[role,setRole]=useState("all");const[status,setStatus]=useState("all");const[recovery,setRecovery]=useState("all");const[department,setDepartment]=useState("all");const[search,setSearch]=useState("");
 const roles=Array.from(new Set(rows.map(item=>String(item.role))));const departments=Array.from(new Set(rows.map(item=>String(item.department??"")).filter(Boolean)));
 const visible=sortTableRows(rows.filter(item=>(role==="all"||String(item.role)===role)&&(status==="all"||String(item.account_status)===status)&&(recovery==="all"||(recovery==="required")===Boolean(item.recovery_required))&&(department==="all"||String(item.department??"")===department)&&[item.name,item.email,item.department,item.employee_reference].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase()))),item=>String(item.name??item.email??""));
 const page=useTablePagination(visible);
  const clearFilters=()=>{setRole("all");setStatus("all");setRecovery("all");setDepartment("all");setSearch("")};
 // Snapshot cards reuse the exact filter predicates, so a card count always
 // equals what its filter shows (card == select == table rows).
 const counts={active:rows.filter(item=>String(item.account_status)==="active").length,suspended:rows.filter(item=>String(item.account_status)==="suspended").length,recovery:rows.filter(item=>Boolean(item.recovery_required)).length,staff:rows.filter(item=>String(item.role)!=="guest").length};
 const linkedQueue=status!=="all"?`status:${status}`:recovery==="required"?"recovery:required":undefined;
 const selectCard=(queue:string)=>{const[key,value]=queue.split(":");if(key==="status")setStatus(value);if(key==="recovery")setRecovery(value)};
 return <><div className="page-title"><div><p className="admin-section-context">Account governance</p><h1>Users and staff accounts</h1><p>Lifecycle, role, metadata, and secure recovery. Business history is never deleted.</p></div><button className="btn btn-accent" onClick={create}>Create staff account</button></div>
 <ModuleSummaryCards ariaLabel="Accounts summary" activeQueue={linkedQueue} onSelect={selectCard} cards={[
  {label:"Accounts on record",value:rows.length,hint:"Immutable account history",icon:Users,tone:"active"},
  {label:"Active",value:counts.active,hint:"Enabled accounts",icon:ShieldCheck,tone:"done",queue:"status:active"},
  {label:"Suspended",value:counts.suspended,hint:"Access suspended",icon:KeyRound,tone:"attention",queue:"status:suspended"},
  {label:"Recovery required",value:counts.recovery,hint:"Awaiting an access reset",icon:KeyRound,tone:"today",queue:"recovery:required"},
  {label:"Staff accounts",value:counts.staff,hint:"Operational and governance roles",icon:Users},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters">   <HavenSearchInput value={search} onValueChange={setSearch} label="Search accounts" placeholder="Search name, email, department, or reference..."/><div className="haven-filter"><span>Role</span><HavenSelect value={role} onChange={setRole} ariaLabel="Filter by role" options={[{ value: "all", label: "All roles" }, ...roles.map(value=>({ value, label: roleLabel(value) }))]} /></div><div className="haven-filter"><span>Status</span><HavenSelect value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS.map(option=>({ value: option.value, label: option.label }))]} /></div><div className="haven-filter"><span>Recovery</span><HavenSelect value={recovery} onChange={setRecovery} ariaLabel="Filter by recovery state" options={[{ value: "all", label: "All accounts" }, { value: "required", label: "Recovery required" }, { value: "no", label: "No recovery needed" }]} /></div><div className="haven-filter"><span>Department</span><HavenSelect value={department} onChange={setDepartment} ariaLabel="Filter by department" options={[{ value: "all", label: "All departments" }, ...departments.map(value=>({ value, label: label(value) }))]} /></div></div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Staff accounts"><thead><tr>{["Name","Email","Role","Department","Status","Recovery","Version","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{page.rows.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{roleLabel(item.role)}</td><td>{label(item.department)}</td><td><span className={`badge ${item.account_status}`}>{label(item.account_status)}</span></td><td>{item.recovery_required?"Required":"No"}</td><td>{item.auth_version}</td><td><div className="reservation-actions"><button className="table-action" onClick={()=>action(item,"metadata")}>Edit</button><button className="table-action" onClick={()=>action(item,"role")}>Role</button><button className="table-action" onClick={()=>action(item,"status")}>Lifecycle</button><button className="table-action" onClick={()=>action(item,"recovery")}>Recovery</button></div></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No accounts match these filters</h3><p>Try clearing the filters to see every account.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <TablePagination {...page} onPageChange={page.setPage} noun={`account${rows.length!==1?"s":""}`} allTotal={rows.length} note="Every lifecycle, role, and recovery change is server-authorized and audited."/></div></>}
// Room metadata workspace. Operational state (status, housekeeping) is shown
// read-only for orientation; the only write path is administrative metadata
// (editRoom). Filters, cards, and the footer all count the same loaded rows.
export function RoomsView({rows,configure}:{rows:RecordItem[];configure:(x:RecordItem)=>void}){
 const[active,setActive]=useState("all");const[type,setType]=useState("all");const[wing,setWing]=useState("all");const[search,setSearch]=useState("");
 const types=Array.from(new Set(rows.map(item=>String(item.type??"")).filter(Boolean)));const wings=Array.from(new Set(rows.map(item=>String(item.wing??"")).filter(Boolean)));const floors=new Set(rows.map(item=>String(item.floor??""))).size;
 const visible=sortTableRows(rows.filter(item=>(active==="all"||(active==="active")===Boolean(item.administratively_active))&&(type==="all"||String(item.type)===type)&&(wing==="all"||String(item.wing)===wing)&&[item.number,item.type,item.wing,item.administrative_designation].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase()))),item=>String(item.number??""));
 const page=useTablePagination(visible);
 const clearFilters=()=>{setActive("all");setType("all");setWing("all");setSearch("")};
 const inactive=rows.filter(item=>!item.administratively_active).length;
 return <><div className="page-title"><div><p className="admin-section-context">Hotel configuration</p><h1>Physical room metadata</h1><p>Administrative configuration only — occupancy, Housekeeping, and Maintenance state are read-only.</p></div></div>
 <ModuleSummaryCards ariaLabel="Room configuration summary" activeQueue={active} onSelect={setActive} cards={[
  {label:"Rooms on record",value:rows.length,hint:"Every physical room",icon:BedDouble,tone:"active"},
  {label:"Administratively inactive",value:inactive,hint:"Disabled for governance reasons",icon:Building2,tone:inactive>0?"attention":"done",queue:"inactive"},
  {label:"Room types",value:types.length,hint:"Types present in inventory",icon:Building2},
  {label:"Floors",value:floors,hint:"Distinct floor levels",icon:Building2,tone:"today"},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters">
   <HavenSearchInput value={search} onValueChange={setSearch} label="Search rooms" placeholder="Search number, type, wing, or designation..."/>
  <div className="haven-filter"><span>Status</span><HavenSelect value={active} onChange={setActive} ariaLabel="Filter by administrative status" options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Administratively active" }, { value: "inactive", label: "Administratively inactive" }]} /></div>
  <div className="haven-filter"><span>Type</span><HavenSelect value={type} onChange={setType} ariaLabel="Filter by room type" options={[{ value: "all", label: "All types" }, ...types.map(value=>({ value, label: value }))]} /></div>
  <div className="haven-filter"><span>Wing</span><HavenSelect value={wing} onChange={setWing} ariaLabel="Filter by wing" options={[{ value: "all", label: "All wings" }, ...wings.map(value=>({ value, label: label(value) }))]} /></div>
 </div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Room configuration"><thead><tr>{["Room","Floor","Type","Wing","Designation","Admin status","Operational status","Housekeeping","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{page.rows.map(item=><tr key={item.id}><td><strong>{label(item.number)}</strong></td><td>{label(item.floor)}</td><td>{label(item.type)}</td><td>{label(item.wing)}</td><td>{label(item.administrative_designation)}</td><td><span className={`badge ${item.administratively_active?"active":"inactive"}`}>{item.administratively_active?"Active":"Inactive"}</span></td><td><span className={`badge ${item.status}`}>{label(item.status)}</span></td><td><span className={`badge ${item.housekeeping}`}>{label(item.housekeeping)}</span></td><td><div className="reservation-actions"><button className="table-action" onClick={()=>configure(item)}>Configure</button></div></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No rooms match these filters</h3><p>Try clearing the filters to see every room.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <TablePagination {...page} onPageChange={page.setPage} noun={`room${rows.length!==1?"s":""}`} allTotal={rows.length} note="Occupancy and housekeeping state change only through their own departments."/></div></>
}
// Password reset audit: every self-service and link-based reset attempt with
// its OTP state and staged identity selfie. Selfies open in a signed-URL
// preview modal — paths never render as links and bytes never pass through JSON.
// Exported for the jsdom render test (admin-views.test.tsx).
export function PasswordResetAuditView({rows,notify}:{rows:RecordItem[];notify:(message:string)=>void}){
 const[status,setStatus]=useState("all");const[search,setSearch]=useState("");
 const[preview,setPreview]=useState<{email:string;url:string}|null>(null);const[previewBusy,setPreviewBusy]=useState<string|null>(null);
 const visible=rows.filter(item=>(status==="all"||String(item.status)===status)&&[item.email,item.ip_address,item.status].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())));
 const page=useTablePagination(visible);
 const clearFilters=()=>{setStatus("all");setSearch("")};
 const counts={requested:rows.filter(item=>String(item.status)==="requested").length,verified:rows.filter(item=>String(item.status)==="otp_verified").length,completed:rows.filter(item=>String(item.status)==="completed").length,failed:rows.filter(item=>String(item.status)==="failed").length};
 const stamp=(value:unknown)=>new Date(String(value)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
 async function inspect(item:RecordItem){
  setPreviewBusy(String(item.id));
  try{const response=await fetch(`/api/admin/password-resets/${item.id}/selfie`,{cache:"no-store"});const body=await response.json().catch(()=>null);
   if(!response.ok||typeof body?.data?.url!=="string"){notify(body?.error??"The selfie could not be loaded.");return}
   setPreview({email:String(item.email??"—"),url:String(body.data.url)});
  }finally{setPreviewBusy(null)}
 }
 return <><div className="page-title"><div><p className="admin-section-context">Authentication & session security</p><h1>Password reset audit</h1><p>Every reset attempt with OTP state and identity-selfie evidence. Selfies are human-reviewed proof — never automatic approval.</p></div></div>
 <ModuleSummaryCards ariaLabel="Password reset summary" cards={[
  {label:"Attempts on record",value:rows.length,hint:"Most recent first",icon:KeyRound,tone:"active"},
  {label:"Completed",value:counts.completed,hint:"Password changed with selfie proof",icon:ShieldCheck,tone:"done"},
  {label:"Awaiting completion",value:counts.requested+counts.verified,hint:"Link issued, reset not finished",icon:Activity,tone:counts.requested+counts.verified>0?"today":"done"},
  {label:"Failed",value:counts.failed,hint:"Expired, invalid, or undelivered",icon:KeyRound,tone:counts.failed>0?"attention":"done"},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters"><HavenSearchInput value={search} onValueChange={setSearch} label="Search reset attempts" placeholder="Search email, IP, or status..."/><div className="haven-filter"><span>Status</span><HavenSelect value={status} onChange={setStatus} ariaLabel="Filter by reset status" options={[{value:"all",label:"All statuses"},{value:"requested",label:"Requested"},{value:"otp_verified",label:"OTP verified"},{value:"completed",label:"Completed"},{value:"failed",label:"Failed"}]}/></div></div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Password reset attempts"><thead><tr>{["Time","Email","IP address","OTP","Status","Selfie proof"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{page.rows.map(item=><tr key={item.id}><td>{stamp(item.created_at)}</td><td><strong>{label(item.email)}</strong></td><td>{label(item.ip_address)}</td><td><span className={`badge ${item.otp_verified?"paid":"expired"}`}>{item.otp_verified?"Verified":"Pending"}</span></td><td><span className={`badge ${item.status}`}>{label(item.status)}</span></td><td>{item.has_selfie?<button className="table-action" onClick={()=>inspect(item)} disabled={previewBusy!==null}>{previewBusy===String(item.id)?"Loading…":"Inspect selfie"}</button>:"—"}</td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No reset attempts match these filters</h3><p>Try clearing the filters to see every attempt.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <TablePagination {...page} onPageChange={page.setPage} noun="attempts" allTotal={rows.length} note="Selfie images are staged evidence; the password change itself is the audited event."/></div>
 {preview&&<Modal isOpen onClose={()=>setPreview(null)} title="Identity selfie proof" description={`Staged for ${preview.email} — compare against a known photo before trusting the reset.`} size="md"><img src={preview.url} alt={`Identity selfie staged for ${preview.email}`} style={{maxWidth:"100%",borderRadius:12}}/></Modal>}</>
}
// Audit Logs and Security share one immutable event stream; the section only
// changes the framing. Filters and cards are client-side over the loaded page
// of events, same pattern as UsersView.
export function AuditView({security,rows}:{security:boolean;rows:RecordItem[]}){
 const[action,setAction]=useState("all");const[entity,setEntity]=useState("all");const[search,setSearch]=useState("");
 const actions=Array.from(new Set(rows.map(item=>String(item.action))));const entities=Array.from(new Set(rows.map(item=>String(item.entity_type))));
 const visible=rows.filter(item=>(action==="all"||String(item.action)===action)&&(entity==="all"||String(item.entity_type)===entity)&&[item.action,item.entity_type,item.entity_id].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())));
 const page=useTablePagination(visible);
 const clearFilters=()=>{setAction("all");setEntity("all");setSearch("")};
 const dayAgo=new Date().getTime()-24*60*60*1000;const last24h=rows.filter(item=>new Date(String(item.created_at)).getTime()>dayAgo).length;
 const latest=rows[0]?new Date(String(rows[0].created_at)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):null;
 const stamp=(value:unknown)=>new Date(String(value)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
 return <><div className="page-title"><div><p className="admin-section-context">{security?"Access and recovery":"Administrative history"}</p><h1>{security?"Security and account events":"Administrative audit"}</h1><p>Immutable administrative history; secrets and password hashes are never returned.</p></div></div>
 <ModuleSummaryCards ariaLabel="Audit summary" cards={[
  {label:"Events on record",value:rows.length,hint:"Most recent first",icon:FileText,tone:"active"},
  {label:"Last 24 hours",value:last24h,hint:"Since this time yesterday",icon:Activity,tone:last24h>0?"today":"done"},
  {label:"Action types",value:actions.length,hint:"Distinct recorded actions",icon:ClipboardCheck},
  {label:"Latest event",value:latest?latest.split(", ")[0]:"—",hint:latest?`Recorded ${latest}`:"No events yet",icon:Activity},
 ]}/>
 <div className="reservation-filters approval-toolbar"><div className="approval-filters">
   <HavenSearchInput value={search} onValueChange={setSearch} label="Search events" placeholder="Search action, entity, or record..."/>
  <div className="haven-filter"><span>Action</span><HavenSelect value={action} onChange={setAction} ariaLabel="Filter by action" options={[{ value: "all", label: "All actions" }, ...actions.map(value=>({ value, label: label(value) }))]} /></div>
  <div className="haven-filter"><span>Entity</span><HavenSelect value={entity} onChange={setEntity} ariaLabel="Filter by entity" options={[{ value: "all", label: "All entities" }, ...entities.map(value=>({ value, label: label(value) }))]} /></div>
 </div></div>
 <div className="data-panel"><div className="table-scroll"><table aria-label="Event log"><thead><tr>{["Time","Action","Entity","Record"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{page.rows.map(item=><tr key={item.id}><td>{stamp(item.created_at)}</td><td><span className="badge pending">{label(item.action)}</span></td><td>{label(item.entity_type)}</td><td><code className="audit-record">{label(item.entity_id)}</code></td></tr>)}</tbody></table></div>
 {visible.length===0&&<div className="empty"><Search/><h3>No events match these filters</h3><p>Try clearing the filters to see every recorded event.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></div>}
 <TablePagination {...page} onPageChange={page.setPage} noun={`event${rows.length!==1?"s":""}`} allTotal={rows.length} note="Newest first — the full history stays immutable in the database."/></div></>
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
export const normalizeRoleCapabilities=(data:unknown):[string,string[]][]=>{if(!data||typeof data!=="object"||Array.isArray(data))return[];return Object.entries(data).filter((entry):entry is[string,string[]]=>entry[0] in ROLE_META&&Array.isArray(entry[1])&&entry[1].every(value=>typeof value==="string")).map(([role,values])=>[role,[...values].sort((a,b)=>a.localeCompare(b))] as [string,string[]]).sort(([a],[b])=>a.localeCompare(b))};
export function RolesView({data}:{data:unknown}){const roles=normalizeRoleCapabilities(data);return <><div className="page-title"><div><p className="admin-section-context">Controlled catalogue</p><h1>Roles and permissions</h1><p>Review the fixed access catalogue. Admin may assign permitted roles but cannot invent permissions or grant Owner authority.</p></div><span className="admin-title-stat"><b>{roles.length}</b> fixed roles</span></div>{roles.length?<div className="admin-roles-grid">{roles.map(([role,values])=>{const meta=ROLE_META[role];const Icon=meta?.Icon;return <article className="panel admin-role-card" key={role}><header>{Icon&&<span className="admin-role-icon"><Icon size={17} aria-hidden="true"/></span>}<div><h3>{roleLabel(role)}</h3><small>{meta?.summary??"Fixed system role"}</small></div><span className="admin-role-count">{values.length}</span></header><ul>{values.map(value=><li key={value}>{value}</li>)}</ul></article>})}</div>:<div className="empty admin-module-empty"><ShieldCheck/><h3>Role catalogue unavailable</h3><p>The permission catalogue could not be read. Refresh the module to try again.</p></div>}</>}
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
export function PolicyView({item,edit}:{item:RecordItem;edit:(x:RecordItem)=>void}){const entries=Object.entries(item??{}).filter(([key])=>!["key","version"].includes(key));const known=new Set(POLICY_GROUPS.flatMap(group=>group.fields.map(([key])=>key)));const extras=entries.filter(([key])=>!known.has(key)&&key!=="updated_at");const groups=[...POLICY_GROUPS,...extras.length?[{title:"Additional settings",note:"Recorded on the policy row",fields:extras.map(([key])=>[key,label(key).replace(/^./,c=>c.toUpperCase())] as [string,string])}]:[]];return <><div className="page-title"><div><p className="admin-section-context">Future operations</p><h1>Operational policy</h1><p>Updates affect future transactions. Existing reservation snapshots remain unchanged.</p></div><button className="btn btn-accent" onClick={()=>edit(item)}>Update policy</button></div><div className="data-panel admin-policy-panel">{item?.updated_at&&<p className="admin-policy-meta">Version {label(item.version)} · updated {new Date(String(item.updated_at)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</p>}<div className="admin-policy-groups">{groups.map(group=><section key={group.title}><h4>{group.title}</h4><p>{group.note}</p><dl>{group.fields.filter(([key])=>key in (item??{})).map(([key,name])=><div key={key}><dt>{name}</dt><dd>{policyValue(key,item?.[key])}</dd></div>)}</dl></section>)}</div></div></>}
// Security Configuration: the unified authentication and session-security
// workspace. Editable policy (session + email OTP) is interactive; enforced
// protections and delivery status are read-only facts, never styled as inputs.
type DeliveryStatus={configured:boolean;sender:string|null;lastChecked:string|null;lastResult:string|null;otpReady:boolean};
function EmailDeliveryPanel({notify,onStatus}:{notify:(message:string)=>void;onStatus?:(status:DeliveryStatus|null)=>void}){
 const[status,setStatus]=useState<DeliveryStatus|null>(null);
 const[busy,setBusy]=useState<"verify"|"send"|null>(null);
 const statusRef=useRef<((status:DeliveryStatus|null)=>void)|undefined>(undefined);
 useEffect(()=>{statusRef.current=onStatus});
 const load=useCallback(async()=>{const response=await fetch("/api/admin/email-delivery",{cache:"no-store"});const body=await response.json().catch(()=>null);if(response.ok&&body?.data){setStatus(body.data);statusRef.current?.(body.data)}},[]);
 useEffect(()=>{void load()},[load]);
 async function act(action:"verify"|"send"){
  setBusy(action);
  const response=await fetch("/api/admin/email-delivery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
  const body=await response.json().catch(()=>null);
  setBusy(null);
  if(response.ok){notify(action==="verify"?"SMTP connection passed.":"Test email sent to your address.");await load()}
  else notify(body?.error??"Delivery check failed.");
 }
 const tone=status?(status.otpReady?"paid":status.configured?"pending":"expired"):"";
 const state=status?(status.otpReady?"Ready":status.configured?(status.lastResult==="passed"?"Configured":"Not verified"):"Not configured"):"Checking…";
 return <div className="data-panel"><div className="panel-heading"><div><h3><Send size={17} aria-hidden="true"/>Email delivery (SMTP)</h3><p>Real delivery state — Ready appears only after a passing connection test.</p></div><span className={`badge ${tone}`}>{state}</span></div><dl>
  <div><dt>SMTP configuration</dt><dd>{status?(status.configured?"Configured":"Not configured"):state}</dd></div>
  <div><dt>Last connection test</dt><dd>{status?(status.lastResult==="passed"?"Passed":status.lastResult==="failed"?"Failed":"Not yet tested"):state}</dd></div>
  <div><dt>Delivery readiness</dt><dd>{state}</dd></div>
 </dl>
 {status&&!status.configured&&<p className="admin-policy-warn">Configure SMTP before enabling login OTP — without delivery, nobody can sign in.</p>}
 <div className="reservation-actions"><button className="table-action" onClick={()=>act("verify")} disabled={busy!==null}><FlaskConical size={15} aria-hidden="true"/>{busy==="verify"?"Testing…":"Test connection"}</button><button className="table-action" onClick={()=>act("send")} disabled={busy!==null}><Mail size={15} aria-hidden="true"/>{busy==="send"?"Sending…":"Send test email"}</button></div></div>;
}
export function SecurityConfigView({item,saveSession,saveOtp,notify}:{item:RecordItem;saveSession:(x:RecordItem)=>void;saveOtp:(x:RecordItem)=>void;notify:(message:string)=>void}){
 const fmt=(minutes:number)=>Number.isFinite(minutes)?(minutes<60?`${minutes} min`:`${minutes/60} h`):"—";
 const[delivery,setDelivery]=useState<DeliveryStatus|null>(null);
 if(!item||item.idle_timeout_minutes==null)return <><div className="page-title"><div><p className="admin-section-context">Authentication & session security</p><h1>Security configuration</h1><p>Manage how HAVEN protects account access.</p></div></div><div className="empty admin-module-empty"><ShieldCheck/><h3>Security configuration unavailable</h3><p>The security policy could not be read. Refresh the module to try again.</p></div></>;
 const persistent=item.persistent_session_enabled===true;
 const idle=Number(item.idle_timeout_minutes),absolute=Number(item.absolute_session_minutes);
 const otp=item.login_otp_enabled===true;
 const ttlMin=Math.round(Number(item.otp_ttl_seconds??300)/60),cooldownSec=Number(item.otp_resend_cooldown_seconds??60),attempts=Number(item.otp_max_attempts??5);
 const history=(item.history??null) as null|{updatedAt?:unknown;updatedBy?:unknown;reason?:unknown;version?:unknown;changes?:{label?:unknown;from?:unknown;to?:unknown}[]};
 const historyChanges=Array.isArray(history?.changes)?(history?.changes??[]).filter((c)=>c&&typeof c.label==="string"):[];
 return <><div className="page-title"><div><p className="admin-section-context">Authentication & session security</p><h1>Security configuration</h1><p>Manage how HAVEN protects account access.</p></div></div>
  <div className="metric-grid" role="group" aria-label="Security summary">
   <article className="metric-card"><div><span>Login OTP status</span><b>{otp?"Enforced (ON)":"Disabled (Off)"}</b><small>{otp?`${ttlMin} min code · ${attempts} attempts`:"Password only"}</small></div><i><KeyRound size={21} aria-hidden="true"/></i></article>
   <article className="metric-card"><div><span>Idle timeout</span><b>{fmt(idle)}</b><small>Inactivity limit</small></div><i><Hourglass size={21} aria-hidden="true"/></i></article>
   <article className="metric-card"><div><span>Max session lifetime</span><b>{fmt(absolute)}</b><small>Absolute session limit</small></div><i><Hourglass size={21} aria-hidden="true"/></i></article>
   <article className="metric-card"><div><span>Email delivery status</span><b>{delivery?(delivery.otpReady?"SMTP Connected":delivery.configured?"Configured":"Not configured"):"Checking…"}</b><small>Live SMTP state</small></div><i><MailCheck size={21} aria-hidden="true"/></i></article>
  </div>
  <div className="admin-security-grid">
  <section className="data-panel" aria-labelledby="sec-session"><div className="panel-heading"><div><h3 id="sec-session"><Lock size={17} aria-hidden="true"/>Session & cookie security</h3><p>The authentication cookie itself is mandatory — this card governs persistence and timeouts only.</p></div></div><dl>
   <div><dt>Persistent login / Remember Me</dt><dd>{persistent?"On":"Off"}</dd></div>
   <div><dt>Inactivity timeout</dt><dd>{fmt(idle)}</dd></div>
   <div><dt>Maximum session lifetime</dt><dd>{fmt(absolute)}</dd></div>
  </dl><div className="reservation-actions"><button className="table-action" onClick={()=>saveSession(item)}><Settings size={15} aria-hidden="true"/>Configure session settings</button></div></section>
  <section className="data-panel" aria-labelledby="sec-otp"><div className="panel-heading"><div><h3 id="sec-otp"><KeyRound size={17} aria-hidden="true"/>Email OTP security</h3><p>Password plus a single-use emailed code at login. Account recovery links stay separate.</p></div><span className={`badge ${otp?"paid":"expired"}`}>{otp?"Enforced":"Disabled"}</span></div><dl>
   <div><dt>Require email OTP at login</dt><dd>{otp?"Enforced":"Disabled"}</dd></div>
   <div><dt>OTP validity window</dt><dd>{ttlMin} min</dd></div>
   <div><dt>Resend cooldown</dt><dd>{cooldownSec} sec</dd></div>
   <div><dt>Maximum attempt limit</dt><dd>{attempts} attempts</dd></div>
  </dl><div className="reservation-actions"><button className="table-action" onClick={()=>saveOtp(item)}><Shield size={15} aria-hidden="true"/>Manage OTP policy</button></div></section>
  <EmailDeliveryPanel notify={notify} onStatus={setDelivery}/>
  <section className="data-panel" aria-labelledby="sec-enforced"><div className="panel-heading"><div><h3 id="sec-enforced"><ShieldCheck size={17} aria-hidden="true"/>Enforced security protections</h3><p>Always on. No administrator control can disable these.</p></div></div><dl>
   <div><dt>HttpOnly cookies</dt><dd>Enforced</dd></div>
   <div><dt>Secure transport (TLS/SSL)</dt><dd>Enforced in production</dd></div>
   <div><dt>SameSite policy</dt><dd>Strict</dd></div>
   <div><dt>Password hashing</dt><dd>bcrypt (cost 12)</dd></div>
  </dl><div className="reservation-actions"><span className="badge"><Lock size={13} aria-hidden="true"/>System enforced (read-only)</span></div></section>
 </div>
 <section className="data-panel" aria-labelledby="sec-audit"><div className="panel-heading"><div><h3 id="sec-audit"><History size={17} aria-hidden="true"/>Security configuration audit log</h3><p>Latest audited security-policy change.</p></div></div>{historyChanges.length>0?<div className="table-scroll"><table aria-label="Security configuration audit log"><thead><tr><th>Time</th><th>Admin</th><th>Setting modified</th><th>Previous value</th><th>New value</th></tr></thead><tbody>{historyChanges.map((c)=><tr key={String(c.label)}><td>{history?.updatedAt?new Date(String(history.updatedAt)).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—"}</td><td>{String(history?.updatedBy??"—")}</td><td>{String(c.label)}</td><td>{String(c.from)}</td><td>{String(c.to)}</td></tr>)}</tbody></table></div>:<p>No configuration changes recorded yet.</p>}</section></>
}
function AuditRows({rows}:{rows:RecordItem[]}){const page=useTablePagination(rows,5);if(!rows.length)return <div className="admin-audit-empty"><FileText size={22}/><h3>No governance activity yet</h3><p>Administrative and security changes will appear here as they are recorded.</p></div>;return <><div className="table-scroll"><table aria-label="Activity log"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{page.rows.map(item=><tr key={item.id}><td>{new Date(String(item.created_at)).toLocaleString()}</td><td>{label(item.action)}</td><td>{label(item.entity_type)}</td><td>{label(item.entity_id)}</td></tr>)}</tbody></table></div><TablePagination {...page} onPageChange={page.setPage} noun="events" note="Newest governance activity first."/></>}
// Governance report over the same overview payload the landing section uses:
// account totals, role distribution with shares, and configuration state.
// Reporting only — operational and financial execution stay in departments.
function Reports({data}:{data:Overview}){const m=data?.metrics??{};const total=Number(m.activeUsers??0)+Number(m.inactiveUsers??0);const roles=sortTableRows(Object.entries(data?.roleCounts??{}),([role])=>role);const page=useTablePagination(roles);return <><div className="page-title"><div><p className="admin-section-context">Administrative reporting</p><h1>Account and configuration summary</h1><p>Governance reporting only — operational and financial execution remain in their departments.</p></div></div>
 <ModuleSummaryCards ariaLabel="Governance report summary" cards={[
  {label:"Accounts on record",value:total,hint:"Every account ever created",icon:Users,tone:"active"},
  {label:"Staff accounts",value:Number(m.staffAccounts??0),hint:"Operational and governance roles",icon:ShieldCheck},
  {label:"Guest accounts",value:Number(m.guestAccounts??0),hint:"Customer portal users",icon:User},
  {label:"Needs attention",value:Number(m.attention??0),hint:"Suspended or recovery-required",icon:KeyRound,tone:Number(m.attention??0)>0?"attention":"done"},
  {label:"Rooms disabled",value:Number(m.inactiveRooms??0),hint:"Administratively inactive",icon:Building2,tone:Number(m.inactiveRooms??0)>0?"today":"done"},
  {label:"Room types inactive",value:Number(m.inactiveRoomTypes??0),hint:"Hidden from the catalogue",icon:Building2,tone:Number(m.inactiveRoomTypes??0)>0?"today":"done"},
 ]}/>
 <div className="admin-report-lower">
  <section className="data-panel" aria-labelledby="admin-report-roles"><div className="panel-heading"><div><h3 id="admin-report-roles">Accounts by role</h3><p>Current distribution across the fixed role catalogue</p></div></div><div className="table-scroll"><table aria-label="Accounts by role"><thead><tr><th>Role</th><th>Accounts</th><th>Share</th></tr></thead><tbody>{page.rows.map(([role,count])=><tr key={role}><td><strong>{roleLabel(role)}</strong></td><td>{count}</td><td>{total?`${Math.round(count/total*100)}%`:"—"}</td></tr>)}</tbody></table></div><TablePagination {...page} onPageChange={page.setPage} noun="roles" note={`${total} account${total!==1?"s":""} on record · one fixed role per account`}/></section>
  <section className="data-panel" aria-labelledby="admin-report-config"><div className="panel-heading"><div><h3 id="admin-report-config">Configuration summary</h3><p>Live hotel configuration state</p></div></div><ul className="admin-config-list"><li><span>Room types in catalogue</span><b>{Number(m.roomTypes??0)}</b></li><li><span>Room types inactive</span><b>{Number(m.inactiveRoomTypes??0)}</b></li><li><span>Rooms administratively inactive</span><b>{Number(m.inactiveRooms??0)}</b></li><li><span>Unused recovery links</span><b>{Number(m.activeRecoveryTokens??0)}</b></li><li><span>Accounts needing attention</span><b>{Number(m.attention??0)}</b></li></ul></section>
 </div></>}
// Exported for the jsdom render test (system-health-view.test.tsx). All
// figures arrive server-computed; the view only formats them. Auto-refreshes
// Payment configuration health: Owner-controlled business values are masked
// and read-only here; System Administration maintains only the technical
// integration status below. No control exists on this panel that could
// redirect customer funds.
function PaymentHealthPanel({payments}:{payments:SystemHealth["payments"]}){
 if(!payments)return <div className="data-panel"><div className="panel-heading"><div><h3>Payment configuration</h3><p>Payment health is still loading.</p></div></div></div>;
 return <div className="data-panel"><div className="panel-heading"><div><h3>Payment configuration</h3><p>Customer payment destination is controlled by the Owner. Technical integration and payment-provider connectivity are maintained by System Administration.</p></div><span className={`badge ${payments.status==="Active"?"paid":"expired"}`}>{payments.status}</span></div>
  <ul className="admin-config-list"><li><span>Business destination (Owner-controlled, read-only)</span><b>{payments.accountName} · {payments.mobileNumber}</b></li><li><span>QR image</span><b>{payments.qrImage}</b></li><li><span>Configured by</span><b>{payments.configuredBy??"Unknown"}</b></li><li><span>Last updated</span><b>{payments.lastUpdated?new Date(payments.lastUpdated).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"Unknown"}</b></li><li><span>Verification mode</span><b>Manual Accounting Verification</b></li><li><span>Customer method</span><b>GCash</b></li><li><span>QR storage</span><b>{payments.qrStorage}</b></li><li><span>Configuration</span><b>{payments.configuration}</b></li><li><span>Webhook integration</span><b>Not configured</b></li><li><span>Provider integration</span><b>Not configured</b></li><li><span>Automatic verification</span><b>Disabled</b></li></ul></div>;
}

// every minute while the section is open (AdminDashboardClient interval).
// Executive 3-tier layout: compact 8-card health grid, automations × alerts,
// then a tabbed ledger (migrations / payment / audit trail). Every figure
// arrives server-computed; the view only formats. Tabs switch visibility
// only — no refetch, the single `data` prop feeds all three.
export function SystemHealthView({data,onRefresh}:{data:SystemHealth;onRefresh:()=>void}){
 // Shape-safe: during a section switch the view renders once with the previous
 // section's data before the new fetch lands (and a failed fetch keeps it), so
 // every field is defaulted rather than assumed.
 const db=data?.db??{},activity=data?.activity??{},rows=data?.migrations?.applied??[];
 const appliedCount=data?.migrations?.appliedCount??rows.length,localCount=data?.migrations?.localCount??null;
 const status=migrationStatus(appliedCount,localCount);
 const behind=(localCount??0)-appliedCount;
 const checked=db.checkedAt?new Date(db.checkedAt).toLocaleTimeString():"—";
 // Extended sections default to honest Unknowns while data is still loading.
 const app=data?.application??{environment:"Unknown",version:"Unknown",commit:null};
 const storageStatus=data?.storage?.status??"unknown";
 const emailLabel=!data?.email?"Unknown":data.email.status==="configured"?"Configured":"Not configured";
 const automations=data?.automations??[];
 const gateway=data?.gateway??null;
 const gatewayLabel=!gateway?"Unknown":gateway.status==="listening_live"?"Listening · Live":gateway.status==="listening_test"?"Listening · Test":"Not configured";
 const deployProvider=data?.deployment?.provider??"Unknown";
 const domainStatus=data?.domain?.status??"not_connected";
 const issues=data?.issues??[];
 const probes=data?.recentProbes??[];
 const[tab,setTab]=useState("migrations");const[search,setSearch]=useState("");
 const tabRefs=useRef<Record<string,HTMLButtonElement|null>>({});
 const tabs=[{key:"migrations",label:"Applied Migrations",Icon:Layers},{key:"payment",label:"Payment Configuration",Icon:CreditCard},{key:"audit",label:"Audit Trail",Icon:FileText}];
 const onTabKeys=(event:React.KeyboardEvent)=>{const order=tabs.map(t=>t.key);const at=order.indexOf(tab);if(event.key==="ArrowRight")setTab(order[(at+1)%order.length]);else if(event.key==="ArrowLeft")setTab(order[(at-1+order.length)%order.length]);else if(event.key==="Home")setTab(order[0]);else if(event.key==="End")setTab(order[order.length-1]);else return;event.preventDefault();const next=order[(at+(event.key==="ArrowLeft"?-1:1)+order.length)%order.length];tabRefs.current[event.key==="Home"?order[0]:event.key==="End"?order[order.length-1]:next]?.focus()};
 const filtered=rows.filter(row=>`${row.version} ${row.name}`.toLowerCase().includes(search.toLowerCase()));
 const page=useTablePagination(filtered);
 const clearSearch=()=>setSearch("");
 return <><div className="page-title"><div><p className="admin-section-context">Technical operations</p><h1><Activity size={22} aria-hidden="true"/>System Health & Infrastructure</h1><p>Live database condition, microservice connectivity, scheduled jobs, and migration status. Auto-refreshed every 60 seconds.</p></div><button className="btn btn-accent" onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/>Run Health Probes</button></div>
 <div className="metric-grid" role="group" aria-label="Infrastructure status">
  <article className="metric-card"><div><span>Database (Postgres)</span><b>{db.checkedAt?db.live?"Connected":"Unreachable":"Checking…"}</b><small>{db.live?`${db.latencyMs!==null?`${db.latencyMs} ms response · `:""}Supabase PostgreSQL · checked ${checked}`:db.checkedAt?"Connection failed":"Waiting for first probe"}</small></div><i><Database size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Application Env</span><b>{app.environment}</b><small>v{app.version}{app.commit?` · ${app.commit}`:" · commit unknown"}</small></div><i><Cpu size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Storage Bucket</span><b>{storageStatus==="operational"?"Operational":storageStatus==="unavailable"?"Unavailable":"Unknown"}</b><small>Photo bucket probe</small></div><i><HardDrive size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Email Service (Resend)</span><b>{emailLabel}</b><small>Delivery configuration presence</small></div><i><Mail size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Deployment (Vercel)</span><b>Unknown</b><small>{deployProvider} · no deployment feed connected</small></div><i><Globe size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>PayMongo Webhook</span><b>{gatewayLabel}</b><small>{gateway&&gateway.status!=="not_configured"?"/api/webhooks/payments":"Configure PAYMONGO_* to enable"}</small></div><i><CreditCard size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Migrations Applied</span><b>{appliedCount}{localCount!==null?` / ${localCount} Applied`:""}</b><small>{status==="in_sync"?"Deployment in sync":status==="remote_behind"?`${behind} local pending`:"Local files unavailable"}</small></div><i><Layers size={21} aria-hidden="true"/></i></article>
  <article className="metric-card"><div><span>Pending Approvals</span><b>{activity.pendingApprovals??0} Pending</b><small>Awaiting Manager review</small></div><i><CheckSquare size={21} aria-hidden="true"/></i></article>
 </div>
 <div className="admin-report-lower">
  <section className="data-panel" aria-labelledby="sys-automations"><div className="panel-heading"><div><h3 id="sys-automations"><Clock size={17} aria-hidden="true"/>Scheduled Automations</h3><p>Jobs that exist · last run is untracked</p></div></div>{automations.length>0?<div className="table-scroll"><table aria-label="Scheduled automations"><thead><tr><th>Job Name</th><th>Schedule</th><th>Last Execution Status</th></tr></thead><tbody>{automations.map(job=><tr key={job.name}><td><strong>{job.name}</strong></td><td>{job.schedule}</td><td>Unknown</td></tr>)}</tbody></table></div>:<p>No scheduled jobs registered.</p>}</section>
  <section className="data-panel" aria-labelledby="sys-alerts"><div className="panel-heading"><div><h3 id="sys-alerts"><AlertTriangle size={17} aria-hidden="true"/>Live System Alerts</h3><p>Derived from live probes — no sensitive detail</p></div></div>
   {!db.live&&db.checkedAt&&<div role="alert"><p><strong>Database unreachable.</strong> {db.error??"The live database did not respond to the health probe."}</p></div>}
   {status==="remote_behind"&&<div role="alert"><p><strong>Deployment drift.</strong> {behind} local migration{behind===1?" is":"s are"} not applied to the live database — run <code>supabase db push</code> before relying on new features.</p></div>}
   {gateway?.status==="listening_test"&&<div><p><strong>PayMongo gateway mode.</strong> Test mode active — live payments are not accepted.</p></div>}
   {issues.filter(issue=>!issue.startsWith("Database unreachable")&&!issue.includes("not applied")).map(issue=><div key={issue}><p>{issue}</p></div>)}
   {domainStatus==="not_connected"&&<div><p>Public domain: Not connected — health reporting not connected.</p></div>}
   {db.live&&status!=="remote_behind"&&gateway?.status!=="listening_test"&&issues.length===0&&<p>No active alerts. All probes report a steady state.</p>}
  </section>
 </div>
 <div className="data-panel"><div className="insights-tabs" role="tablist" aria-label="System health ledgers" onKeyDown={onTabKeys}>{tabs.map(({key,label:tabLabel,Icon})=><button key={key} ref={(element)=>{tabRefs.current[key]=element}} type="button" role="tab" id={`sys-tab-${key}`} aria-selected={tab===key} aria-controls={`sys-panel-${key}`} tabIndex={tab===key?0:-1} className={tab===key?"active":""} onClick={()=>setTab(key)}><Icon size={14} aria-hidden="true"/>{tabLabel}</button>)}</div>
  <div role="tabpanel" id="sys-panel-migrations" aria-labelledby="sys-tab-migrations" hidden={tab!=="migrations"}><div className="panel-heading"><div><h3>Applied migrations</h3><p>Newest first — the live supabase migration ledger, read server-side</p></div><span className={`badge ${status==="in_sync"?"healthy":status==="remote_behind"?"pending":""}`}>{label(status)}</span></div><HavenSearchInput value={search} onValueChange={setSearch} label="Search migrations" placeholder="Search version or name..."/>{filtered.length===0?<div className="empty"><Search size={21} aria-hidden="true"/><h3>No migrations match this search</h3><p>Try clearing the search to see every applied migration.</p><button className="table-action" onClick={clearSearch}>Clear search</button></div>:<div className="table-scroll"><table aria-label="Applied migrations"><thead><tr><th>Version</th><th>Name</th><th>Status</th></tr></thead><tbody>{page.rows.map(row=><tr key={row.version}><td><strong>{row.version}</strong></td><td>{label(row.name)}</td><td><span className="badge paid">Applied</span></td></tr>)}</tbody></table></div>}<TablePagination {...page} onPageChange={page.setPage} noun={`applied migration${appliedCount!==1?"s":""}`} note={`Last checked ${checked} · auto-refresh every minute`}/></div>
  <div role="tabpanel" id="sys-panel-payment" aria-labelledby="sys-tab-payment" hidden={tab!=="payment"}><PaymentHealthPanel payments={data?.payments}/></div>
  <div role="tabpanel" id="sys-panel-audit" aria-labelledby="sys-tab-audit" hidden={tab!=="audit"}><div className="panel-heading"><div><h3>Audit trail</h3><p>Latest system probes and administrative events · {activity.auditEvents24h??0} in the last 24 hours</p></div></div>{probes.length>0?<div className="table-scroll"><table aria-label="System audit trail"><thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead><tbody>{probes.map(probe=><tr key={`${probe.at}-${probe.action}`}><td>{probe.at?new Date(probe.at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—"}</td><td>{label(probe.action)}</td><td>{label(probe.entity)}</td></tr>)}</tbody></table></div>:<p>No probe history is available yet.</p>}</div>
 </div></>}
