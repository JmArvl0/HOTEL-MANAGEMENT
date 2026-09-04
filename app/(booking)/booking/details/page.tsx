import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingSummary } from "@/components/booking/booking-shell";
import { GuestDetailsForm } from "@/components/booking/guest-details-form";
import { getGuestProfile, getRoomType, searchSchema } from "@/lib/booking";
import { transferEnabled } from "@/lib/transfer";
export default async function DetailsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const raw=await searchParams;const search=searchSchema.safeParse({checkIn:raw.checkIn,checkOut:raw.checkOut,guests:raw.guests});if(!search.success)redirect("/booking/search");
 const roomType=raw.roomType??"";const returnPath=`/booking/details?${new URLSearchParams({roomType,checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests)})}`;
 const session=await getServerSession(authOptions);if(!session)redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(returnPath)}`);if(session.user.role!=="guest")redirect("/manager_dashboard");
 const room=await getRoomType(roomType,search.data);if(!room)redirect(`/booking/search?${new URLSearchParams({checkIn:search.data.checkIn,checkOut:search.data.checkOut,guests:String(search.data.guests),changed:"1"})}`);
 const profile=await getGuestProfile(session.user.id,session.user.email);const names=(session.user.name??"").trim().split(/\s+/);const defaults={firstName:profile?.first_name??names[0]??"",lastName:profile?.last_name??names.slice(1).join(" "),email:profile?.email??session.user.email??"",mobile:profile?.phone??"",address:profile?.address??"",nationality:profile?.nationality??"",specialRequests:profile?.special_requests??""};
 return <BookingPageFrame session={session} step="Guest details"><section className="booking-stage customer-booking-stage-inner"><div><p className="eyebrow">Almost yours</p><h1>Tell us about your stay.</h1><p>We&apos;ll use these details for your reservation and arrival preparation.</p><GuestDetailsForm roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} defaults={defaults} transferEnabled={transferEnabled()}/></div><BookingSummary roomType={room.name} checkIn={search.data.checkIn} checkOut={search.data.checkOut} guests={search.data.guests} nights={room.nights} rate={room.nightlyRate} total={room.subtotal}/></section></BookingPageFrame>;
}
