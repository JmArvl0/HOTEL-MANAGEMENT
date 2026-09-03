import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canAdministerSystem } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export type AdminContext={actorId:string;role:Role;client:NonNullable<typeof supabase>};
export async function guardAdmin():Promise<AdminContext|NextResponse>{
  const session=await getServerSession(authOptions);
  if(!session||session.user.disabled)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!canAdministerSystem(session.user.role))return NextResponse.json({error:"Administrative authority required."},{status:403});
  if(!supabase)return NextResponse.json({error:"Database unavailable."},{status:503});
  const{data}=await supabase.from("user_accounts").select("id,role,active,recovery_required").eq("id",session.user.id).maybeSingle();
  if(!data?.active||data.recovery_required||!canAdministerSystem(data.role as Role))return NextResponse.json({error:"Administrative session is no longer authorized."},{status:401});
  return{actorId:data.id,role:data.role as Role,client:supabase};
}
/** Owner, Admin, or Manager — the roles allowed to maintain the customer-facing catalog (room types, transport services). */
export const canManageCatalog=(role:Role)=>role==="owner"||role==="admin"||role==="manager";
export async function guardCatalog():Promise<AdminContext|NextResponse>{
  const session=await getServerSession(authOptions);
  if(!session||session.user.disabled)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!canManageCatalog(session.user.role))return NextResponse.json({error:"Catalog management requires Manager or higher authority."},{status:403});
  if(!supabase)return NextResponse.json({error:"Database unavailable."},{status:503});
  const{data}=await supabase.from("user_accounts").select("id,role,active,recovery_required").eq("id",session.user.id).maybeSingle();
  if(!data?.active||data.recovery_required||!canManageCatalog(data.role as Role))return NextResponse.json({error:"Catalog session is no longer authorized."},{status:401});
  return{actorId:data.id,role:data.role as Role,client:supabase};
}
export const adminGuardFailed=(value:AdminContext|NextResponse):value is NextResponse=>value instanceof NextResponse;
export function adminRpcFailure(error:{message:string},fallback:string){const messages:Record<string,string>={PROTECTED_ROLE_FORBIDDEN:"You cannot assign or modify that protected role.",PROTECTED_ACCOUNT_FORBIDDEN:"This protected account requires Owner authority.",SELF_LIFECYCLE_CHANGE_FORBIDDEN:"You cannot deactivate or suspend your own account.",SELF_ROLE_CHANGE_FORBIDDEN:"You cannot change your own role.",LAST_ACTIVE_OWNER_PROTECTED:"The last active Owner account cannot be changed.",ACCOUNT_STALE:"This account changed since you opened it. Refresh and try again.",ACCOUNT_RECOVERY_REQUIRED:"Complete secure account recovery before activation.",ROOM_HAS_ACTIVE_ASSIGNMENT:"This room cannot be deactivated while it has an active or upcoming assignment.",ROOM_CONFIGURATION_STALE:"This room configuration changed. Refresh and try again.",ROOM_TYPE_STALE:"This room type changed. Refresh and try again.",POLICY_STALE:"The policy changed since you opened it. Refresh and try again.",TIMEZONE_OWNER_ONLY:"Only Owner can change the hotel timezone.",INVALID_OPERATIONAL_POLICY:"The policy contains invalid values.",TRANSPORT_SERVICE_NAME_TAKEN:"A transport service with that name already exists.",TRANSPORT_SERVICE_STALE:"This transport service changed since you opened it. Refresh and try again."};const key=Object.keys(messages).find(value=>error.message.includes(value));return NextResponse.json({error:key?messages[key]:fallback},{status:key?.includes("FORBIDDEN")||key==="TIMEZONE_OWNER_ONLY"?403:409});}
