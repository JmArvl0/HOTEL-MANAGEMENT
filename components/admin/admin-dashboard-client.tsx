"use client";
import{useCallback,useEffect,useState}from"react";import{signOut}from"next-auth/react";import{Activity,Building2,CarTaxiFront,ChevronDown,ClipboardCheck,FileText,KeyRound,LogOut,Settings,ShieldCheck,Sparkles,Users}from"lucide-react";import{ThemeToggle}from"@/components/theme-toggle";import type{RecordItem,Role}from"@/lib/types";
import { Modal, ConfirmDialog, PromptDialog, SelectDialog } from "@/components/ui/Modal";
import { FormDialog, FormField, MultiStepFormDialog } from "@/components/ui/FormDialog";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-services-panel";
type Section="overview"|"users"|"roles"|"rooms"|"room_types"|"transport_services"|"policy"|"audit"|"security"|"reports";type User={id:string;name?:string|null;email?:string|null;role:Role};type Overview={metrics:Record<string,number>;roleCounts:Record<string,number>;recentAudit:RecordItem[]};
const nav:[Section,string,React.ElementType][]=[["overview","Overview",Activity],["users","Users & Staff",Users],["roles","Roles & Permissions",ShieldCheck],["rooms","Room Configuration",Building2],["room_types","Room Types",Building2],["transport_services","Transport Services",CarTaxiFront],["policy","Hotel Policies",Settings],["audit","Audit Logs",FileText],["security","Security",KeyRound],["reports","Admin Reports",ClipboardCheck]];
const label=(value:unknown)=>String(value??"—").replaceAll("_"," ");const money=(value:unknown)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value||0));
export default function AdminDashboardClient({user}:{user:User}){const[section,setSection]=useState<Section>("overview"),[data,setData]=useState<unknown>(null),[loading,setLoading]=useState(true),[toast,setToast]=useState(""),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("haven-admin-sidebar-collapsed")==="true"),[menu,setMenu]=useState(false);

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "default" | "danger" | "warning";
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    label?: string;
    placeholder?: string;
    defaultValue?: string;
    inputType?: "text" | "number" | "email" | "tel" | "password" | "date";
    required?: boolean;
    onSubmit: (value: string) => void;
    validation?: (value: string) => string | null;
    submitText?: string;
    cancelText?: string;
  } | null>(null);

  const [formDialog, setFormDialog] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    fields: FormField[];
    onSubmit: (data: Record<string, string | number | boolean>) => void;
    submitText?: string;
    cancelText?: string;
  } | null>(null);

  const notify=(message:string)=>{setToast(message);setTimeout(()=>setToast(""),3500)};

  // Dialog helpers
  const openConfirm = (title: string, message: string, onConfirm: () => void, variant: "default" | "danger" | "warning" = "default", confirmText = "Confirm", cancelText = "Cancel") => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm, variant, confirmText, cancelText });
  };

  const openPrompt = (title: string, message: string | undefined, label: string | undefined, placeholder: string | undefined, defaultValue: string | undefined, onSubmit: (value: string) => void, options?: {
    inputType?: "text" | "number" | "email" | "tel" | "password" | "date";
    required?: boolean;
    validation?: (value: string) => string | null;
    submitText?: string;
    cancelText?: string;
  }) => {
    setPromptDialog({
      isOpen: true,
      title,
      message,
      label,
      placeholder,
      defaultValue,
      inputType: options?.inputType,
      required: options?.required,
      onSubmit,
      validation: options?.validation,
      submitText: options?.submitText,
      cancelText: options?.cancelText,
    });
  };

  const openForm = (title: string, description: string | undefined, fields: FormField[], onSubmit: (data: Record<string, string | number | boolean>) => void, submitText = "Submit", cancelText = "Cancel") => {
    setFormDialog({ isOpen: true, title, description, fields, onSubmit, submitText, cancelText });
  };

  const load=useCallback(async()=>{if(section==="room_types"||section==="transport_services"){setLoading(false);return}setLoading(true);const response=await fetch(`/api/admin/data?section=${section}`,{cache:"no-store"}),body=await response.json();if(response.ok)setData(body.data);else notify(body.error??"Unable to load administrative data.");setLoading(false)},[section]);useEffect(()=>{const timer=setTimeout(load,0);return()=>clearTimeout(timer)},[load]);
 async function post(url:string,payload:Record<string,unknown>){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok){notify(body.error??"Administrative action failed.");return null}await load();return body}
 async function patch(url:string,payload:Record<string,unknown>){const response=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok){notify(body.error??"Configuration update failed.");return null}await load();return body}
 async function createStaff(){const name=prompt("Staff name:"),email=prompt("Staff email:"),role=prompt("Role: manager, front_desk, housekeeping, maintenance, or accounting","front_desk"),department=prompt("Department:",label(role)),employeeReference=prompt("Employee reference (optional):")??"",reason=prompt("Creation reason:");if(!name||!email||!role||!reason)return;const body=await post("/api/admin/users",{name,email,role,department,employeeReference,reason,idempotencyKey:crypto.randomUUID()});if(body)notify(`Staff account created inactive. Initiate recovery for ${email} to set a password.`)}
 async function userAction(item:RecordItem,action:"status"|"role"|"metadata"|"recovery"){const reason=prompt(`${label(action)} reason:`);if(!reason)return;let payload:Record<string,unknown>={action,reason,version:item.auth_version};if(action==="status"){const status=prompt("Status: active, inactive, or suspended",String(item.account_status));if(!status)return;payload.status=status}if(action==="role"){const role=prompt("Role: manager, front_desk, housekeeping, maintenance, or accounting",String(item.role));if(!role)return;payload.role=role}if(action==="metadata"){const name=prompt("Name:",String(item.name)),phone=prompt("Phone:",String(item.phone??"")),department=prompt("Department:",String(item.department??"")),employeeReference=prompt("Employee reference:",String(item.employee_reference??""));if(!name)return;payload={...payload,name,phone,department,employeeReference}}const body=await post(`/api/admin/users/${item.id}/action`,payload);if(body&&action==="recovery"){await navigator.clipboard.writeText(body.data.recoveryUrl);notify(`Recovery link copied. It expires at ${new Date(body.data.expiresAt).toLocaleString()}.`)}}
 async function editRoom(item:RecordItem){const floor=prompt("Floor:",String(item.floor)),type=prompt("Room type:",String(item.type)),wing=prompt("Wing:",String(item.wing??"")),designation=prompt("Administrative designation:",String(item.administrative_designation??""));if(floor===null||!type)return;const active=confirm(item.administratively_active?"Keep this room administratively active? Choose Cancel to deactivate.":"Activate this room? Choose Cancel to keep inactive."),reason=prompt("Configuration reason:");if(!reason)return;const body=await patch(`/api/admin/rooms/${item.id}`,{floor:Number(floor),type,wing,designation,active,reason,version:item.configuration_version});if(body)notify("Room metadata updated without changing occupancy, Housekeeping, or Maintenance state.")}
 async function editPolicy(item:RecordItem){const hotelTimezone=prompt("Hotel timezone (Owner-only to change):",String(item.hotel_timezone)),checkInTime=prompt("Check-in time:",String(item.check_in_time).slice(0,5)),checkOutTime=prompt("Checkout time:",String(item.check_out_time).slice(0,5)),noShowCutoffTime=prompt("No-show cutoff:",String(item.no_show_cutoff_time).slice(0,5)),minimumBookingAge=prompt("Minimum booking age:",String(item.minimum_booking_age)),full=prompt("Full-refund days:",String(item.cancellation_full_refund_days)),partial=prompt("Partial-refund days:",String(item.cancellation_partial_refund_days)),percent=prompt("Partial refund percent:",String(Number(item.cancellation_partial_refund_basis_points)/100)),modification=prompt("Self-service modification days:",String(item.self_service_modification_days)),reason=prompt("Policy change reason:");if(!hotelTimezone||!checkInTime||!checkOutTime||!noShowCutoffTime||!minimumBookingAge||!full||!partial||!percent||!modification||!reason)return;const body=await patch("/api/admin/policy",{hotelTimezone,checkInTime,checkOutTime,noShowCutoffTime,validIdRequired:Boolean(item.valid_id_required),minimumBookingAge:Number(minimumBookingAge),cancellationFullRefundDays:Number(full),cancellationPartialRefundDays:Number(partial),cancellationPartialRefundBasisPoints:Math.round(Number(percent)*100),selfServiceModificationDays:Number(modification),earlyCheckInAllowed:Boolean(item.early_check_in_allowed),housekeepingInspectionRequired:Boolean(item.housekeeping_inspection_required),reason,version:item.version});if(body)notify("Policy updated for future transactions; existing reservation snapshots were unchanged.")}
 const rows=Array.isArray(data)?data as RecordItem[]:[];return <div className={`app-shell${collapsed?" sidebar-collapsed":""}`}><aside className={`sidebar${menu?" open":""}${collapsed?" collapsed":""}`}><div className="sidebar-top"><button className="brand sidebar-brand-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMenu(false)}else{const next=!collapsed;setCollapsed(next);localStorage.setItem("haven-admin-sidebar-collapsed",String(next))}}} aria-label="Toggle navigation"><span className="brand-mark"><Sparkles size={17}/></span><span className="brand-copy">HAVEN<small>ADMIN GOVERNANCE</small></span></button></div><div className="property-pill"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>System administration</small></div><ChevronDown size={15}/></div><p className="nav-caption">Governance</p><nav>{nav.map(([key,text,Icon])=><button key={key} className={section===key?"active":""} onClick={()=>{setSection(key);setMenu(false)}}><Icon size={18}/><span className="nav-label">{text}</span></button>)}</nav><div className="sidebar-bottom"><button onClick={()=>signOut({callbackUrl:"/"})}><LogOut size={18}/><span className="nav-label">Sign out</span></button><div className="profile"><span>{(user.name??"A").slice(0,2).toUpperCase()}</span><div className="profile-copy"><b>{user.name}</b><small>{label(user.role)}</small></div></div></div></aside><main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={()=>setMenu(true)}><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find(x=>x[0]===section)?.[1]}</p><small>Provisional Admin Governance Baseline</small></div><div className="header-actions"><span className="mode-pill">Supabase live</span><ThemeToggle/></div></header><div className="workspace-body">{loading?<div className="empty"><Activity/><h3>Loading governance data…</h3></div>:section==="overview"?<Overview data={data as Overview} setSection={setSection}/>:section==="users"?<UsersView rows={rows} create={createStaff} action={userAction}/>:section==="rooms"?<TableView title="Physical room metadata" subtitle="Administrative configuration only—operational room state is read-only." rows={rows} columns={["number","floor","type","wing","administrative_designation","administratively_active","status","housekeeping"]} action={editRoom}/>:section==="room_types"?<RoomCatalogPanel/>:section==="transport_services"?<TransportServicesPanel/>:section==="policy"?<PolicyView item={data as RecordItem} edit={editPolicy}/>:section==="roles"?<RolesView data={data as Record<string,string[]>}/>:section==="audit"||section==="security"?<TableView title={section==="audit"?"Administrative audit":"Security and account events"} subtitle="Immutable administrative history; secrets and password hashes are never returned." rows={rows} columns={["created_at","action","entity_type","entity_id"]}/>:<Reports data={data as Overview}/>}</div></main>{toast&&<div className="toast"><ShieldCheck size={18}/>{toast}</div>}</div>}
function Overview({data,setSection}:{data:Overview;setSection:(s:Section)=>void}){const m=data.metrics??{};return <><div className="page-title"><div><p className="eyebrow">System governance</p><h1>Is Haven configured and secure?</h1><p>Account health, configuration warnings, and recent administrative events from live records.</p></div><button className="btn btn-accent" onClick={()=>setSection("users")}>Manage users</button></div><div className="metric-grid">{[["Active users",m.activeUsers],["Inactive users",m.inactiveUsers],["Staff accounts",m.staffAccounts],["Guest accounts",m.guestAccounts],["Needs attention",m.attention],["Room types",m.roomTypes],["Inactive rooms",m.inactiveRooms],["Active recovery links",m.activeRecoveryTokens]].map(([name,value])=><article className="metric-card" key={name}><div><span>{name}</span><b>{value}</b><small>Live administrative record</small></div><i><ShieldCheck size={21}/></i></article>)}</div><div className="data-panel"><div className="panel-heading"><div><h3>Recent administrative changes</h3><p>Immutable audit history</p></div></div><AuditRows rows={data.recentAudit??[]}/></div></>}
function UsersView({rows,create,action}:{rows:RecordItem[];create:()=>void;action:(x:RecordItem,a:"status"|"role"|"metadata"|"recovery")=>void}){return <><div className="page-title"><div><p className="eyebrow">Account governance</p><h1>Users and staff accounts</h1><p>Lifecycle, role, metadata, and secure recovery. Business history is never deleted.</p></div><button className="btn btn-accent" onClick={create}>Create staff account</button></div><div className="data-panel"><div className="table-scroll"><table><thead><tr>{["Name","Email","Role","Department","Status","Recovery","Version","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{label(item.role)}</td><td>{label(item.department)}</td><td><span className={`badge ${item.account_status}`}>{label(item.account_status)}</span></td><td>{item.recovery_required?"Required":"No"}</td><td>{item.auth_version}</td><td><div className="reservation-actions"><button className="table-action" onClick={()=>action(item,"metadata")}>Edit</button><button className="table-action" onClick={()=>action(item,"role")}>Role</button><button className="table-action" onClick={()=>action(item,"status")}>Lifecycle</button><button className="table-action" onClick={()=>action(item,"recovery")}>Recovery</button></div></td></tr>)}</tbody></table></div></div></>}
function TableView({title,subtitle,rows,columns,action}:{title:string;subtitle:string;rows:RecordItem[];columns:string[];action?:(x:RecordItem)=>void}){return <><div className="page-title"><div><p className="eyebrow">Hotel configuration</p><h1>{title}</h1><p>{subtitle}</p></div></div><div className="data-panel"><div className="table-scroll"><table><thead><tr>{columns.map(x=><th key={x}>{label(x)}</th>)}{action&&<th>Actions</th>}</tr></thead><tbody>{rows.map(item=><tr key={item.id}>{columns.map(x=><td key={x}>{x==="base_rate"?money(item[x]):typeof item[x]==="boolean"?(item[x]?"Yes":"No"):label(item[x])}</td>)}{action&&<td><button className="table-action" onClick={()=>action(item)}>Configure</button></td>}</tr>)}</tbody></table></div></div></>}
function PolicyView({item,edit}:{item:RecordItem;edit:(x:RecordItem)=>void}){return <><div className="page-title"><div><p className="eyebrow">Future operations</p><h1>Operational policy</h1><p>Updates affect future transactions. Existing reservation snapshots remain unchanged.</p></div><button className="btn btn-accent" onClick={()=>edit(item)}>Update policy</button></div><div className="data-panel"><div className="admin-policy-grid">{Object.entries(item??{}).filter(([key])=>!["key","updated_at"].includes(key)).map(([key,value])=><div key={key}><span>{label(key)}</span><strong>{label(value)}</strong></div>)}</div></div></>}
function RolesView({data}:{data:Record<string,string[]>}){return <><div className="page-title"><div><p className="eyebrow">Controlled catalogue</p><h1>Roles and permissions</h1><p>HAVEN uses one fixed role per account. Admin assigns permitted roles but cannot invent permissions or grant Owner authority.</p></div></div><div className="dashboard-grid">{Object.entries(data??{}).map(([role,values])=><article className="panel" key={role}><h3>{label(role)}</h3>{values.map(value=><p key={value}>{value}</p>)}</article>)}</div></>}
function AuditRows({rows}:{rows:RecordItem[]}){return <div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{new Date(String(item.created_at)).toLocaleString()}</td><td>{label(item.action)}</td><td>{label(item.entity_type)}</td><td>{label(item.entity_id)}</td></tr>)}</tbody></table></div>}
function Reports({data}:{data:Overview}){return <><div className="page-title"><div><p className="eyebrow">Administrative reporting</p><h1>Account and configuration summary</h1><p>Governance reporting only—operational and financial execution remain in their departments.</p></div></div><div className="dashboard-grid">{Object.entries(data.roleCounts??{}).map(([role,count])=><article className="metric-card" key={role}><div><span>{label(role)}</span><b>{count}</b><small>Accounts</small></div></article>)}</div></>}
