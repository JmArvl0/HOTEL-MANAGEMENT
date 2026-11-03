import {NextResponse} from "next/server";
import {hotelGuard,hotelStaff} from "@/lib/hotel-operations-route";
import {readAllRows} from "@/lib/read-all-rows";
export async function GET(){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;try{return NextResponse.json({data:await readAllRows(()=>ctx.client.from("user_accounts").select("id,name,role").eq("active",true).eq("account_status","active").in("role",["front_desk","housekeeping","maintenance","accounting","manager"]).order("name"))});}catch{return NextResponse.json({error:"Unable to load handover assignees."},{status:503});}}
