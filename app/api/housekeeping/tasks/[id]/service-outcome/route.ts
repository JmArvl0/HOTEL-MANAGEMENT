import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {housekeepingServiceOutcomeSchema} from "@/lib/housekeeping-service";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["housekeeping"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,housekeepingServiceOutcomeSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_housekeeping_service_outcome",{p_task_id:(await params).id,p_outcome:body.outcome,
  p_note:body.note,p_version:body.expectedVersion,p_key:body.idempotencyKey});
}
