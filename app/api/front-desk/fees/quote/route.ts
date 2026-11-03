import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {feeChargeSchema} from "@/lib/hotel-operations";
export async function POST(request:Request){const ctx=await hotelGuard(["front_desk"]);if(ctx instanceof NextResponse)return ctx;const body=await hotelBody(request,feeChargeSchema);if(body instanceof NextResponse)return body;return hotelRpc(ctx,"hotel_fee_quote",{p_code:body.feeCode,p_quantity:body.quantity,p_version:body.catalogVersion});}
