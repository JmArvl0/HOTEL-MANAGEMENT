import {NextResponse} from "next/server";
import {hotelBody,hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {roomDiscrepancyReportSchema} from "@/lib/room-discrepancies";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["housekeeping","front_desk","manager","owner"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,roomDiscrepancyReportSchema);if(body instanceof NextResponse)return body;
 return hotelRpc(context,"hotel_room_discrepancy_report",{p_room_id:(await params).id,p_observed_occupancy:body.observedOccupancy,
  p_reason:body.reason,p_task_id:body.taskId??null,p_key:body.idempotencyKey});
}
