import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {serviceConditionSchema} from "@/lib/housekeeping-service";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["front_desk","manager"]);if(context instanceof NextResponse)return context;
 return hotelRpc(context,"hotel_reservation_service_condition_read",{p_reservation_id:(await params).id});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["front_desk","manager"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,serviceConditionSchema);if(body instanceof NextResponse)return body;
 if(body.action==="set"&&context.role!=="front_desk")return NextResponse.json({error:"Only Front Desk can set this service instruction from the reservation record."},{status:403});
 return hotelRpc(context,"hotel_reservation_service_condition_update",{p_reservation_id:(await params).id,p_action:body.action,p_reason:body.reason,p_key:body.idempotencyKey});
}
