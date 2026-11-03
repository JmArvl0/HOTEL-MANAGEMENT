import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {duplicateReviewSchema} from "@/lib/hotel-operations";
import {duplicateCandidates,type DuplicateGuest} from "@/lib/guest-duplicates";
import {readAllRows} from "@/lib/read-all-rows";
export async function GET(){const ctx=await hotelGuard(["manager","owner"]);if(ctx instanceof NextResponse)return ctx;try{const[guests,reviews]=await Promise.all([readAllRows(()=>ctx.client.from("guests").select("id,name,email,user_account_id").order("id")),readAllRows(()=>ctx.client.from("hotel_duplicate_reviews").select("pair_key,decision"),"pair_key")]);return NextResponse.json({data:duplicateCandidates(guests as DuplicateGuest[],Object.fromEntries(reviews.map(row=>[String(row.pair_key),String(row.decision)])))});}catch{return NextResponse.json({error:"Unable to load identity-review candidates."},{status:503});}}
export async function POST(request:Request){const ctx=await hotelGuard(["manager","owner"]);if(ctx instanceof NextResponse)return ctx;const body=await hotelBody(request,duplicateReviewSchema);if(body instanceof NextResponse)return body;return hotelRpc(ctx,"hotel_duplicate_review",{p_pair_key:body.pairKey,p_decision:body.decision,p_reason:body.reason});}
