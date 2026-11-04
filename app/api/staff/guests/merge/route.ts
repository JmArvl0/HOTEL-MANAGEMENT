import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {guestMergeCommitSchema} from "@/lib/guest-merge";

export async function POST(request:Request){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestMergeCommitSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_profile_merge",{p_source_id:body.sourceId,p_survivor_id:body.survivorId,
  p_field_choices:body.fieldChoices,p_reason:body.reason,p_fingerprint:body.fingerprint,p_key:body.idempotencyKey});
}
