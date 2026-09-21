import { NextResponse } from "next/server";import{z}from"zod";import{guardAdmin,adminGuardFailed,adminRpcFailure}from"@/lib/admin-route";
import { ABSOLUTE_SESSION_OPTIONS,OTP_ATTEMPTS_OPTIONS,OTP_COOLDOWN_OPTIONS,OTP_TTL_OPTIONS,SECURITY_IDLE_MINUTES_MAX,SECURITY_IDLE_MINUTES_MIN } from "@/lib/security-policy";
const schema=z.object({persistentSessionEnabled:z.boolean(),idleTimeoutMinutes:z.coerce.number().int().min(SECURITY_IDLE_MINUTES_MIN).max(SECURITY_IDLE_MINUTES_MAX),absoluteSessionMinutes:z.coerce.number().int().refine((value)=>ABSOLUTE_SESSION_OPTIONS.includes(value),{message:"Maximum session lifetime must be one of 1, 2, 4, 8, 12, or 24 hours."}),loginOtpEnabled:z.boolean(),otpTtlSeconds:z.coerce.number().int().refine((value)=>OTP_TTL_OPTIONS.includes(value),{message:"OTP validity must be 3, 5, or 10 minutes."}),otpResendCooldownSeconds:z.coerce.number().int().refine((value)=>OTP_COOLDOWN_OPTIONS.includes(value),{message:"Resend cooldown must be 30, 60, or 120 seconds."}),otpMaxAttempts:z.coerce.number().int().refine((value)=>OTP_ATTEMPTS_OPTIONS.includes(value),{message:"Maximum attempts must be 3, 5, or 10."}),reason:z.string().trim().min(3).max(500),version:z.coerce.number().int().positive()}).refine((value)=>value.absoluteSessionMinutes>=value.idleTimeoutMinutes,{message:"Maximum session lifetime must not be shorter than the inactivity timeout."});
const columns="persistent_session_enabled,idle_timeout_minutes,absolute_session_minutes,login_otp_enabled,otp_ttl_seconds,otp_resend_cooldown_seconds,otp_max_attempts,version,updated_by,updated_at";
// after_data uses camelCase keys; before_data is the raw snake_case row.
const HISTORY_FIELDS:[string,string,string][]=[["persistentSessionEnabled","persistent_session_enabled","Persistent login"],["idleTimeoutMinutes","idle_timeout_minutes","Inactivity timeout"],["absoluteSessionMinutes","absolute_session_minutes","Maximum session lifetime"],["loginOtpEnabled","login_otp_enabled","Login OTP"],["otpTtlSeconds","otp_ttl_seconds","OTP validity"],["otpResendCooldownSeconds","otp_resend_cooldown_seconds","Resend cooldown"],["otpMaxAttempts","otp_max_attempts","Maximum attempts"]];
const historyValue=(key:string,value:unknown)=>{if(value==null)return "—";if(typeof value==="boolean")return value?"On":"Off";if(key==="otpTtlSeconds")return `${Number(value)/60} min`;if(key==="otpResendCooldownSeconds")return `${value} sec`;if(key==="idleTimeoutMinutes")return Number(value)<60?`${value} min`:`${Number(value)/60} h`;if(key==="absoluteSessionMinutes")return `${Number(value)/60} h`;return String(value)};
export async function GET(){
  const c=await guardAdmin();if(adminGuardFailed(c))return c;
  const{data,error}=await c.client.from("security_policies").select(columns).eq("key","default").maybeSingle();
  if(error)return NextResponse.json({error:"Unable to read security configuration."},{status:500});
  // Configuration history: the latest policy audit row, with the actor's
  // display name and a changed-fields diff. Safe values only by construction.
  let history:null|{updatedAt:string;updatedBy:string;reason:string;version:number;changes:{label:string;from:string;to:string}[]}=null;
  const{data:latest}=await c.client.from("audit_logs").select("created_at,user_id,before_data,after_data")
    .eq("action","security_policy_updated").eq("entity_id","default").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(latest){
    const before=(latest.before_data??{})as Record<string,unknown>;
    const after=(latest.after_data??{})as Record<string,unknown>;
    let actor="Unknown";
    if(typeof latest.user_id==="string"){
      const{data:person}=await c.client.from("user_accounts").select("name,role").eq("id",latest.user_id).maybeSingle();
      if(person)actor=`${person.name??"Unknown"} (${person.role==="admin"?"System Administrator":person.role})`;
    }
    const changes=HISTORY_FIELDS
      .filter(([afterKey,beforeKey])=>afterKey in after && JSON.stringify(before[beforeKey])!==JSON.stringify(after[afterKey]))
      .map(([afterKey,beforeKey,label])=>({label,from:historyValue(afterKey,before[beforeKey]),to:historyValue(afterKey,after[afterKey])}));
    history={updatedAt:String(latest.created_at),updatedBy:actor,reason:String(after.reason??"—"),version:Number(after.version??0),changes};
  }
  return NextResponse.json({data:{...(data??{}),history}});
}
export async function PATCH(request:Request){
  const c=await guardAdmin();if(adminGuardFailed(c))return c;
  if(c.role!=="admin")return NextResponse.json({error:"Security configuration requires System Administrator authority."},{status:403});
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid security configuration."},{status:400});
  const v=parsed.data;
  const{data,error}=await c.client.rpc("admin_update_security_policy",{p_persistent_session_enabled:v.persistentSessionEnabled,p_idle_timeout_minutes:v.idleTimeoutMinutes,p_absolute_session_minutes:v.absoluteSessionMinutes,p_login_otp_enabled:v.loginOtpEnabled,p_otp_ttl_seconds:v.otpTtlSeconds,p_otp_resend_cooldown_seconds:v.otpResendCooldownSeconds,p_otp_max_attempts:v.otpMaxAttempts,p_reason:v.reason,p_expected_version:v.version,p_actor_user_id:c.actorId});
  if(error){
    if(error.message.includes("SECURITY_ADMIN_ONLY"))return NextResponse.json({error:"Security configuration requires System Administrator authority."},{status:403});
    if(error.message.includes("POLICY_STALE"))return NextResponse.json({error:"Security configuration changed since you opened it. Refresh and try again."},{status:409});
    return adminRpcFailure(error,"Unable to update security configuration.");
  }
  return NextResponse.json({data});
}
