import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
export async function GET(){const ctx=await hotelGuard(["front_desk","manager","accounting","owner"]);return ctx instanceof NextResponse?ctx:hotelRpc(ctx,"hotel_night_audit_preview");}
