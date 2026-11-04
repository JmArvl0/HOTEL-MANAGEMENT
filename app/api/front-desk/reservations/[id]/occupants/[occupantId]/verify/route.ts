import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc,hotelBody} from "@/lib/hotel-operations-route";
import {occupantVerificationSchema} from "@/lib/hotel-operations";
export async function POST(request:Request,{params}:{params:Promise<{id:string;occupantId:string}>}){
 const context=await hotelGuard(["front_desk"]);if(context instanceof NextResponse)return context;
 const body=await hotelBody(request,occupantVerificationSchema);if(body instanceof NextResponse)return body;
 const {id,occupantId}=await params;
 return hotelRpc(context,"hotel_occupant_verify",{
  p_reservation_id:id,p_occupant_id:occupantId,p_date_of_birth:body.dateOfBirth??null,
  p_verified_age_years:body.verifiedAgeYears??null,p_nationality:body.nationality??null,
  p_key:body.idempotencyKey,p_evidence:"Government-issued ID visually inspected in person",
 });
}
