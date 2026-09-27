import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { guardAdmin,adminGuardFailed } from "@/lib/admin-route";
import { ROLE_CAPABILITIES } from "@/lib/admin";
import { isPaymentDestinationComplete, maskGcashNumber } from "@/lib/payment-destination";
import { automationRunStatus, deploymentBuildStatus, migrationStatus, pendingMigrations, type AutomationRunStatus, type SystemHealth } from "@/lib/system-health";
import { gatewayConfigured, resolveGatewaySecrets } from "@/lib/gateway";

export async function GET(request:Request){const context=await guardAdmin();if(adminGuardFailed(context))return context;const section=new URL(request.url).searchParams.get("section")??"overview";const db=context.client;
 if(section==="users"){const{data,error}=await db.from("user_accounts").select("id,email,name,role,active,account_status,recovery_required,phone,department,employee_reference,auth_version,created_at,updated_at").order("created_at",{ascending:false});if(error)throw error;return NextResponse.json({data});}
 if(section==="rooms"){const{data,error}=await db.from("rooms").select("id,number,floor,type,wing,administrative_designation,administratively_active,configuration_version,status,housekeeping,created_at,updated_at").order("number");if(error)throw error;return NextResponse.json({data});}
 if(section==="room_types"){const{data,error}=await db.from("room_types").select("id,name,description,max_guests,beds,size_sqm,amenities,base_rate,active,version,created_at,updated_at").order("name");if(error)throw error;return NextResponse.json({data});}
 if(section==="policy"){const{data,error}=await db.from("hotel_operational_policies").select("*").eq("key","default").single();if(error)throw error;return NextResponse.json({data});}
 if(section==="roles")return NextResponse.json({data:ROLE_CAPABILITIES});
  if(section==="password_resets"){const{data,error}=await db.from("password_reset_logs").select("id,user_id,email,ip_address,otp_verified,selfie_url,status,created_at,completed_at").order("created_at",{ascending:false}).limit(100);if(error){if(error.code==="42P01")return NextResponse.json({data:[]});throw error}return NextResponse.json({data:(data??[]).map(row=>{const r=row as Record<string,unknown>;const{selfie_url,...rest}=r;return{...rest,has_selfie:typeof selfie_url==="string"&&selfie_url.length>0}})});}
 if(section==="system")return NextResponse.json({data:await systemHealth(db)});
 const{data:audit}=await db.from("audit_logs").select("id,user_id,action,entity_type,entity_id,before_data,after_data,created_at").or("action.ilike.admin_%,action.ilike.security_%,action.ilike.otp_%,action.ilike.smtp_%,action.ilike.auth_%,action.eq.account_recovery_completed,action.eq.change_own_password").order("created_at",{ascending:false}).limit(section==="overview"?8:100);
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
  // Last-run facts for the scheduled jobs, read from the table each job already
  // writes — no separate run ledger. Kept null/unknown until a row exists.
  let reminderRun:{at:string|null;status:AutomationRunStatus}={at:null,status:"unknown"};
  let modelRun:{at:string|null;status:AutomationRunStatus}={at:null,status:"unknown"};
  // Storage probe is presence-only: operational/unavailable, never keys or URLs.
  let storage:NonNullable<SystemHealth["storage"]>={status:"unknown"};
  if(live){
   const since=new Date(Date.now()-24*60*60*1000).toISOString();
   const[{data:lastAudit},{count:recentCount},{count:pending},{data:ledger},{data:lastReminder},{data:lastModelRun}]=await Promise.all([
    db.from("audit_logs").select("created_at").order("created_at",{ascending:false}).limit(1),
    db.from("audit_logs").select("id",{count:"exact",head:true}).gte("created_at",since),
    db.from("manager_approval_requests").select("id",{count:"exact",head:true}).eq("status","pending"),
    db.rpc("admin_read_migration_ledger"),
    // Guest reminders only insert on an actual send (unique per reservation+kind),
    // so the newest row is the last SEND — the label in the view says so.
    db.from("guest_reminder_deliveries").select("sent_at,status").order("sent_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("analytics_model_runs").select("generated_at,status").order("generated_at",{ascending:false}).limit(1).maybeSingle()]);
   lastAuditAt=lastAudit?.[0]?String(lastAudit[0].created_at):null;
   auditEvents24h=recentCount??0;pendingApprovals=pending??0;
    applied=(ledger??[]).map((row:{version:unknown;name:unknown;applied_at?:unknown;approximate?:unknown})=>({version:String(row.version),name:String(row.name),appliedAt:typeof row.applied_at==="string"?row.applied_at:null,approximate:row.approximate===true}));appliedCount=applied.length;
   reminderRun={at:lastReminder?.sent_at?String(lastReminder.sent_at):null,status:automationRunStatus(lastReminder?.status)};
   modelRun={at:lastModelRun?.generated_at?String(lastModelRun.generated_at):null,status:automationRunStatus(lastModelRun?.status)};
   try{const{error:storageError}=await db.storage.from("room-photos").list("",{limit:1});storage={status:storageError?"unavailable":"operational"}}catch{storage={status:"unknown"}}
  }
   try{localCount=(await readdir(path.join(process.cwd(),"supabase","migrations"))).filter(file=>file.endsWith(".sql")).length}catch{localCount=null}
  const status=migrationStatus(appliedCount,localCount);
  // Pending filenames: local files whose version is absent from the ledger.
  let pending:SystemHealth["migrations"]["pending"]=[];
  try{
    const files=(await readdir(path.join(process.cwd(),"supabase","migrations"))).filter(file=>file.endsWith(".sql")).sort();
    const local=files.map(file=>{const m=file.match(/^(\d+)_(.+)\.sql$/);return{version:m?.[1]??file,name:(m?.[2]??file).replace(/\.sql$/,""),appliedAt:null}});
    pending=pendingMigrations(local,applied);
  }catch{pending=[]}
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
  // Automations that really exist (vercel.json crons). Last run now comes from
  // the table each job writes, so it is a real timestamp or an honest "not yet
  // run" — never invented. The labels name what the timestamp means: the
  // reminder ledger records sends, not attempts.
  const automations:NonNullable<SystemHealth["automations"]>=[
   {name:"Guest reminders",schedule:"Daily 01:05 UTC",lastRun:reminderRun.at,lastRunLabel:"Last send",lastStatus:reminderRun.status},
   {name:"Analytics generation",schedule:"Daily 18:35 UTC",lastRun:modelRun.at,lastRunLabel:"Last run",lastStatus:modelRun.status},
  ];
  // Payment configuration health: Owner-controlled business values (masked,
  // read-only) plus the technical integration status System Administration
  // maintains. No secrets exist in this payload by construction.
  let payments:NonNullable<SystemHealth["payments"]>|undefined;
  if(live){
   try{
    const{data:policy}=await db.from("hotel_operational_policies").select("gcash_account_name,gcash_mobile_number,gcash_qr_storage_path,gcash_enabled,updated_at").eq("key","default").maybeSingle();
    const row=(policy??{}) as Record<string,unknown>;
    const qrPath=typeof row.gcash_qr_storage_path==="string"?row.gcash_qr_storage_path:"";
    const mobile=typeof row.gcash_mobile_number==="string"?row.gcash_mobile_number:null;
    const name=typeof row.gcash_account_name==="string"?row.gcash_account_name:"";
    const enabled=Boolean(row.gcash_enabled);
    let qrStorage:NonNullable<SystemHealth["payments"]>["qrStorage"]="Unknown";
    if(qrPath){try{const listed=await db.storage.from("payment-qr").list("gcash");qrStorage=Array.isArray(listed.data)&&listed.data.some((object)=>`gcash/${object.name}`===qrPath)?"Healthy":"Unavailable"}catch{qrStorage="Unknown"}}
    const{data:latest}=await db.from("audit_logs").select("created_at,user_id").eq("entity_type","hotel_payment_destination").order("created_at",{ascending:false}).limit(1).maybeSingle();
    let configuredBy:string|null=null;
    if(latest?.user_id){const{data:actor}=await db.from("user_accounts").select("name,role").eq("id",String(latest.user_id)).maybeSingle();configuredBy=actor?`${actor.name??"Unknown"} (${actor.role==="admin"?"System Administrator":actor.role})`:null}
    payments={status:enabled?"Active":"Inactive",accountName:name||"Not configured",mobileNumber:maskGcashNumber(mobile),qrImage:qrPath?"Configured":"Missing",configuredBy,lastUpdated:latest?.created_at?String(latest.created_at):row.updated_at?String(row.updated_at):null,qrStorage,configuration:!enabled?"Disabled":isPaymentDestinationComplete({accountName:name||null,mobileNumber:mobile,qrStoragePath:qrPath||null,enabled})?"Complete":"Incomplete"};
   }catch{payments=undefined}
  }
  // PayMongo gateway presence + mode, derived server-side from the secret-key
  // prefix. The key itself never leaves the server — only the mode label.
  const { secretKey: gatewayKey } = resolveGatewaySecrets();
  const gateway: NonNullable<SystemHealth["gateway"]> = !gatewayConfigured() ? { status: "not_configured" }
    : gatewayKey.startsWith("sk_live_") ? { status: "listening_live" } : { status: "listening_test" };
  // Recent audit rows for the Audit Trail tab. Safe columns only, capped —
  // payloads and secrets are never selected. Actors resolve through one
  // batched user lookup (same pattern as the payment destination above).
  let recentProbes: NonNullable<SystemHealth["recentProbes"]> = [];
  if (live) {
    try {
      const { data: probes } = await db.from("audit_logs").select("action,entity_type,created_at,user_id").order("created_at", { ascending: false }).limit(10);
      const rows = probes ?? [];
      const actorIds = [...new Set(rows.map((row) => String((row as { user_id?: unknown }).user_id ?? "")).filter(Boolean))];
      const actors = new Map<string, string>();
      if (actorIds.length) {
        const { data: people } = await db.from("user_accounts").select("id,name,role").in("id", actorIds);
        for (const person of (people ?? []) as { id: unknown; name: unknown; role: unknown }[]) {
          actors.set(String(person.id), `${String(person.name ?? "Unknown")} (${person.role === "admin" ? "System Administrator" : String(person.role ?? "unknown")})`);
        }
      }
      recentProbes = rows.map((row: { action: unknown; entity_type: unknown; created_at: unknown; user_id?: unknown }) => ({ action: String(row.action ?? "—"), entity: String(row.entity_type ?? "—"), at: String(row.created_at ?? ""), actor: typeof row.user_id === "string" && row.user_id ? (actors.get(row.user_id) ?? "Unknown") : null }));
    } catch { recentProbes = []; }
  }
  const deployment = await deploymentFacts();
     return{db:{live,latencyMs,checkedAt,error:dbError},activity:{lastAuditAt,auditEvents24h,pendingApprovals},migrations:{applied,appliedCount,localCount,status,pending},application:{environment,version:appVersion,commit},storage,email,automations,gateway,recentProbes,deployment,domain:{status:"not_connected"},payments,issues};
}

/**
 * Deployment facts, two tiers — the card never reports a bare "Unknown" again.
 *
 * Tier 1 ("environment") needs no configuration: Vercel injects the running
 * deployment's own identifiers into the function, so the environment, short
 * commit, branch and deployment id reported here are the ones actually serving
 * this request. Public identifiers only.
 *
 * Tier 2 ("api") asks the Vercel API for the newest deployment's readyState when
 * VERCEL_TOKEN is configured. That is the only real "did the last build succeed"
 * signal — a broken latest build is invisible to tier 1. A missing token is not
 * an error and produces no user-facing failure: the card just reports tier 1.
 * Any API or parse failure leaves buildStatus "unknown" rather than guessing.
 */
async function deploymentFacts():Promise<NonNullable<SystemHealth["deployment"]>>{
 const sha=process.env.VERCEL_GIT_COMMIT_SHA??process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA??"";
 const facts:NonNullable<SystemHealth["deployment"]>={
  provider:"Vercel",
  environment:process.env.VERCEL_ENV??null,
  commit:sha?sha.slice(0,7):null,
  branch:process.env.VERCEL_GIT_COMMIT_REF??null,
  deploymentId:process.env.VERCEL_DEPLOYMENT_ID??null,
  buildStatus:"unknown",
  source:process.env.VERCEL_ENV?"environment":"none",
 };
 const token=process.env.VERCEL_TOKEN?.trim();
 const projectId=process.env.VERCEL_PROJECT_ID?.trim()||"prj_zaDNKEZdklMfWPtWVAqddQIT5Amk";
 const teamId=process.env.VERCEL_TEAM_ID?.trim()||"team_Nm9HqLXb3cZzz7b4xx3abgnT";
 if(!token)return facts;
 try{
  const response=await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&limit=1`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
  if(!response.ok)return facts;
  const body=await response.json() as {deployments?:{readyState?:unknown;url?:unknown;meta?:{githubCommitRef?:unknown}}[]};
  const newest=body.deployments?.[0];
  const mapped=deploymentBuildStatus(newest?.readyState);
  if(mapped==="unknown")return facts;
  return{...facts,buildStatus:mapped,source:"api",branch:typeof newest?.meta?.githubCommitRef==="string"?newest.meta.githubCommitRef:facts.branch};
 }catch{return facts}
}
