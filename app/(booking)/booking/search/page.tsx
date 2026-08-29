import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BookingHeader } from "@/components/booking/booking-shell";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomResults } from "@/components/booking/room-results";
import { getAvailability, hotelToday, searchSchema } from "@/lib/booking";

export default async function SearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const raw=await searchParams;const session=await getServerSession(authOptions);
 const forwarded=new URLSearchParams();for(const key of ["checkIn","checkOut","guests","expired","changed"]){const value=raw[key];if(typeof value==="string")forwarded.set(key,value)}
 if(session?.user.role==="guest")redirect(`/account/find-room${forwarded.size?`?${forwarded}`:""}`);
 const today=hotelToday();const next=new Date(`${today}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
 const input={checkIn:String(raw.checkIn||today),checkOut:String(raw.checkOut||next.toISOString().slice(0,10)),guests:Number(raw.guests)||2};
 const parsed=searchSchema.safeParse(input);const rooms=parsed.success?await getAvailability(parsed.data):[];
 const details=(roomType:string)=>{const query=new URLSearchParams({roomType,checkIn:input.checkIn,checkOut:input.checkOut,guests:String(input.guests)});const path=`/booking/details?${query}`;return session?path:`/login?booking=1&callbackUrl=${encodeURIComponent(path)}`};
 return <main className="booking-page"><BookingHeader step="Choose a room"/><section className="booking-hero"><p className="eyebrow light">Reserve your stay</p><h1>Available rooms</h1><p>Live availability from Haven&apos;s room inventory.</p></section><div className="booking-content">{raw.expired&&<p className="booking-notice">Your reservation hold expired before payment was completed. Please choose from the currently available rooms.</p>}{raw.changed&&<p className="booking-notice">Availability or rates changed. Please select from the latest results.</p>}<BookingSearchForm compact initial={input}/><RoomResults rooms={rooms} error={parsed.success?undefined:parsed.error.issues[0]?.message} hrefFor={details}/></div></main>;
}
