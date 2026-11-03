import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody,hotelStaff} from "@/lib/hotel-operations-route";
import {handoverSchema} from "@/lib/hotel-operations";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;return hotelRpc(ctx,"hotel_handover_history",{p_id:(await params).id});}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;const body=await hotelBody(request,handoverSchema);if(body instanceof NextResponse)return body;const{expectedVersion,idempotencyKey,...note}=body;return hotelRpc(ctx,"hotel_handover_save",{p_id:(await params).id,p_version:expectedVersion,p_body:note,p_key:idempotencyKey});}
