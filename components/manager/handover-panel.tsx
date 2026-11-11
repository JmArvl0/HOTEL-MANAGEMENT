"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, ClipboardList, Link2, Plus } from "lucide-react";
import { HavenEmptyState, HavenFilterBadges, HavenSearchInput } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { formatHotelDateTime, HOTEL_TIME_ZONE } from "@/lib/format";
import { canViewGuestContact } from "@/lib/permissions";
import type { Handover } from "@/lib/hotel-operations";
import type { Role } from "@/lib/types";
import { hotelRequest, useHotelResource } from "./hotel-operations-client";

type HandoverList = { items: Handover[] };
type Assignee = { id: string; name: string; role: string };
type References = {
  rooms: {id:string;number:string}[];
  reservations: {id:string;confirmation_number:string|null}[];
  tasks: {id:string;room_number:string|null;task_type:string}[];
  guests: {id:string;name:string}[];
};
type HistoryEntry = { created_at: string; actor: string; text: string; status: string; version: string };
const departments: Record<string,string> = {
  front_desk:"Front Desk", housekeeping:"Housekeeping", maintenance:"Maintenance", accounting:"Accounting", manager:"Manager",
};
const filters = [
  {value:"active",label:"Active"}, {value:"overdue",label:"Overdue"}, {value:"resolved",label:"Resolved"}, {value:"archived",label:"Archived"},
];
const statusLabels = { open:"Open", in_progress:"In progress", resolved:"Resolved" };
const departmentName = (role: string) => departments[role] ?? role.replaceAll("_"," ");
const dueTime = (item: Handover) => item.due_at && Number.isFinite(Date.parse(item.due_at)) ? Date.parse(item.due_at) : Infinity;
const overdue = (item: Handover, now: number) => !item.archived && item.status !== "resolved" && dueTime(item) < now;
const timeFormat = new Intl.DateTimeFormat("en-PH",{hour:"numeric",minute:"2-digit",timeZone:HOTEL_TIME_ZONE});
const dateFormat = new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:HOTEL_TIME_ZONE});
const inputDateTime = new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:HOTEL_TIME_ZONE});
const dayFormat = new Intl.DateTimeFormat("en-CA",{timeZone:HOTEL_TIME_ZONE});
const contactDepartment = (role: string) => role === "front_desk" || role === "manager";

function matches(item: Handover, filter: string, now: number) {
  if (filter === "archived") return item.archived;
  if (filter === "overdue") return overdue(item,now);
  return !item.archived && (filter === "resolved" ? item.status === "resolved" : item.status !== "resolved");
}

function HandoverHistory({id}: {id:string}) {
  const {data,error,loading,refresh} = useHotelResource<HistoryEntry[]>("/api/staff/handover/" + id);
  if (error) return <div role="alert">{error} <button type="button" className="btn btn-soft btn-sm" onClick={()=>void refresh()}>Retry history</button></div>;
  if (loading) return <p role="status">Loading handover history…</p>;
  if (!data?.length) return <p>No recorded activity.</p>;
  return <ol className="hotel-handover-history">{data.map((entry,index)=><li key={entry.created_at+"-"+index}>
    <strong>{entry.actor} · Version {entry.version}</strong><small>{formatHotelDateTime(entry.created_at)} · {entry.status.replaceAll("_"," ")}</small><p>{entry.text}</p>
  </li>)}</ol>;
}

function HandoverEditor({item,role,assignees,references,referenceError,busy,error,onClose,onSave}: {
  item: Handover | null;
  role: Role;
  assignees: Assignee[];
  references: References | null;
  referenceError: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (changes: Record<string,unknown>) => void;
}) {
  const [department,setDepartment] = useState(item?.assigned_role ?? (departments[role] ? role : "front_desk"));
  const [invalid,setInvalid] = useState("");
  const firstField = useRef<HTMLTextAreaElement>(null);
  const due = item && Number.isFinite(dueTime(item)) ? inputDateTime.format(dueTime(item)).replace(" ","T") : "";
  const staff = assignees.filter(person=>person.role===department);
  const refFields = [
    {name:"reservationId",label:"Reservation",options:references?.reservations.map(record=>[record.id,record.confirmation_number||record.id])},
    {name:"roomId",label:"Room",options:references?.rooms.map(record=>[record.id,"Room "+record.number])},
    {name:"taskId",label:"Housekeeping task",options:references?.tasks.map(record=>[record.id,(record.room_number?"Room "+record.room_number+" · ":"")+record.task_type.replaceAll("_"," ")])},
    ...(canViewGuestContact(role) && contactDepartment(department) ? [{name:"guestId",label:"Guest",options:references?.guests.map(record=>[record.id,record.name])}] : []),
  ].filter(field=>field.options?.length);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name:string) => String(form.get(name) ?? "").trim() || undefined;
    const text = field("text");
    if (!text || text.length<3) {
      setInvalid("Enter at least three characters for the note.");
      firstField.current?.focus();
      return;
    }
    setInvalid("");
    const localTime = field("dueAt");
    onSave({text,assignedRole:department,assignedUser:field("assignedUser"),dueAt:localTime ? localTime+":00+08:00" : undefined,
      ...(!item && Object.fromEntries(refFields.map(({name})=>[name,field(name)])))});
  }

  return <Modal isOpen title={item?"Edit handover":"New handover"} description="Record the follow-up and assign it to the responsible department."
    onClose={onClose} initialFocusRef={firstField} closeOnOverlayClick={!busy} closeOnEscape={!busy} showCloseButton={!busy}>
    <form className="hotel-ops hotel-handover-editor" onSubmit={submit}>
      <label>Handover note<textarea ref={firstField} name="text" defaultValue={item?.text} required minLength={3} maxLength={2000} rows={4}
        placeholder="Start with the follow-up, then add any details." /></label>
      <div className="hotel-ops-fields">
        <label>Responsible department<select value={department} onChange={event=>setDepartment(event.target.value)}>
          {Object.entries(departments).filter(([value])=>!item?.guest_id||contactDepartment(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Responsible person<select name="assignedUser" key={department} defaultValue={department===item?.assigned_role ? item.assigned_user??"" : ""}>
          <option value="">Department queue</option>
          {department===item?.assigned_role && item.assigned_user && !staff.some(person=>person.id===item.assigned_user) && <option value={item.assigned_user}>Current assignee</option>}
          {staff.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        <label>Due time (PHT)<input type="datetime-local" name="dueAt" defaultValue={due}/></label>
      </div>
      {!item && refFields.length>0 && <details><summary>Link a hotel record</summary><div className="hotel-ops-fields">
        {refFields.map(field=><label key={field.name}>{field.label}<select name={field.name}><option value="">None</option>
          {field.options?.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>)}
      </div></details>}
      {!item && referenceError && <p role="alert">{referenceError}</p>}
      {(invalid||error)&&<p role="alert">{invalid||error}</p>}
      <div className="btn-row">
        <button type="button" className="btn btn-soft" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" disabled={busy}>{busy?"Saving…":item?"Save handover":"Add handover"}</button>
      </div>
    </form>
  </Modal>;
}

export default function HandoverPanel({role,current,now,onReservation,onTasks,onRoom,onGuest}: {
  role: Role;
  current: ReturnType<typeof useHotelResource<HandoverList>>;
  now: number;
  onReservation?: (id:string)=>void;
  onTasks?: ()=>void;
  onRoom?: (id:string)=>void;
  onGuest?: (id:string)=>void;
}) {
  const [filter,setFilter] = useState("active");
  const [department,setDepartment] = useState("");
  const [search,setSearch] = useState("");
  const [expandedId,setExpandedId] = useState("");
  const [historyId,setHistoryId] = useState("");
  const [editor,setEditor] = useState<{item:Handover|null}|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const archived = useHotelResource<HandoverList>("/api/staff/handover?archived=true");
  const {refresh:refreshArchive} = archived;
  useEffect(()=>{
    if(filter!=="archived")return;
    const timer=window.setInterval(()=>void refreshArchive(),30000);
    return()=>window.clearInterval(timer);
  },[filter,refreshArchive]);
  const {data:assignees} = useHotelResource<Assignee[]>("/api/staff/handover/assignees");
  const {data:references,error:referenceError} = useHotelResource<References>("/api/staff/handover/references");
  const dialogs = useActionDialogs();
  const retry = useRef<{signature:string;key:string}|null>(null);
  const saving = useRef(false);
  const resource = filter === "archived" ? archived : current;
  const assigneeById = new Map(assignees?.map(person=>[person.id,person.name]));
  const roomById = new Map(references?.rooms.map(room=>[room.id,"Room "+room.number]));
  const bookingById = new Map(references?.reservations.map(booking=>[booking.id,booking.confirmation_number||""]));
  const canLinkGuest = canViewGuestContact(role);
  const term = search.trim().toLowerCase();
  const matchesSearch = (item:Handover) => (!department||department===item.assigned_role) && (!term||[
    item.text,departmentName(item.assigned_role),assigneeById.get(item.assigned_user??""),roomById.get(item.room_id??""),bookingById.get(item.reservation_id??""),
  ].some(value=>value?.toLowerCase().includes(term)));
  const currentScope = current.data?.items.filter(matchesSearch);
  const archivedScope = archived.data?.items.filter(matchesSearch);
  const visible = ((filter==="archived"?archivedScope:currentScope)??[]).filter(item=>matches(item,filter,now)).sort((a,b)=>dueTime(a)-dueTime(b));
  const groups = new Map<string,Handover[]>();
  for (const item of visible) {
    const group=groups.get(item.assigned_role);
    if(group)group.push(item);
    else groups.set(item.assigned_role,[item]);
  }

  function changeFilter(value:string) {
    setFilter(value);
    setExpandedId("");
    setHistoryId("");
    setError("");
    setNotice("");
  }
  function toggleNote(item:Handover) {
    setExpandedId(expandedId===item.id?"":item.id);
    setHistoryId("");
    setError("");
    setNotice("");
  }
  function openEditor(item:Handover|null) {
    setError("");
    setNotice("");
    setEditor({item});
  }
  async function write(item:Handover|null,changes:Record<string,unknown>,message:string) {
    if(saving.current || (item?.guest_id&&!canLinkGuest))return;
    saving.current=true;
    setBusy(true);
    setError("");
    setNotice("");
    const body={
      text:item?.text,assignedRole:item?.assigned_role,assignedUser:item?.assigned_user??undefined,dueAt:item?.due_at??undefined,
      reservationId:item?.reservation_id??undefined,roomId:item?.room_id??undefined,guestId:item?.guest_id??undefined,taskId:item?.task_id??undefined,
      status:item?.status??"open",archived:item?.archived??false,expectedVersion:item?.version??0,...changes,
    };
    const signature=JSON.stringify([item?.id,body]);
    if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
    try {
      const saved=await hotelRequest<Handover>("/api/staff/handover"+(item?"/"+item.id:""),{...body,idempotencyKey:retry.current.key},item?"PATCH":"POST");
      retry.current=null;
      setEditor(null);
      if(!matches(saved,filter,now))setFilter(saved.archived?"archived":saved.status==="resolved"?"resolved":"active");
      if(!matchesSearch(saved)){setDepartment("");setSearch("");}
      setExpandedId(saved.id);
      setNotice(message);
      await Promise.all([current.refresh(),archived.refresh()]);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Unable to save the handover.");
    } finally {
      saving.current=false;
      setBusy(false);
    }
  }
  async function archiveNote(item:Handover) {
    const confirmed=await dialogs.askConfirm({title:"Archive handover",message:"Move this note to Archived. Its activity history stays available.",confirmText:"Archive note"});
    if(confirmed)await write(item,{archived:true},"Handover archived.");
  }

  return <section className="hotel-handover" aria-labelledby="department-handover-title">
    <header className="hotel-brief-section-heading">
      <div><h2 id="department-handover-title">Department handover</h2><p>Shift follow-ups by responsible department. Due times are in Manila time.</p></div>
      <button type="button" className="btn btn-accent" disabled={busy} onClick={()=>openEditor(null)}><Plus size={16} aria-hidden="true"/> New handover</button>
    </header>
    <div className="hotel-handover-toolbar">
      <HavenFilterBadges label="Handover status" value={filter} allValue="" onChange={changeFilter} options={filters.map(option=>({
        ...option,count:(option.value==="archived"?archivedScope:currentScope)?.filter(item=>matches(item,option.value,now)).length,
      }))}/>
      <div className="hotel-handover-search">
        <HavenSearchInput value={search} onValueChange={setSearch} label="Search handovers" placeholder="Note, room or assignee"/>
        <HavenSelect value={department} onChange={setDepartment} ariaLabel="Filter by department" options={[{value:"",label:"All departments"},...Object.entries(departments).map(([value,label])=>({value,label}))]}/>
      </div>
    </div>
    {notice&&<p className="hotel-handover-feedback" role="status">{notice}</p>}
    {((error&&!editor)||resource.error)&&<p className="hotel-handover-feedback" role="alert">{error&&!editor?error:resource.error}</p>}
    <div className="hotel-handover-columns" aria-hidden="true"><span>Department</span><div><span>Follow-up</span><span>Due (PHT)</span><span>Status</span></div></div>
    {resource.loading&&!resource.data ? <p className="hotel-handover-feedback" role="status">Loading handovers…</p> : visible.length ?
      Array.from(groups,([key,items])=><section className="hotel-handover-lane" key={key} aria-label={departmentName(key)}>
        <header><h3>{departmentName(key)}</h3><small>{items.length} {items.length===1?"follow-up":"follow-ups"}</small></header>
        <ul>{items.map(item=>{
          const expanded = expandedId===item.id;
          const [title,...description] = item.text.trim().split(/\r?\n/);
          const hasDue = Number.isFinite(dueTime(item));
          const late = overdue(item,now);
          const assignee = item.assigned_user ? assigneeById.get(item.assigned_user) || "Assigned staff member" : "Department queue";
          const room = roomById.get(item.room_id??"");
          const booking = bookingById.get(item.reservation_id??"");
          const guest = canLinkGuest ? references?.guests.find(record=>record.id===item.guest_id)?.name : undefined;
          const task = references?.tasks.find(record=>record.id===item.task_id);
          const links = [
            {key:"room",label:room||"View room",run:item.room_id&&onRoom?()=>onRoom(item.room_id!):undefined,text:room},
            {key:"booking",label:booking||"View reservation",run:item.reservation_id&&onReservation?()=>onReservation(item.reservation_id!):undefined,text:booking},
            {key:"guest",label:guest||"View guest",run:canLinkGuest&&item.guest_id&&onGuest?()=>onGuest(item.guest_id!):undefined,text:guest},
            {key:"task",label:"Housekeeping task",run:item.task_id&&onTasks?onTasks:undefined,text:task?task.task_type.replaceAll("_"," "):undefined},
          ].filter(link=>link.run||link.text);
          const canAct = !item.guest_id||canLinkGuest;
          return <li key={item.id}>
            <button type="button" className="hotel-handover-row" aria-expanded={expanded} aria-controls={"handover-"+item.id} onClick={()=>toggleNote(item)}>
              <span className="hotel-handover-summary"><strong>{title||"Handover note"}</strong><small>{[assignee,room||booking].filter(Boolean).join(" · ")}</small></span>
              <span className="hotel-handover-due"><strong>{hasDue?timeFormat.format(dueTime(item)):"No due time"}</strong>
                {hasDue&&<small className={late?"hotel-overdue":undefined}>{late?"Overdue":dayFormat.format(dueTime(item))===dayFormat.format(now)?"Today":dateFormat.format(dueTime(item))}</small>}</span>
              <StatusBadge status={item.archived?"archived":item.status==="open"?"pending":item.status} label={item.archived?"Archived":statusLabels[item.status]} size="sm" showIcon={false}/>
              <ChevronRight size={16} aria-hidden="true"/>
            </button>
            <div className="hotel-handover-detail" id={"handover-"+item.id} hidden={!expanded}>{expanded&&<>
              <div><h4>Handover note</h4><p>{description.join("\n").trim()||item.text}</p></div>
              <dl><div><dt>Responsible person</dt><dd>{assignee}</dd></div><div><dt>Due time</dt><dd>{hasDue?formatHotelDateTime(item.due_at)+" PHT":"No due time"}</dd></div></dl>
              {links.length>0&&<div className="hotel-handover-wide"><h4>Linked records</h4><div className="btn-row">{links.map(link=>link.run?
                <button type="button" className="btn btn-soft btn-sm" key={link.key} onClick={link.run}><Link2 size={14} aria-hidden="true"/>{link.label}</button>:<span key={link.key}>{link.text}</span>)}</div></div>}
              <div className="hotel-handover-wide hotel-handover-activity">
                <button type="button" className="btn btn-soft btn-sm" aria-expanded={historyId===item.id} onClick={()=>setHistoryId(historyId===item.id?"":item.id)}>Activity history</button>
                {historyId===item.id&&<HandoverHistory id={item.id} key={item.id+":"+item.version}/>}
              </div>
              {canAct&&<div className="hotel-handover-wide hotel-handover-actions btn-row">
                {item.archived?<button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={()=>void write(item,{archived:false},"Handover restored.")}>Restore</button>:<>
                  <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={()=>openEditor(item)}>Edit note</button>
                  <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={()=>void archiveNote(item)}>Archive</button>
                  {item.status==="open"&&<button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={()=>void write(item,{status:"in_progress"},"Handover in progress.")}>Take forward</button>}
                  {item.status==="resolved"?<button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={()=>void write(item,{status:"open"},"Handover reopened.")}>Reopen</button>:
                    <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={()=>void write(item,{status:"resolved"},"Handover resolved.")}>Resolve</button>}
                </>}
              </div>}
            </>}</div>
          </li>;
        })}</ul>
      </section>) : !resource.error&&<HavenEmptyState icon={<ClipboardList size={22} aria-hidden="true"/>} title="No handovers in this view" body="Choose another status or clear the search and department filters."/>}
    <footer className="hotel-handover-footer">
      <span aria-live="polite">{resource.data&&<>{visible.length} {visible.length===1?"note":"notes"} across {groups.size} {groups.size===1?"department":"departments"}</>}</span>
      <div className="btn-row">
        {(search||department||filter!=="active")&&<button type="button" className="btn btn-soft btn-sm" onClick={()=>{changeFilter("active");setSearch("");setDepartment("");}}>Clear filters</button>}
        <button type="button" className="btn btn-soft btn-sm" disabled={resource.loading||busy} onClick={()=>void resource.refresh()}>{resource.error?"Retry handover":"Refresh handover"}</button>
      </div>
    </footer>
    {editor&&<HandoverEditor item={editor.item} role={role} assignees={assignees??[]} references={references} referenceError={referenceError}
      busy={busy} error={error} onClose={()=>{if(!busy){setEditor(null);setError("");}}}
      onSave={changes=>void write(editor.item,changes,editor.item?"Handover updated.":"Handover added.")}/>}
    {dialogs.view}
  </section>;
}
