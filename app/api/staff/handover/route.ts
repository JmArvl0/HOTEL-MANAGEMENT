import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody,hotelStaff} from "@/lib/hotel-operations-route";
import {handoverSchema} from "@/lib/hotel-operations";
export async function GET(request:Request){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;return hotelRpc(ctx,"hotel_handover_list",{p_archived:new URL(request.url).searchParams.get("archived")==="true"});}
export async function POST(request:Request){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;const body=await hotelBody(request,handoverSchema);if(body instanceof NextResponse)return body;const{expectedVersion,idempotencyKey,...note}=body;return hotelRpc(ctx,"hotel_handover_save",{p_id:null,p_version:expectedVersion,p_body:note,p_key:idempotencyKey});}
