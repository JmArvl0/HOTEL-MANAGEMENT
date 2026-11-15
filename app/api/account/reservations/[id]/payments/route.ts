import{getServerSession}from"next-auth";import{NextResponse}from"next/server";import{authOptions}from"@/lib/auth";import{supabase}from"@/lib/supabase";
import { retiredPayment } from "@/lib/online-checkout";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const session=await getServerSession(authOptions);if(!session||session.user.disabled)return NextResponse.json({error:"Unauthorized"},{status:401});if(session.user.role!=="guest")return NextResponse.json({error:"Customer access required."},{status:403});if(!supabase)return NextResponse.json({error:"Database unavailable."},{status:503});const{id}=await params;await supabase.rpc("expire_booking_holds");const{data,error}=await supabase.from("reservations").select("id,status,payment_status").eq("id",id).eq("user_id",session.user.id).maybeSingle();if(error)return NextResponse.json({error:"Unable to load reservation status."},{status:500});if(!data)return NextResponse.json({error:"Reservation not found."},{status:404});return NextResponse.json({data})}

export function POST() {
  return retiredPayment("Contact Front Desk to settle your stay balance.");
}
