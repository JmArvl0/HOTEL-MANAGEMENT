import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {guestMergePreviewSchema} from "@/lib/guest-merge";

export async function POST(request:Request){
 const context=await hotelGuard(["manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,guestMergePreviewSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_guest_merge_preview",{p_source_id:body.sourceId,p_survivor_id:body.survivorId});
}
