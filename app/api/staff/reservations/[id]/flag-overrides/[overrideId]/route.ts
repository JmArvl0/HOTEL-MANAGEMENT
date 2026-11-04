import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {guestFlagOverrideRevokeSchema} from "@/lib/guest-flags";
export async function DELETE(request:Request,{params}:{params:Promise<{overrideId:string}>}){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestFlagOverrideRevokeSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_flag_override_revoke",{p_override_id:(await params).overrideId,p_version:body.version,p_reason:body.reason});
}
