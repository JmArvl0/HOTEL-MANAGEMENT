import { z } from "zod";
import { bookingCheckoutEnabled } from "@/lib/booking-checkout-policy";
import { PaymentRecovery } from "@/components/booking/payment-recovery";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingStaySummary } from "@/components/booking/booking-stay-summary";
import { GuestDetailsForm } from "@/components/booking/guest-details-form";
import { getGuestProfile, getOwnedHold, getRoomType, searchSchemaFor, hotelToday, getBookingTimezone, getDepositPolicy, calculateReservationDeposit } from "@/lib/booking";
import { getExactRooms } from "@/lib/exact-rooms";
import { displayTime, getOperationalPolicy } from "@/lib/hotel-policy";
import { getPreArrivalOptions } from "@/lib/inventory-request-options";
import { getBreakfastChoice } from "@/lib/breakfast-server";
import { breakfastOfferId } from "@/lib/breakfast";
import "@/components/customer/breakfast-pass.css";
export default async function DetailsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const raw=await searchParams;const search=searchSchemaFor(hotelToday(await getBookingTimezone())).safeParse({checkIn:raw.checkIn,checkOut:raw.checkOut,guests:raw.guests});if(!search.success)redirect("/booking/search");
 const roomType=raw.roomType??"";
 const offerFromSearch = breakfastOfferId.safeParse(raw.breakfast).data;
 const holdFromSearch = z.string().uuid().safeParse(raw.hold).data;
 const returnPath=`/booking/details?${new URLSearchParams({roomType,...(raw.roomId?{roomId:raw.roomId}:{}),...(offerFromSearch ? { breakfast: offerFromSearch } : {}),...(holdFromSearch ? { hold: holdFromSearch } : {}),checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests)})}`;
 const session=await getServerSession(authOptions);if(!session||session.user.disabled)redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(returnPath)}`);if(session.user.otpPending)redirect(`/verify?callbackUrl=${encodeURIComponent(returnPath)}`);if(session.user.role!=="guest")redirect("/manager_dashboard");
  const room=await getRoomType(roomType,search.data);if(!room||(!raw.roomId&&room.availableUnits<=0))redirect(`/booking/search?${new URLSearchParams({checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests),changed:"1"})}`);
 // Returning from Review: when a valid, unexpired hold for the SAME room/dates/guests is
 // referenced, prefill the form from what the guest entered on that hold (preserves expected
 // arrival, stay preparations, and the transportation request). Any mismatch falls back to
 // the saved profile — hold resubmission then behaves exactly like a fresh submission.
 const hold=holdFromSearch?await getOwnedHold(holdFromSearch,session.user.id):null;
 const usableHold=hold&&hold.status==="active"&&new Date(hold.expires_at)>new Date()&&hold.selected_room_id===(raw.roomId??null)&&hold.room_type===room.name&&hold.check_in===search.data.checkIn&&hold.check_out===search.data.checkOut&&hold.guest_count===search.data.guests?hold:null;
 const selectedRoom=raw.roomId?(await getExactRooms(roomType,search.data,usableHold?.token,session.user.id)).find(r=>r.id===raw.roomId):null;
 if(raw.roomId&&(!selectedRoom||!selectedRoom.available))redirect(`/booking/rooms/${encodeURIComponent(roomType)}?${new URLSearchParams({...search.data,guests:String(search.data.guests),changed:"1"})}`);
 const profile=await getGuestProfile(session.user.id,session.user.email);const names=(session.user.name??"").trim().split(/\s+/);const profileDefaults={firstName:profile?.first_name??names[0]??"",lastName:profile?.last_name??names.slice(1).join(" "),email:profile?.email??session.user.email??"",mobile:profile?.phone??"",address:profile?.address??"",nationality:profile?.nationality??"",specialRequests:profile?.special_requests??""};
 const defaults=usableHold?{firstName:usableHold.first_name,lastName:usableHold.last_name,email:usableHold.email,mobile:usableHold.mobile,address:usableHold.address??"",nationality:usableHold.nationality??"",specialRequests:usableHold.special_requests??""}:profileDefaults;
 const initialRequests=usableHold&&Array.isArray(usableHold.request_options)?(usableHold.request_options as string[]):[];
 const initialArrival=usableHold?.expected_arrival??"";const initialTransport=usableHold?(usableHold.transportation_preferences as Parameters<typeof GuestDetailsForm>[0]["initialTransport"]):null;
  const policy=await getOperationalPolicy();
  const preArrival=await getPreArrivalOptions();
  const quote = calculateReservationDeposit(room.subtotal, await getDepositPolicy());
  if (!(await bookingCheckoutEnabled()) || quote.requiredDeposit <= 0) {
    return <BookingPageFrame session={session}><PaymentRecovery title="Online checkout unavailable" detail="Contact Front Desk for help reserving this room." /></BookingPageFrame>;
  }
  const breakfast = selectedRoom ? await getBreakfastChoice(room.id, search.data.checkIn, search.data.checkOut, search.data.guests, room.subtotal, usableHold?.breakfast_snapshot) : null;
  const breakfastChanged = Boolean(offerFromSearch && offerFromSearch !== breakfast?.id);
 const breadcrumb=[{label:"Find a Room",href:`/booking/rooms/${encodeURIComponent(roomType)}?${new URLSearchParams({checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests)})}`},{label:"Guest details",current:true}];
 return <BookingPageFrame session={session} step="Guest details" breadcrumb={breadcrumb}><section className="booking-stage customer-booking-stage-inner"><div><p className="eyebrow">Almost yours</p><h1>Tell us about your stay.</h1>{selectedRoom&&<p><strong>Room {selectedRoom.number} · {room.name}</strong></p>}<p>We&apos;ll use these details for your reservation and arrival preparation.</p>{breakfastChanged && <p role="status">The breakfast offer changed while you were signing in. Review the options below.</p>}<GuestDetailsForm roomId={raw.roomId} holdToken={usableHold?.token} roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} checkInFrom={displayTime(policy.checkInTime)} defaults={defaults} initialRequests={initialRequests} initialArrival={initialArrival} initialTransport={initialTransport} preArrival={preArrival} breakfast={breakfast} initialBreakfast={Boolean(usableHold?.breakfast_snapshot || (offerFromSearch && offerFromSearch === breakfast?.id))}/></div><BookingStaySummary roomNumber={selectedRoom?.number} roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} nights={room.nights} rate={room.nightlyRate} total={room.subtotal} photos={room.photos} footnote={breakfast?.mode === "optional" ? <p>Room-only estimate. The breakfast option shows the updated total when selected.</p> : undefined}/></section></BookingPageFrame>;
}
