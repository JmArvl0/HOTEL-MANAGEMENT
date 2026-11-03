import {getServerSession} from "next-auth";
import {NextResponse} from "next/server";
import type {z} from "zod";
import {authOptions} from "@/lib/auth";
import {supabase} from "@/lib/supabase";
import type {Role} from "@/lib/types";
export const hotelStaff:Role[]=["front_desk","manager","owner","housekeeping","maintenance","accounting"];
export async function hotelGuard(roles:readonly Role[]){
 const session=await getServerSession(authOptions);
 if(!session||session.user.disabled)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!roles.includes(session.user.role))return NextResponse.json({error:"This hotel action is not available to your role."},{status:403});
 if(!supabase)return NextResponse.json({error:"Database unavailable."},{status:503});
 return {client:supabase,actor:session.user.id,role:session.user.role};
}
const messages:Record<string,string>={OPERATIONS_CHANGED_RETRY:"Hotel operations changed during close. Refresh the assessment and retry.",PRIMARY_STAYING_GUEST_LOCKED:"The primary guest must follow the reservation identity. Resolve the registered guest before changing companions.",STALE_VERSION:"This record changed. Refresh before editing again.",STALE_OPERATING_DAY:"The operating day changed. Refresh the assessment.",STALE_FEE:"This fee changed or is inactive. Refresh the catalog.",NIGHT_AUDIT_BLOCKERS:"Resolve the close blockers before closing the day.",CLOSE_CUTOFF_NOT_REACHED:"The operating day's no-show cutoff has not been reached.",PARTY_CAPACITY:"The occupant list exceeds this reservation's guest capacity.",PARTY_PRIMARY_REQUIRED:"Choose exactly one primary staying guest.",PARTY_NOT_EDITABLE:"Occupants can be edited only for confirmed or in-house stays.",IDEMPOTENCY_CONFLICT:"This retry key belongs to a different operation.",CONTACT_LINK_FORBIDDEN:"Guest contact links must stay within Front Desk or Management.",RESERVATION_NOT_IN_HOUSE:"Charges require an in-house reservation."};
export async function hotelRpc(context:Exclude<Awaited<ReturnType<typeof hotelGuard>>,NextResponse>,name:string,args:Record<string,unknown>={}){
 const result=await context.client.rpc(name,{...args,p_actor:context.actor});
 if(result.error){
  if(["PGRST202","PGRST205","42883","42P01"].includes(result.error.code)){
   console.error("Hotel operation unavailable",{operation:name,code:result.error.code});
   return NextResponse.json({error:"This hotel service is unavailable. Please contact the system administrator.",code:"HOTEL_OPERATIONS_UNAVAILABLE"},{status:503});
  }
  const code=Object.keys(messages).find(key=>result.error!.message.includes(key));return NextResponse.json({error:code?messages[code]:"Unable to complete this hotel operation. Refresh and try again."},{status:result.error.message.includes("FORBIDDEN")?403:result.error.message.includes("NOT_FOUND")?404:code?409:503});}
 return NextResponse.json({data:result.data});
}
export async function hotelBody<T extends z.ZodTypeAny>(request:Request,schema:T):Promise<z.infer<T>|NextResponse>{
 const result=schema.safeParse(await request.json().catch(()=>null));
 return result.success?result.data:NextResponse.json({error:result.error.issues[0]?.message??"Invalid request."},{status:400});
}
