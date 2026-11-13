import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, BookOpenText, CalendarDays, Compass, QrCode, ReceiptText, Users } from "lucide-react";
import { requireCustomerSession } from "@/lib/customer-auth";
import { calculateFinancialState, calculateNights, hotelDateWithin, hotelToday } from "@/lib/booking";
import { formatStayRange, getCustomerOverview } from "@/lib/customer";
import { roomPrimary } from "@/lib/room-images";
import { StatusBadge } from "@/components/ui";
import { DashboardHeading, DashboardMetrics, DashboardOverview, DashboardPanel } from "@/components/ui/dashboard-overview";
import { DashboardFinances } from "@/components/ui/dashboard-finances";

export default async function CustomerOverviewPage() {
  const session = await requireCustomerSession();
  const data = await getCustomerOverview(session.user.id);
  const stay = data.primary;
  const money = stay ? calculateFinancialState(data.financial?.invoice?.amount ?? stay.total, data.financial?.invoice?.paid ?? stay.deposit ?? 0) : null;
  const stayPhoto = stay ? roomPrimary(undefined, stay.room_type) : undefined;
  const stayHref = stay ? `/my-reservations/${stay.id}` : "/account/find-room";
  const paymentStatus = data.financial?.invoice?.status ?? stay?.payment_status;
  const activeRequests = data.requests.filter(request => request.status !== "completed" && request.status !== "closed");
  const attention: { id: string; label: string; detail: string; href: string }[] = [];
  if (stay && money && money.balance > 0 && (stay.status === "confirmed" || stay.status === "checked_in")) {
    if (paymentStatus === "pending_verification") attention.push({ id: "verify", label: "Deposit awaiting verification", detail: "Your payment proof is being reviewed.", href: "/account/payments" });
    else if (paymentStatus !== "paid") attention.push({ id: "balance", label: "Remaining balance on your stay", detail: "Open payment details to review your balance.", href: "/account/payments" });
  }
  if (activeRequests.length) attention.push({ id: "requests", label: `${activeRequests.length} guest request${activeRequests.length === 1 ? "" : "s"} in progress`, detail: "Track responses from Front Desk.", href: "/account/requests" });
  if (stay?.status === "confirmed" && stay.check_in > hotelToday() && stay.check_in < hotelDateWithin(7)) {
    attention.push({ id: "arrival", label: "Your check-in is approaching", detail: "Review your arrival details and check-in QR.", href: stayHref });
  }

  return <DashboardOverview className="guest-overview">
    <DashboardHeading title={`Welcome back, ${(session.user.name ?? "Guest").split(" ")[0]}.`} actions={
      <Link className="btn btn-accent" href={stayHref}><span>{stay ? "Manage stay" : "Find a room"}</span><ArrowRight size={16} aria-hidden="true" /></Link>
    } />
    <DashboardMetrics items={[
      { label: "Stay length", value: stay ? calculateNights(stay.check_in, stay.check_out) : "—", hint: stay ? "Nights booked" : "No upcoming stay", icon: CalendarDays, href: stayHref },
      { label: "Guests on booking", value: stay?.guests ?? "—", icon: Users, href: stayHref },
      { label: "Open requests", value: activeRequests.length, icon: BookOpenText, href: "/account/requests" },
      { label: "Recent updates", value: data.notifications.length, icon: Bell, href: "/account/notifications" },
    ]} />
    <div className="dashboard-grid-layout">
      <DashboardPanel title={stay ? "Your reservation" : "Your next stay"}>
        {stay ? <div className="dashboard-panel-body guest-stay-summary">
          {stayPhoto && <div className="guest-dashboard-photo"><Image src={stayPhoto} alt={`${stay.room_type} at Haven`} fill sizes="(max-width: 900px) 80vw, 420px" /></div>}
          <div className="guest-dashboard-stay-copy">
            <StatusBadge status={stay.status} size="sm" />
            <h3>{stay.room_type}</h3>
            <strong>{formatStayRange(stay.check_in, stay.check_out)}</strong>
            <small>Booking {stay.confirmation_number ?? stay.id}</small>
            {(stay.status === "confirmed" || stay.status === "checked_in") && <Link className="customer-stay-qr" href={stayHref}><QrCode size={16} aria-hidden="true" /> Check-in QR</Link>}
          </div>
        </div> : <p className="dashboard-empty">No upcoming stay.</p>}
        {attention.length > 0 && <section className="guest-dashboard-attention" aria-label="Needs your attention">
          <h3>Needs your attention</h3>
          {attention.map(item => <Link className="guest-dashboard-row" href={item.href} key={item.id}>
            <span><b>{item.label}</b><small>{item.detail}</small></span><ArrowRight size={15} aria-hidden="true" />
          </Link>)}
        </section>}
      </DashboardPanel>
      <DashboardFinances title="Stay finances" description="Payments and balance for this reservation"
        empty="No reservation balance to display." amounts={stay && money ? [
          { label: "Remaining balance", value: money.balance },
          { label: "Stay total", value: money.total },
          { label: "Required deposit", value: Number(stay.deposit_required ?? 0) },
          { label: "Paid", value: money.paid },
        ] : []}>
        {stay && <div className="guest-dashboard-payment-status"><span>Payment status</span><StatusBadge status={paymentStatus} size="sm" /></div>}
        <Link href="/account/payments">View payment details <ArrowRight size={14} aria-hidden="true" /></Link>
      </DashboardFinances>

      <DashboardPanel title="Guest requests" action={<Link className="btn btn-soft" href="/account/requests">View requests <ArrowRight size={14} aria-hidden="true" /></Link>}>
        {data.requests.length ? <ul className="dashboard-panel-body guest-dashboard-list">{data.requests.map(request => <li key={request.id} className="guest-dashboard-row">
          <span>{request.request}</span><StatusBadge status={request.status} size="sm" />
        </li>)}</ul> : <p className="dashboard-empty">No active or recent requests.</p>}
      </DashboardPanel>
      <DashboardPanel title="Notifications" description="Recent updates">
        {data.notifications.length ? <ul className="dashboard-panel-body guest-dashboard-list">{data.notifications.slice(0, 3).map(item => <li key={item.id}>
          <Link className="guest-dashboard-row" href={item.href}><span><b>{item.title}</b><small>{item.id.startsWith("refund-") ? "View refund details" : item.detail}</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
        </li>)}</ul> : <p className="dashboard-empty">No updates yet.</p>}
        <div className="dashboard-panel-footer"><Link href="/account/notifications">View notifications <ArrowRight size={14} aria-hidden="true" /></Link></div>
      </DashboardPanel>
      <DashboardPanel title="Plan your stay" className="dashboard-wide">
        <div className="dashboard-panel-body guest-dashboard-shortcuts">
          <Link className="btn btn-soft" href="/account/find-room"><Compass size={16} aria-hidden="true" /> Find a room</Link>
          <Link className="btn btn-soft" href="/my-reservations"><CalendarDays size={16} aria-hidden="true" /> My reservations</Link>
          <Link className="btn btn-soft" href="/account/requests"><BookOpenText size={16} aria-hidden="true" /> Guest requests</Link>
          <Link className="btn btn-soft" href="/account/payments"><ReceiptText size={16} aria-hidden="true" /> Payments</Link>
        </div>
      </DashboardPanel>
    </div>
  </DashboardOverview>;
}
