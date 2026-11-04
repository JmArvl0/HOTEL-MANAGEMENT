import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {occupantPolicySchema} from "@/lib/hotel-operations";
export async function GET(){
 const context=await hotelGuard(["admin","owner"]);if(context instanceof NextResponse)return context;
 return hotelRpc(context,"hotel_occupant_policy_read");
}
export async function PATCH(request:Request){
 const context=await hotelGuard(["admin","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,occupantPolicySchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_occupant_policy_update",{
  p_register_effective_from:body.registerEffectiveFrom,p_age_effective_from:body.ageEffectiveFrom,
  p_reason:body.reason,p_version:body.version,
 });
}
