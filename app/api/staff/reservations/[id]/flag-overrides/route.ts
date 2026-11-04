import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {guestFlagOverrideSchema} from "@/lib/guest-flags";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 return hotelRpc(context,"hotel_reservation_dnr_flags",{p_reservation_id:(await params).id});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestFlagOverrideSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_flag_override_create",{p_reservation_id:(await params).id,p_flag_id:body.flagId,
  p_purpose:body.purpose,p_flag_version:body.flagVersion,p_reason:body.reason,p_expires_at:body.expiresAt});
}
