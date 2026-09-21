import { createHash,randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin,adminGuardFailed,adminRpcFailure } from "@/lib/admin-route";

const schema=z.object({
 action:z.enum(["status","role","metadata","recovery","convert"]),
 status:z.enum(["active","inactive","suspended"]).optional(),
 role:z.enum(["owner","admin","manager","front_desk","housekeeping","maintenance","accounting","guest"]).optional(),
 reason:z.string().trim().min(3).max(500),
 version:z.coerce.number().int().positive().optional(),
 expectedEmail:z.string().trim().email().optional(),
 name:z.string().trim().min(2).max(120).optional(),
 phone:z.string().trim().max(30).optional(),
 department:z.string().trim().max(80).optional(),
 employeeReference:z.string().trim().max(80).optional(),
 withHistory:z.boolean().optional()
});

const recoveryCredential=()=>{const token=randomBytes(32).toString("base64url");return{token,hash:createHash("sha256").update(token).digest("hex"),expires:new Date(Date.now()+60*60*1000).toISOString()}};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await guardAdmin();
 if(adminGuardFailed(context))return context;
 const parsed=schema.safeParse(await request.json());
 if(!parsed.success)return NextResponse.json({error:"Invalid administrative action."},{status:400});
 const id=(await params).id,v=parsed.data;
 let rpc="",args:Record<string,unknown>={};
 if(v.action==="status"){if(!v.status||!v.version)return NextResponse.json({error:"Status and current version are required."},{status:400});rpc="admin_change_account_status";args={p_target_user_id:id,p_status:v.status,p_reason:v.reason,p_expected_version:v.version,p_actor_user_id:context.actorId};}
 if(v.action==="role"){if(!v.role||!v.version)return NextResponse.json({error:"Role and current version are required."},{status:400});rpc="admin_change_user_role";args={p_target_user_id:id,p_role:v.role,p_reason:v.reason,p_expected_version:v.version,p_actor_user_id:context.actorId};}
 if(v.action==="metadata"){if(!v.name||!v.version)return NextResponse.json({error:"Name and current version are required."},{status:400});rpc="admin_update_user_metadata";args={p_target_user_id:id,p_name:v.name,p_phone:v.phone??null,p_department:v.department??null,p_employee_reference:v.employeeReference??null,p_expected_version:v.version,p_actor_user_id:context.actorId};}
 if(v.action==="recovery"){
  const recovery=recoveryCredential();
  const{error}=await context.client.rpc("admin_initiate_account_recovery",{p_target_user_id:id,p_token_hash:recovery.hash,p_expires_at:recovery.expires,p_reason:v.reason,p_actor_user_id:context.actorId});
  if(error)return adminRpcFailure(error,"Unable to initiate account recovery.");
  return NextResponse.json({data:{recoveryUrl:`${new URL(request.url).origin}/recover/${recovery.token}`,expiresAt:recovery.expires}});
 }
 if(v.action==="convert"){
  if(!v.role||!v.version||!v.expectedEmail)return NextResponse.json({error:"Role, exact email, and current version are required."},{status:400});
  const recovery=recoveryCredential();
  const rpc=v.withHistory?"admin_convert_guest_to_staff_with_history":"admin_convert_guest_to_staff";
  const{data,error}=await context.client.rpc(rpc,{p_target_user_id:id,p_expected_email:v.expectedEmail,p_role:v.role,p_department:v.department??null,p_employee_reference:v.employeeReference??null,p_reason:v.reason,p_expected_version:v.version,p_token_hash:recovery.hash,p_expires_at:recovery.expires,p_actor_user_id:context.actorId});
  if(error)return adminRpcFailure(error,"Unable to convert the guest account.");
  return NextResponse.json({data:{...(data as Record<string,unknown>),recoveryUrl:`${new URL(request.url).origin}/recover/${recovery.token}`,expiresAt:recovery.expires}});
 }
 const{data,error}=await context.client.rpc(rpc,args);
 if(error)return adminRpcFailure(error,"Unable to update the account.");
 return NextResponse.json({data});
}
