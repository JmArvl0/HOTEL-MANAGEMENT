import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const ctx=await hotelGuard(["front_desk","manager","owner"]);if(ctx instanceof NextResponse)return ctx;const candidate=new URL(request.url).searchParams.get("roomId");if(candidate&&candidate.length>60)return NextResponse.json({error:"Invalid room."},{status:400});return hotelRpc(ctx,"hotel_reservation_readiness",{p_reservation_id:(await params).id,p_candidate_room:candidate});}
