import { publicJson } from "@/lib/server-errors";
import{NextResponse}from"next/server";import{supabase}from"@/lib/supabase";import type{Role}from"@/lib/types";
import { requirePermission } from "@/lib/authorization";
// Shared server-side guard for every financial route. Authorization is re-checked here and again
// inside each security-definer RPC, so hiding a control in the UI is never the only protection.
export type FinancialContext={actorId:string;role:Role;client:NonNullable<typeof supabase>};
export async function guardFinancial(allow:(role:Role)=>boolean,denial:string):Promise<FinancialContext|NextResponse>{
 const result = await requirePermission(allow, denial);
 if (result.error) return result.error;
 if(!supabase)return publicJson({error:"This service is temporarily unavailable. Please try again shortly."},{status:503});
 return{actorId:result.session.user.id,role:result.session.user.role,client:supabase};}
export const guardFailed=(value:FinancialContext|NextResponse):value is NextResponse=>value instanceof NextResponse;
export const invalid=(message:string)=>publicJson({error:message},{status:400});
// RPC exceptions are surfaced as operator-readable messages only. Raw database text, provider
// references and secrets are never echoed back to the client.
export function rpcFailure(error:{message:string},map:Record<string,string>,fallback:string){
 const code=Object.keys(map).find(key=>error.message.includes(key));
 return publicJson({error:code?map[code]:fallback,code:code??"OPERATION_UNCONFIRMED",outcome:code?"rejected":"unknown"},{status:/FORBIDDEN/.test(error.message)?403:409});}
