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
export function adminRpcFailure(error:{message:string},fallback:string){const messages:Record<string,string>={PROTECTED_ROLE_FORBIDDEN:"You cannot assign or modify that protected role.",PROTECTED_ACCOUNT_FORBIDDEN:"This protected account requires Owner authority.",SELF_LIFECYCLE_CHANGE_FORBIDDEN:"You cannot deactivate or suspend your own account.",SELF_ROLE_CHANGE_FORBIDDEN:"You cannot change your own role.",LAST_ACTIVE_OWNER_PROTECTED:"The last active Owner account cannot be changed.",ACCOUNT_STALE:"This account changed since you opened it. Refresh and try again.",ACCOUNT_RECOVERY_REQUIRED:"Complete secure account recovery before activation.",ROOM_HAS_ACTIVE_ASSIGNMENT:"This room cannot be deactivated while it has an active or upcoming assignment.",ROOM_HAS_FUTURE_COMMITMENT:"This room has upcoming or in-house reservations. Reassign those guests before changing its room type.",ROOM_NUMBER_TAKEN:"A room with that number already exists.",INVALID_ROOM_CONFIGURATION:"Enter a valid room number, floor, room type, and reason.",ROOM_NOT_FOUND:"That room no longer exists.",ROOM_CONFIGURATION_STALE:"This room configuration changed. Refresh and try again.",ROOM_TYPE_STALE:"This room type changed. Refresh and try again.",ROOM_TYPE_NOT_FOUND:"That room type no longer exists.",ROOM_TYPE_NAME_TAKEN:"A room type with that name already exists.",INVALID_ROOM_TYPE_COLOR:"Choose a badge color from the palette, or none.",ROOM_TYPE_COLOR_TAKEN:"That badge color is already used by another active or pending room type.",BADGE_COLOR_CHANGE_APPROVAL_REQUIRED:"Badge color changes on an active room type need Owner or Admin approval.",ROOM_TYPE_RATE_REQUIRED:"Set an approved base rate before activating this room type.",RATE_CHANGE_APPROVAL_REQUIRED:"Rate changes need Owner or Admin approval. Use Propose new rate.",RATE_APPROVAL_PENDING:"A rate proposal is still awaiting approval for this room type.",RATE_PROPOSAL_NOT_FOUND:"That rate proposal no longer exists.",RATE_PROPOSAL_ALREADY_REVIEWED:"That rate proposal has already been reviewed.",RATE_PROPOSAL_ALREADY_PENDING:"A rate proposal is already awaiting approval for this room type.",RATE_PROPOSAL_SAME_AS_CURRENT:"The proposed rate matches the current rate.",RATE_PLAN_NOT_FOUND:"That rate plan no longer exists.",RATE_PLAN_ALREADY_REVIEWED:"That rate plan has already been reviewed.",RATE_PLAN_NAME_IN_USE:"A rate plan with that name already exists for this room type.",INVALID_RATE_PLAN:"Enter a valid plan name, date range, days, and rate.",INVALID_RATE_PLAN_REVIEW:"Enter a valid decision and a reason.",RATE_PLAN_NOT_RETIRABLE:"Only pending or active rate plans can be retired.",POLICY_STALE:"The policy changed since you opened it. Refresh and try again.",TIMEZONE_OWNER_ONLY:"Only Owner can change the hotel timezone.",INVALID_OPERATIONAL_POLICY:"The policy contains invalid values.",TRANSPORT_SERVICE_NAME_TAKEN:"A transport service with that name already exists.",TRANSPORT_SERVICE_STALE:"This transport service changed since you opened it. Refresh and try again."};const key=Object.keys(messages).find(value=>error.message.includes(value));const status=key?.includes("FORBIDDEN")||key?.includes("AUTHORITY_REQUIRED")||key==="TIMEZONE_OWNER_ONLY"?403:key?.endsWith("_NOT_FOUND")?404:409;return NextResponse.json({error:key?messages[key]:fallback},{status});}
