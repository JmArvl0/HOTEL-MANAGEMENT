import {NextResponse} from "next/server";
import {hotelGuard} from "@/lib/hotel-operations-route";
import {readAllRows} from "@/lib/read-all-rows";
export async function GET(){const ctx=await hotelGuard(["front_desk","accounting","manager","owner"]);if(ctx instanceof NextResponse)return ctx;try{return NextResponse.json({data:await readAllRows(()=>ctx.client.from("hotel_fee_catalog").select("code,name,unit_amount,active,version").order("name"),"code")});}catch{return NextResponse.json({error:"Unable to load the fee catalog."},{status:503});}}
