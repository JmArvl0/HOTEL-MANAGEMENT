import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {guestFlagRevokeSchema,guestFlagSaveSchema} from "@/lib/guest-flags";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["front_desk","manager","owner"]);if(context instanceof NextResponse)return context;
 return hotelRpc(context,"hotel_guest_flags_read",{p_guest_id:(await params).id});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestFlagSaveSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_flag_save",{p_flag_id:null,p_guest_id:(await params).id,p_flag_type:body.flagType,
  p_instructions:body.instructions,p_restricted_note:body.restrictedNote,p_expires_at:body.expiresAt,p_version:0,p_reason:body.reason});
}
export async function PATCH(request:Request){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestFlagRevokeSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_flag_revoke",{p_flag_id:body.flagId,p_version:body.version,p_reason:body.reason});
}
