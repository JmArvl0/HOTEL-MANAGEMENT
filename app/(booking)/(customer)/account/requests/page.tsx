import{BookOpenText,ChevronDown}from"lucide-react";import{requireCustomerSession}from"@/lib/customer-auth";import{getGuestReservations}from"@/lib/booking";import{friendlyStatus,getCustomerRequests}from"@/lib/customer";import{portalCatalogOptions}from"@/lib/request-catalog";import{GuestRequestForm}from"@/components/customer/guest-request-form";import{StatusBadge}from"@/components/ui";import{requestLabel}from"@/lib/request-options";import{groupRequestBatches,requestCode}from"@/lib/request-batches";
// One submission = one collapsible card. Items share a batch_id (portal
// submissions file the client idempotency key; one checkout files
// md5(reservation||'|checkout')) — grouping never falls back to guest,
// reservation, or timestamp, so two submissions made at the same instant stay
// two cards. The request number is derived from the batch id, not stored.
const APPROVAL_LABELS={pending:"Pending review",approved:"Approved",rejected:"Declined"}as const;
const when=(value:string)=>new Date(value).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
export default async function RequestsPage(){const session=await requireCustomerSession();const[requests,reservations,options]=await Promise.all([getCustomerRequests(session.user.id),getGuestReservations(session.user.id),portalCatalogOptions()]);const eligible=reservations.filter((item)=>["confirmed","checked_in"].includes(String(item.status))).map((item)=>({id:item.id,confirmation_number:item.confirmation_number,room_type:item.room_type}));
 const batches=groupRequestBatches(requests);
 return <div className="customer-requests-page"><section className="customer-page-title"><div><p className="eyebrow">Guest requests</p><h1>How can we help?</h1><p>Tell us what you need; Front Desk reviews every submission and Haven routes it to the right team.</p></div></section><GuestRequestForm reservations={eligible} options={options}/>
 {!batches.length?<div className="customer-empty"><BookOpenText/><h2>No requests yet</h2><p>Your service request history will appear here.</p></div>:<div className="cgr-batches">{batches.map((batch)=>{const reservation=reservations.find((entry)=>entry.id===batch.items[0].reservation_id);const stay=reservation?new Intl.DateTimeFormat("en-PH",{month:"short",day:"numeric"}).formatRange(new Date(reservation.check_in),new Date(reservation.check_out)):null;const room=reservation?(reservation.room_number?`Room ${reservation.room_number} · ${reservation.room_type}`:reservation.room_type):batch.items[0].reservation_id;return (
  <details key={batch.key} className="cgr-batch">
   <summary className="cgr-batch-header">
    <span className="cgr-batch-heading">
     <h2>{room} · Request #{requestCode(batch)}</h2>
     <small>{reservation?.confirmation_number&&`${reservation.confirmation_number} · `}{stay&&`stay ${stay} · `}<span className="cgr-batch-submitted">Submitted {when(batch.items[0].created_at)}</span></small>
    </span>
    <span className="cgr-batch-meta">
     <span className="cgr-batch-count">{batch.items.length===1?"1 requested item":`${batch.items.length} requested items`}</span>
     <span className={`customer-status ${batch.approval}`}>{APPROVAL_LABELS[batch.approval]}</span>
     <ChevronDown className="cgr-batch-chevron" size={16} aria-hidden="true"/>
    </span>
   </summary>
   <ul className="cgr-batch-items">{batch.items.map((item)=>{const label=item.request_type?requestLabel(item.request_type):item.request;const note=item.request_type&&item.request!==label?(item.request.startsWith(`${label}: `)?item.request.slice(label.length+2):item.request):null;return (
    <li key={item.id}>
     <div><b>{label}</b><small>{item.department.replaceAll("_"," ")} · {friendlyStatus(item.status)}</small>
      {note&&<small className="cgr-item-note">“{note}”</small>}
      {item.approval_status==="rejected"&&item.approval_note&&<small className="cgr-approval-note">Front Desk: {item.approval_note}</small>}
      {item.approved_at&&item.approval_status==="approved"&&<small className="cgr-item-updated">Updated {when(item.approved_at)}</small>}
     </div>
     <StatusBadge status={item.status} size="sm"/>
    </li>);})}</ul>
  </details>);})}</div>}</div>}
