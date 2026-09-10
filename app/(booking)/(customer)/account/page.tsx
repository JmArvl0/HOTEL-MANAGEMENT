import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, BookOpenText, CalendarDays, Compass, QrCode, ReceiptText } from "lucide-react";
import { requireCustomerSession } from "@/lib/customer-auth";
import { calculateFinancialState, calculateNights, formatPeso, hotelDateWithin, hotelToday } from "@/lib/booking";
import { formatStayRange, getCustomerOverview } from "@/lib/customer";
import { roomPrimary } from "@/lib/room-images";
import { StatusBadge } from "@/components/ui";

export default async function CustomerOverviewPage(){
  const session=await requireCustomerSession();const data=await getCustomerOverview(session.user.id);const stay=data.primary;const financial=data.financial;
  const money=stay?calculateFinancialState(financial?.invoice?.amount??stay.total,financial?.invoice?.paid??stay.deposit??0):null;
  const stayPhoto=stay?roomPrimary(undefined,stay.room_type):undefined;
  const paymentStatus=financial?.invoice?.status??stay?.payment_status;
  const activeRequests=data.requests.filter((request)=>request.status!=="completed"&&request.status!=="closed");
  // "Needs your attention" — real actionable states only, derived from data already in the overview.
  const attention:{id:string;label:string;detail:string;href:string}[]=[];
  if(stay&&money&&money.balance>0&&(stay.status==="confirmed"||stay.status==="checked_in")){
    if(paymentStatus==="pending_verification")attention.push({id:"verify",label:"Deposit awaiting verification",detail:"We're reviewing your payment proof — no action needed yet.",href:"/account/payments"});
    else if(paymentStatus!=="paid")attention.push({id:"balance",label:"Remaining balance on your stay",detail:`${formatPeso(money.balance)} left to settle.`,href:"/account/payments"});
  }
  if(activeRequests.length)attention.push({id:"requests",label:`${activeRequests.length} guest request${activeRequests.length!==1?"s":""} in progress`,detail:"Track responses from Front Desk.",href:"/account/requests"});
  if(stay&&stay.status==="confirmed"&&stay.check_in>hotelToday()&&stay.check_in<hotelDateWithin(7))attention.push({id:"arrival",label:"Your check-in is approaching",detail:"Review your arrival details and check-in QR.",href:`/my-reservations/${stay.id}`});
  return <><section className="customer-page-title"><p className="eyebrow">Your Haven</p><h1>Welcome back, {(session.user.name??"Guest").split(" ")[0]}.</h1><p>Everything you need for your next stay, gathered in one calm place.</p></section>
  {stay?<section className="customer-stay-hero">
    {stayPhoto&&<div className="customer-stay-photo"><Image src={stayPhoto} alt={`${stay.room_type} at Haven`} fill sizes="(max-width: 900px) 100vw, 460px" /></div>}
    <div className="customer-stay-copy">
      <div className="customer-stay-badges"><StatusBadge status={stay.status} size="sm" /><span className="customer-stay-kind">{stay.status==="pending"?"Awaiting deposit verification":data.groups.current.length?"Current stay":"Upcoming stay"}</span></div>
      <h2>{stay.room_type}</h2>
      <strong>{formatStayRange(stay.check_in,stay.check_out)}</strong>
      <small>{calculateNights(stay.check_in,stay.check_out)} nights · {stay.guests} guest{stay.guests!==1?"s":""} · {stay.confirmation_number??stay.id}</small>
      <div className="customer-stay-actions"><Link className="btn" href={`/my-reservations/${stay.id}`}>Manage stay <ArrowRight size={15}/></Link>{(stay.status==="confirmed"||stay.status==="checked_in")&&<Link className="customer-stay-qr" href={`/my-reservations/${stay.id}`}><QrCode size={15}/>Check-in QR</Link>}</div>
    </div>
    {money&&<div className="customer-stay-folio"><span>Remaining balance</span><strong>{formatPeso(money.balance)}</strong><small>of {formatPeso(money.total)} stay total</small><Link href="/account/payments">Payment details <ArrowRight size={14}/></Link></div>}
  </section>:<section className="customer-feature-card empty-feature"><div><p>No upcoming stay</p><h2>Let&apos;s plan something memorable.</h2></div><Link className="btn btn-cream" href="/account/find-room">Find a room</Link></section>}
  {attention.length>0&&<section className="customer-attention" aria-label="Needs your attention"><h2>Needs your attention</h2><div>{attention.map((item)=><Link href={item.href} key={item.id}><b>{item.label}</b><span>{item.detail}</span><ArrowRight size={15}/></Link>)}</div></section>}
  <section className="customer-overview-grid"><article className="customer-card"><div className="customer-card-heading"><ReceiptText/><div><p>Remaining balance</p><h2>{money?formatPeso(money.balance):"—"}</h2></div></div>{stay&&money?<><dl><div><dt>Stay total</dt><dd>{formatPeso(money.total)}</dd></div><div><dt>Required deposit</dt><dd>{formatPeso(stay.deposit_required??0)}</dd></div><div><dt>Paid</dt><dd>{formatPeso(money.paid)}</dd></div><div><dt>Payment status</dt><dd><StatusBadge status={paymentStatus} size="sm" /></dd></div></dl><Link href="/account/payments">View payment details <ArrowRight size={14}/></Link></>:<p>No reservation balance to display.</p>}</article>
  <article className="customer-card"><div className="customer-card-heading"><BookOpenText/><div><p>Guest requests</p><h2>{data.requests.length} recent</h2></div></div>{data.requests.length?<ul>{data.requests.map((request)=><li key={request.id}><span>{request.request}</span><StatusBadge status={request.status} size="sm" /></li>)}</ul>:<p>No active or recent requests.</p>}<Link href="/account/requests">View requests <ArrowRight size={14}/></Link></article>
  <article className="customer-card customer-notification-preview"><div className="customer-card-heading"><Bell/><div><p>Notifications</p><h2>Recent updates</h2></div></div>{data.notifications.length?<ul>{data.notifications.slice(0,3).map((item)=><li key={item.id}><Link href={item.href}>{item.title}<small>{item.detail}</small></Link></li>)}</ul>:<p>No updates yet.</p>}<Link href="/account/notifications">View notifications <ArrowRight size={14}/></Link></article></section>
  <section className="customer-quick-actions"><h2>Quick actions</h2><div><Link href="/account/find-room"><Compass/>Find a room</Link><Link href="/my-reservations"><CalendarDays/>My reservations</Link><Link href="/account/requests"><BookOpenText/>Guest requests</Link><Link href="/account/payments"><ReceiptText/>Payments</Link></div></section></>;
}
