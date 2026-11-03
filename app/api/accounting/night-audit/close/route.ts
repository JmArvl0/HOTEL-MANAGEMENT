import {NextResponse} from "next/server";
import {hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {guardFinancial,guardFailed} from "@/lib/financial-route";
import {closeDaySchema} from "@/lib/hotel-operations";
export async function POST(request:Request){const ctx=await guardFinancial(role=>role==="accounting","Accounting close access required.");if(guardFailed(ctx))return ctx;const body=await hotelBody(request,closeDaySchema);if(body instanceof NextResponse)return body;return hotelRpc({client:ctx.client,actor:ctx.actorId,role:ctx.role},"hotel_night_audit_close",{p_date:body.businessDate,p_version:body.expectedVersion,p_key:body.idempotencyKey});}
