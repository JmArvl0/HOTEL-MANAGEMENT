import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingSummary } from "@/components/booking/booking-shell";
import { GuestDetailsForm } from "@/components/booking/guest-details-form";
import { getGuestProfile, getOwnedHold, getRoomType, searchSchema } from "@/lib/booking";
import { displayTime, getOperationalPolicy } from "@/lib/hotel-policy";
export default async function DetailsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const raw=await searchParams;const search=searchSchema.safeParse({checkIn:raw.checkIn,checkOut:raw.checkOut,guests:raw.guests});if(!search.success)redirect("/booking/search");
 const roomType=raw.roomType??"";const returnPath=`/booking/details?${new URLSearchParams({roomType,checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests)})}`;
 const session=await getServerSession(authOptions);if(!session)redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(returnPath)}`);if(session.user.role!=="guest")redirect("/manager_dashboard");
 const room=await getRoomType(roomType,search.data);if(!room)redirect(`/booking/search?${new URLSearchParams({checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests),changed:"1"})}`);
 // Returning from Review: when a valid, unexpired hold for the SAME room/dates/guests is
 // referenced, prefill the form from what the guest entered on that hold (preserves expected
 // arrival, stay preparations, and the transportation request). Any mismatch falls back to
 // the saved profile — hold resubmission then behaves exactly like a fresh submission.
 const hold=raw.hold?await getOwnedHold(raw.hold,session.user.id):null;
 const usableHold=hold&&hold.status==="active"&&new Date(hold.expires_at)>new Date()&&hold.room_type===room.name&&hold.check_in===search.data.checkIn&&hold.check_out===search.data.checkOut&&hold.guest_count===search.data.guests?hold:null;
 const profile=await getGuestProfile(session.user.id,session.user.email);const names=(session.user.name??"").trim().split(/\s+/);const profileDefaults={firstName:profile?.first_name??names[0]??"",lastName:profile?.last_name??names.slice(1).join(" "),email:profile?.email??session.user.email??"",mobile:profile?.phone??"",address:profile?.address??"",nationality:profile?.nationality??"",specialRequests:profile?.special_requests??""};
 const defaults=usableHold?{firstName:usableHold.first_name,lastName:usableHold.last_name,email:usableHold.email,mobile:usableHold.mobile,address:usableHold.address??"",nationality:usableHold.nationality??"",specialRequests:usableHold.special_requests??""}:profileDefaults;
 const initialRequests=usableHold&&Array.isArray(usableHold.request_options)?(usableHold.request_options as string[]):[];
 const initialArrival=usableHold?.expected_arrival??"";const initialTransport=usableHold?(usableHold.transportation_preferences as Parameters<typeof GuestDetailsForm>[0]["initialTransport"]):null;
 const policy=await getOperationalPolicy();
 const breadcrumb=[{label:"Find a Room",href:`/account/find-room?${new URLSearchParams({checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests)})}`},{label:"Guest details",current:true}];
 return <BookingPageFrame session={session} step="Guest details" breadcrumb={breadcrumb}><section className="booking-stage customer-booking-stage-inner"><div><p className="eyebrow">Almost yours</p><h1>Tell us about your stay.</h1><p>We&apos;ll use these details for your reservation and arrival preparation.</p><GuestDetailsForm roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} checkInFrom={displayTime(policy.checkInTime)} defaults={defaults} initialRequests={initialRequests} initialArrival={initialArrival} initialTransport={initialTransport}/></div><BookingSummary roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} nights={room.nights} rate={room.nightlyRate} total={room.subtotal}/></section></BookingPageFrame>;
}
