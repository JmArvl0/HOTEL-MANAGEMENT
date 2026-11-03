import {NextResponse} from "next/server";
import {guardFinancial,guardFailed} from "@/lib/financial-route";
import {hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {feeSchema} from "@/lib/hotel-operations";
export async function POST(request:Request){const ctx=await guardFinancial(role=>role==="accounting","Accounting catalog access required.");if(guardFailed(ctx))return ctx;const body=await hotelBody(request,feeSchema);if(body instanceof NextResponse)return body;return hotelRpc({client:ctx.client,actor:ctx.actorId,role:ctx.role},"hotel_fee_save",{p_code:body.code,p_name:body.name,p_amount:body.unitAmount,p_active:body.active,p_version:body.expectedVersion});}
