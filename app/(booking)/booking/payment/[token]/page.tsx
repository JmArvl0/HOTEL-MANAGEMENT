import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingStaySummary } from "@/components/booking/booking-stay-summary";
import { breakfastLine } from "@/lib/breakfast";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { calculateNights, depositPolicyLabel, formatPeso, getOwnedHold, policyFromSnapshot, transportTotal } from "@/lib/booking";
import { XenditCheckout, XenditPaymentBreakdown, XenditPaymentChoice } from "@/components/booking/xendit-checkout";
import { PaymentRecovery } from "@/components/booking/payment-recovery";
import { guestDepositsEnabled } from "@/lib/online-checkout";
import { xenditConfigured } from "@/lib/xendit";
import { parseFrozenRates } from "@/lib/rate-plans";
import { requestLabel } from "@/lib/request-options";
type TransportLineRow = { name: string; price: number | string; note?: string | null };
export default async function PaymentPage({params}:{params:Promise<{token:string}>}){const session=await getServerSession(authOptions);const{token}=await params;if(!session)redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(`/booking/payment/${token}`)}`);if(session.user.role!=="guest")redirect("/manager_dashboard");const hold=await getOwnedHold(token,session.user.id);if(!hold)notFound();if((hold.status==="payment_submitted"||hold.status==="completed")&&hold.reservation_id)redirect(`/booking/confirmation/${hold.reservation_id}`);const recovery=`/booking/rooms/${encodeURIComponent(hold.room_type)}?${new URLSearchParams({checkIn:hold.check_in,checkOut:hold.check_out,guests:String(hold.guest_count),expired:"1"})}`;if(hold.status!=="active"||new Date(hold.expires_at)<=new Date())return <BookingPageFrame session={session}><div className="booking-empty"><Clock3/><h1>Your reservation hold expired</h1><p>Please choose from the currently available rooms before submitting a deposit.</p><Link className="btn btn-accent" href={recovery}>Search rooms</Link></div></BookingPageFrame>;const policy=policyFromSnapshot(hold.deposit_policy_snapshot);const total=Number(hold.total),deposit=Number(hold.deposit_required),remaining=total-deposit;const requested=Array.isArray(hold.request_options)?hold.request_options.map((value:string)=>requestLabel(value)):[];const transport=Array.isArray(hold.transport_lines)?(hold.transport_lines as TransportLineRow[]).filter((line)=>line&&Number(line.price)>0):[];const breadcrumb=[{label:"Find a Room",href:`/account/find-room?${new URLSearchParams({checkIn:hold.check_in,checkOut:hold.check_out,guests:String(hold.guest_count)})}`},{label:"Guest details",href:`/booking/details?${new URLSearchParams({roomType:hold.room_type,...(hold.selected_room_id ? { roomId: hold.selected_room_id } : {}),checkIn:hold.check_in,checkOut:hold.check_out,guests:String(hold.guest_count),hold:token})}`},{label:"Review",href:`/booking/review/${token}`},{label:"Deposit",current:true}];
const { data: checkoutPolicy } = supabase
  ? await supabase.from("hotel_operational_policies").select("deposit_method").eq("key", "default").maybeSingle()
  : { data: null };
// Display-only room photo: DB photo_urls for the held room type, teal fallback when none.
let stayPhotos:string[]=[];
if(supabase){const{data}=await supabase.from("room_types").select("photo_urls").eq("name",hold.room_type).eq("active",true).maybeSingle();const urls=(data as{photo_urls?:unknown}|null)?.photo_urls;if(Array.isArray(urls))stayPhotos=urls.map(String).filter((url)=>url.trim()!=="");}
const xendit = guestDepositsEnabled(checkoutPolicy?.deposit_method);
const xenditReady = xendit && xenditConfigured();
const depositBody = xenditReady
  ? <XenditCheckout holdToken={token} amount={deposit} />
  : <PaymentRecovery title="Online checkout unavailable" detail="Try again or contact Front Desk for help with your reservation." />;
const stage = (
  <section className={`booking-stage customer-booking-stage-inner${xendit ? " payment-checkout-stage" : ""}`}>
    <div className="booking-payment-main">
      {!xendit && <p className="eyebrow">Reservation deposit</p>}
      <h1>{xendit ? "Complete your reservation." : "Secure your stay."}</h1>
      <HoldCountdown expiresAt={hold.expires_at} recoveryUrl={recovery} />
      {depositBody}
    </div>
    <BookingStaySummary
      roomNumber={hold.selected_room_number ?? undefined}
      roomType={hold.room_type}
      checkIn={hold.check_in}
      checkOut={hold.check_out}
      guests={hold.guest_count}
      nights={calculateNights(hold.check_in, hold.check_out)}
      rate={hold.nightly_rate == null ? null : Number(hold.nightly_rate)}
      total={total}
      nightly={parseFrozenRates(hold.nightly_rates)}
      lines={[...breakfastLine(hold.breakfast_snapshot), ...(transport.length ? [{ label: "Hotel transfer", amount: transportTotal(transport) }] : [])]}
      photos={stayPhotos}
      depositDue={xenditReady ? undefined : { label: `Required reservation deposit - ${depositPolicyLabel(policy)}`, amount: deposit }}
      remainingBalance={xenditReady ? undefined : remaining}
      paymentBreakdown={xenditReady ? <XenditPaymentBreakdown /> : undefined}
      footnote={<>
        {transport.length > 0 && <p><strong>Transport booked ({transport.length}):</strong> {transport.map((line) => line.name).join(", ")} - {formatPeso(transportTotal(transport))}
          <small className="summary-note">{xendit ? "Included in the stay total above." : "Included in the stay total above and covered by this reservation deposit."}</small>
        </p>}
        {(requested.length > 0 || hold.special_requests) && <p><strong>Stay requests:</strong> {[...requested, hold.special_requests].filter(Boolean).join(", ")}. Subject to availability and hotel confirmation.</p>}
        <p>{xendit ? "Your reservation is confirmed after your payment is verified." : "Your reservation will be confirmed only after the required deposit has been verified."}</p>
        {!xenditReady && <small>The remaining balance will be settled {policy.remainingBalanceDue.toLowerCase()}.</small>}
      </>}
    />
  </section>
);
return (
  <BookingPageFrame session={session} step={xendit ? "Payment" : "Reservation deposit"} breadcrumb={xendit ? [...breadcrumb.slice(0, -1), { label: "Payment", current: true }] : breadcrumb}>
    {xenditReady ? <XenditPaymentChoice deposit={deposit} total={total} balanceDue={policy.remainingBalanceDue}>{stage}</XenditPaymentChoice> : stage}
  </BookingPageFrame>
);
}
