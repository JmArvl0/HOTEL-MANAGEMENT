import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const ctx=await hotelGuard(["front_desk","manager","owner"]);if(ctx instanceof NextResponse)return ctx;return hotelRpc(ctx,"hotel_party_read",{p_reservation_id:(await params).id});}
