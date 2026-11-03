import {NextResponse} from "next/server";
import {hotelGuard,hotelStaff} from "@/lib/hotel-operations-route";
import {readAllRows} from "@/lib/read-all-rows";
export async function GET(){const ctx=await hotelGuard(hotelStaff);if(ctx instanceof NextResponse)return ctx;const contacts=["front_desk","manager","owner"].includes(ctx.role),rooms=["front_desk","manager","owner","housekeeping","maintenance"].includes(ctx.role),reservations=contacts||ctx.role==="accounting";try{const[r,s,t,g]=await Promise.all([
 rooms?readAllRows(()=>ctx.client.from("rooms").select("id,number").order("number")):[],
 reservations?readAllRows(()=>ctx.client.from("reservations").select("id,confirmation_number").in("status",["pending","confirmed","checked_in"]).order("created_at",{ascending:false})):[],
 ["front_desk","manager","owner","housekeeping"].includes(ctx.role)?readAllRows(()=>ctx.client.from("housekeeping_tasks").select("id,room_number,task_type").in("status",["pending","assigned","in_progress","deferred"]).order("created_at",{ascending:false})):[],
 contacts?readAllRows(()=>ctx.client.from("guests").select("id,name").order("name")):[],
 ]);return NextResponse.json({data:{rooms:r,reservations:s,tasks:t,guests:g}});}catch{return NextResponse.json({error:"Unable to load handover links."},{status:503});}}
