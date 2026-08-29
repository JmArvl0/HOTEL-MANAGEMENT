import{getServerSession}from"next-auth";import{NextResponse}from"next/server";import{authOptions}from"@/lib/auth";import{supabase}from"@/lib/supabase";import type{Role}from"@/lib/types";
// Shared server-side guard for every financial route. Authorization is re-checked here and again
// inside each security-definer RPC, so hiding a control in the UI is never the only protection.
export type FinancialContext={actorId:string;role:Role;client:NonNullable<typeof supabase>};
export async function guardFinancial(allow:(role:Role)=>boolean,denial:string):Promise<FinancialContext|NextResponse>{
 const session=await getServerSession(authOptions);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const role=session.user.role as Role;if(!allow(role))return NextResponse.json({error:denial},{status:403});
 if(!supabase)return NextResponse.json({error:"Database unavailable."},{status:503});
 return{actorId:session.user.id,role,client:supabase};}
export const guardFailed=(value:FinancialContext|NextResponse):value is NextResponse=>value instanceof NextResponse;
export const invalid=(message:string)=>NextResponse.json({error:message},{status:400});
// RPC exceptions are surfaced as operator-readable messages only. Raw database text, provider
// references and secrets are never echoed back to the client.
export function rpcFailure(error:{message:string},map:Record<string,string>,fallback:string){
 const code=Object.keys(map).find(key=>error.message.includes(key));
 return NextResponse.json({error:code?map[code]:fallback},{status:/FORBIDDEN/.test(error.message)?403:409});}
