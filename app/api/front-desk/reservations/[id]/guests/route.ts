import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {partySchema} from "@/lib/hotel-operations";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const ctx=await hotelGuard(["front_desk"]);if(ctx instanceof NextResponse)return ctx;const body=await hotelBody(request,partySchema);if(body instanceof NextResponse)return body;return hotelRpc(ctx,"hotel_party_update",{p_reservation_id:(await params).id,p_members:body.members,p_expected_version:body.expectedVersion,p_key:body.idempotencyKey});}
