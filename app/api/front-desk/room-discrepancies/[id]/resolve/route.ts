import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {roomDiscrepancyUpdateSchema} from "@/lib/room-discrepancies";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["front_desk"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,roomDiscrepancyUpdateSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_room_discrepancy_update",{p_discrepancy_id:(await params).id,p_action:body.action,
  p_reason:body.reason??null,p_version:body.expectedVersion,p_key:body.idempotencyKey});
}
