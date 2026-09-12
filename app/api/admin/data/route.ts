import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { guardAdmin,adminGuardFailed } from "@/lib/admin-route";
import { ROLE_CAPABILITIES } from "@/lib/admin";
import { migrationStatus, type SystemHealth } from "@/lib/system-health";

export async function GET(request:Request){const context=await guardAdmin();if(adminGuardFailed(context))return context;const section=new URL(request.url).searchParams.get("section")??"overview";const db=context.client;
 if(section==="users"){const{data,error}=await db.from("user_accounts").select("id,email,name,role,active,account_status,recovery_required,phone,department,employee_reference,auth_version,created_at,updated_at").order("created_at",{ascending:false});if(error)throw error;return NextResponse.json({data});}
 if(section==="rooms"){const{data,error}=await db.from("rooms").select("id,number,floor,type,wing,administrative_designation,administratively_active,configuration_version,status,housekeeping,created_at,updated_at").order("number");if(error)throw error;return NextResponse.json({data});}
 if(section==="room_types"){const{data,error}=await db.from("room_types").select("id,name,description,max_guests,beds,size_sqm,amenities,base_rate,active,version,created_at,updated_at").order("name");if(error)throw error;return NextResponse.json({data});}
 if(section==="policy"){const{data,error}=await db.from("hotel_operational_policies").select("*").eq("key","default").single();if(error)throw error;return NextResponse.json({data});}
 if(section==="roles")return NextResponse.json({data:ROLE_CAPABILITIES});
 if(section==="system")return NextResponse.json({data:await systemHealth(db)});
 const{data:audit}=await db.from("audit_logs").select("id,user_id,action,entity_type,entity_id,before_data,after_data,created_at").or("action.ilike.admin_%,action.eq.account_recovery_completed,action.eq.change_own_password").order("created_at",{ascending:false}).limit(section==="overview"?8:100);
 if(section==="audit"||section==="security")return NextResponse.json({data:audit??[]});
 const[{data:users},{data:types},{data:rooms},{data:tokens}]=await Promise.all([db.from("user_accounts").select("role,active,account_status,recovery_required"),db.from("room_types").select("active"),db.from("rooms").select("administratively_active"),db.from("account_recovery_tokens").select("id,used_at,expires_at")]);
 const all=users??[],roleCounts=Object.fromEntries(Object.keys(ROLE_CAPABILITIES).map(role=>[role,all.filter(user=>user.role===role).length]));const now=Date.now();return NextResponse.json({data:{metrics:{activeUsers:all.filter(x=>x.active).length,inactiveUsers:all.filter(x=>!x.active).length,staffAccounts:all.filter(x=>x.role!=="guest").length,guestAccounts:all.filter(x=>x.role==="guest").length,attention:all.filter(x=>x.account_status==="suspended"||x.recovery_required).length,roomTypes:(types??[]).length,inactiveRoomTypes:(types??[]).filter(x=>!x.active).length,inactiveRooms:(rooms??[]).filter(x=>!x.administratively_active).length,activeRecoveryTokens:(tokens??[]).filter(x=>!x.used_at&&new Date(x.expires_at).getTime()>now).length},roleCounts,recentAudit:audit??[]}});}

// System Health section: DB live/latency probe, recent activity counters, and
// local-vs-remote migration comparison (read via admin_read_migration_ledger,
// service-role only). Every probe is independent — a dead DB still returns a
// payload with db.live=false instead of a 500.
type AdminDbClient=Awaited<ReturnType<typeof guardAdmin>> extends infer C?C extends{client:infer T}?T:never:never;
async function systemHealth(db:AdminDbClient):Promise<SystemHealth>{
 const checkedAt=new Date().toISOString();const started=Date.now();
 let live=true,latencyMs:number|null=null,dbError:string|undefined;
 try{const{error}=await db.from("hotel_operational_policies").select("key").limit(1);if(error)throw new Error(error.message);latencyMs=Date.now()-started}
 catch(error){live=false;dbError=error instanceof Error?error.message:"Database probe failed."}
  let lastAuditAt:string|null=null,auditEvents24h=0,pendingApprovals=0,applied:SystemHealth["migrations"]["applied"]=[],appliedCount=0,localCount:number|null=null;
  // Storage probe is presence-only: operational/unavailable, never keys or URLs.
  let storage:NonNullable<SystemHealth["storage"]>={status:"unknown"};
  if(live){
   const since=new Date(Date.now()-24*60*60*1000).toISOString();
   const[{data:lastAudit},{count:recentCount},{count:pending},{data:ledger}]=await Promise.all([
    db.from("audit_logs").select("created_at").order("created_at",{ascending:false}).limit(1),
    db.from("audit_logs").select("id",{count:"exact",head:true}).gte("created_at",since),
    db.from("manager_approval_requests").select("id",{count:"exact",head:true}).eq("status","pending"),
    db.rpc("admin_read_migration_ledger")]);
   lastAuditAt=lastAudit?.[0]?String(lastAudit[0].created_at):null;
   auditEvents24h=recentCount??0;pendingApprovals=pending??0;
   applied=(ledger??[]).map((row:{version:unknown;name:unknown})=>({version:String(row.version),name:String(row.name)}));appliedCount=applied.length;
   try{const{error:storageError}=await db.storage.from("room-photos").list("",{limit:1});storage={status:storageError?"unavailable":"operational"}}catch{storage={status:"unknown"}}
  }
  try{localCount=(await readdir(path.join(process.cwd(),"supabase","migrations"))).filter(file=>file.endsWith(".sql")).length}catch{localCount=null}
  const status=migrationStatus(appliedCount,localCount);
  const behind=(localCount??0)-appliedCount;
  const issues:string[]=[];
  if(!live)issues.push("Database unreachable.");
  if(status==="remote_behind")issues.push(`${behind} local migration${behind===1?" is":"s are"} not applied to the live database.`);
  // Application facts from safe local sources only — Unknown when unavailable.
  const nodeEnv=process.env.NODE_ENV;
  const environment=nodeEnv==="production"?"Production":nodeEnv==="development"?"Development":"Unknown";
  let appVersion="Unknown";
  try{const pkg=JSON.parse(await readFile(path.join(process.cwd(),"package.json"),"utf8")) as {version?:unknown};if(typeof pkg.version==="string"&&pkg.version)appVersion=pkg.version}catch{appVersion="Unknown"}
  const commit=process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0,7)??null;
  // Email reports configuration presence only — never keys or delivery claims.
  const email:NonNullable<SystemHealth["email"]>={status:process.env.RESEND_API_KEY?"configured":"not_configured"};
  // Automations that really exist (vercel.json crons). Last run is untracked —
  // Unknown rather than invented.
  const automations:NonNullable<SystemHealth["automations"]>=[
   {name:"Guest reminders",schedule:"Daily 01:05 UTC",lastRun:null,status:"unknown"},
   {name:"Analytics generation",schedule:"Daily 18:35 UTC",lastRun:null,status:"unknown"},
  ];
  return{db:{live,latencyMs,checkedAt,error:dbError},activity:{lastAuditAt,auditEvents24h,pendingApprovals},migrations:{applied,appliedCount,localCount,status},application:{environment,version:appVersion,commit},storage,email,automations,deployment:{provider:"Vercel",status:"unknown"},domain:{status:"not_connected"},issues};
}
