import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {occupantPresenceSchema} from "@/lib/hotel-operations";
export async function POST(request:Request,{params}:{params:Promise<{id:string;occupantId:string}>}){
 const context=await hotelGuard(["front_desk"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,occupantPresenceSchema);if(body instanceof NextResponse)return body;
 const {id,occupantId}=await params;
 return hotelRpc(context,"hotel_occupant_presence_update",{
  p_reservation_id:id,p_occupant_id:occupantId,p_action:body.action,p_version:body.expectedVersion,p_key:body.idempotencyKey,
 });
}
