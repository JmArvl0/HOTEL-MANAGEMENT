import { publicJson } from "@/lib/server-errors";
import{getServerSession}from"next-auth";import{authOptions}from"@/lib/auth";import{supabase}from"@/lib/supabase";
import { retiredPayment } from "@/lib/online-checkout";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const session=await getServerSession(authOptions);if(!session||session.user.disabled||session.user.otpPending)return publicJson({error:"Please sign in to continue."},{status:401});if(session.user.role!=="guest")return publicJson({error:"Please sign in with a guest account to continue."},{status:403});if(!supabase)return publicJson({error:"This service is temporarily unavailable. Please try again shortly."},{status:503});const{id}=await params;await supabase.rpc("expire_booking_holds");const{data,error}=await supabase.from("reservations").select("id,status,payment_status").eq("id",id).eq("user_id",session.user.id).maybeSingle();if(error)return publicJson({error:"Unable to load reservation status."},{status:500});if(!data)return publicJson({error:"Reservation not found."},{status:404});const review = await supabase.rpc("guest_xendit_review_status", { p_reservation: id, p_guest: session.user.id }); return publicJson({data:{...data,payment_under_review:review.data===true}})}

export function POST() {
  return retiredPayment("Contact Front Desk to settle your stay balance.");
}
