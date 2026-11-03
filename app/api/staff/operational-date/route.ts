import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelStaff} from "@/lib/hotel-operations-route";
export async function GET(){const ctx=await hotelGuard(hotelStaff);return ctx instanceof NextResponse?ctx:hotelRpc(ctx,"hotel_operating_day");}
export async function POST(){const ctx=await hotelGuard(["accounting"]);return ctx instanceof NextResponse?ctx:hotelRpc(ctx,"hotel_operating_day_activate");}
