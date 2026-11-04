import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
export async function GET(){
 const context=await hotelGuard(["front_desk","manager","owner"]);if(context instanceof NextResponse)return context;
 return hotelRpc(context,"hotel_room_discrepancy_list");
}
