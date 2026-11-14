import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, CarTaxiFront, MapPin, ReceiptText } from "lucide-react";
import { requireCustomerSession } from "@/lib/customer-auth";
import { getActiveGuestHolds, getRoomCatalog, policyFromSnapshot } from "@/lib/booking";
import { formatStayRange, friendlyStatus, getCustomerOverview } from "@/lib/customer";
import { formatHotelDateTime } from "@/lib/format";
import { getOperationalPolicy } from "@/lib/hotel-policy";
import { roomPrimary } from "@/lib/room-images";
import { requestLabel } from "@/lib/request-options";
import { ActiveBookingHolds } from "@/components/customer/active-booking-holds";
import { MyStayCard, type MyStayCardData } from "@/components/customer/my-stay-card";
import { FrontDeskSupport } from "@/components/customer/front-desk-support";

export default async function CustomerOverviewPage() {
  const session = await requireCustomerSession();
  const [data, holds, catalog, policy] = await Promise.all([
    getCustomerOverview(session.user.id), getActiveGuestHolds(session.user.id),
    getRoomCatalog().catch(() => []), getOperationalPolicy(),
  ]);
  const photo = (roomType: string) => roomPrimary(catalog.find((room) => room.name === roomType)?.photos, roomType);
  const stay = data.primary;
  const total = Number(stay?.invoice?.amount ?? stay?.total ?? 0);
  const verifiedPaid = Number(stay?.invoice?.paid ?? (stay?.status === "confirmed" || stay?.status === "checked_in" ? stay.deposit : 0) ?? 0);
  const credit = Number(stay?.invoice?.credit_balance ?? 0);
  const financial = stay ? { total, paid: verifiedPaid, balance: Number(stay.invoice?.balance ?? Math.max(0, total - verifiedPaid - credit)) } : null;
  const verification = stay?.payments.some((payment) => payment.purpose === "reservation_deposit" && payment.status === "pending_verification" && ["manual_gcash", "manual_bank_transfer"].includes(payment.method));
  const stage = stay?.status === "confirmed" || stay?.status === "checked_in" ? "confirmed" : verification ? "verification" : "payment";
  const detailHref = stay ? `/my-reservations/${stay.id}` : "/my-reservations";
  const primary: MyStayCardData | null = stay && financial ? {
    roomType: stay.room_type, roomNumber: stay.room_number, credit, photo: photo(stay.room_type), dates: formatStayRange(stay.check_in, stay.check_out),
    guests: stay.guests, reference: stay.confirmation_number ?? stay.id,
    status: stage === "verification" ? "Verifying payment" : stage === "payment" ? "Awaiting payment" : friendlyStatus(stay.status), stage,
    total: financial.total, paid: financial.paid, balance: financial.balance, deposit: Number(stay.deposit_required ?? 0),
    submitted: stay.payments.filter((payment) => payment.status === "pending_verification" && ["manual_gcash", "manual_bank_transfer"].includes(payment.method)).reduce((sum, payment) => sum + Number(payment.amount), 0),
    due: financial.balance === 0 ? "Your stay balance is settled." : stay.payment_due_at && stage === "payment" ? `Pay by ${formatHotelDateTime(stay.payment_due_at, policy.hotelTimezone)} (hotel time).` : `Remaining balance due ${policyFromSnapshot(stay.deposit_policy_snapshot).remainingBalanceDue.toLowerCase()}.`,
    nextTitle: stage === "verification" ? "Your deposit is being reviewed" : stage === "payment" ? "Complete your reservation payment" : stay.status === "checked_in" ? "Make yourself at home" : "Get ready for your arrival",
    nextDetail: stage === "verification" ? "No need to pay again. Your stay is confirmed after the hotel verifies your deposit." : stage === "payment" ? "Your reservation is not confirmed yet. Open your booking to check or retry payment." : stay.status === "checked_in" ? "Your requests, transportation and hotel information are a click away." : "Review your arrival details, check-in QR and booking-time policies.",
    action: stage === "payment" ? "Continue payment" : stage === "verification" ? "View booking status" : "Manage stay",
    href: stage === "payment" ? `/booking/confirmation/${stay.id}` : detailHref,
  } : null;
  const activeHolds = holds.map((hold) => {
    const expiryLabel = formatHotelDateTime(hold.expires_at, policy.hotelTimezone);
    const preferences = [...(Array.isArray(hold.request_options) ? hold.request_options.map((value: string) => requestLabel(value)) : []), ...(hold.special_requests ? [String(hold.special_requests)] : []), ...(hold.transportation_preferences ? ["Transportation requested"] : [])];
    return {
      token: hold.token, roomType: hold.room_type, roomNumber: hold.selected_room_number,
      dates: formatStayRange(hold.check_in, hold.check_out), expiresAt: hold.expires_at, expiryLabel,
      stay: {
        roomType: hold.room_type, roomNumber: hold.selected_room_number, photo: photo(hold.room_type),
        dates: formatStayRange(hold.check_in, hold.check_out), guests: hold.guest_count,
        status: "Room held", stage: "held" as const, total: Number(hold.total), paid: 0,
        balance: Number(hold.total), deposit: Number(hold.deposit_required), preferences,
        due: `Deposit due before the hold ends: ${expiryLabel} (hotel time).`,
        nextTitle: "Finish booking your stay", nextDetail: `Your room is held until ${expiryLabel} (hotel time). It is not confirmed. If the hold expires, check availability again.`,
        action: "Resume booking", href: `/booking/review/${hold.token}`,
      },
    };
  });
  return <div className="my-stay-overview">
    <header className="my-stay-greeting"><div><h1>My Stay</h1><p>Welcome back, {(session.user.name ?? "Guest").split(" ")[0]}.</p></div><Link href="/my-reservations">All reservations <ArrowRight size={16} aria-hidden="true" /></Link></header>
    {primary && <MyStayCard stay={primary} />}
    {activeHolds.length > 0 && <ActiveBookingHolds holds={activeHolds} featured={!primary} />}
    {!primary && !activeHolds.length && <section className="my-stay-empty"><div><h2>Your next stay starts here.</h2><p>Choose your dates and find a room. Your booking and next steps will appear here.</p></div><Link className="btn btn-accent" href="/account/find-room">Find a room <ArrowRight size={16} aria-hidden="true" /></Link></section>}
    <nav className="my-stay-shortcuts" aria-label="Stay shortcuts">
      <h2>Stay shortcuts</h2><div>
        <Link href={detailHref}><CalendarDays size={19} aria-hidden="true" />Reservation details<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/account/payments"><ReceiptText size={19} aria-hidden="true" />Payments & receipts<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/account/requests"><BookOpenText size={19} aria-hidden="true" />Guest requests<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/account/transportation"><CarTaxiFront size={19} aria-hidden="true" />Transportation<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/account/stay-guide"><MapPin size={19} aria-hidden="true" />Stay guide & directions<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </nav>
    <div className="my-stay-lower"><section className="my-stay-updates"><div className="my-stay-section-heading"><h2>Recent updates</h2><Link href="/account/notifications">View all</Link></div>
      {data.notifications.length ? <ul>{data.notifications.slice(0, 3).map((item) => <li key={item.id}><Link href={item.href}><strong>{item.title}</strong><span>{item.detail}</span></Link></li>)}</ul> : <p>Booking updates, payment verification and hotel replies will appear here.</p>}
    </section><FrontDeskSupport /></div>
  </div>;
}
