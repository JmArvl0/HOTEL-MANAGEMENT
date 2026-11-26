import { publicJson } from "@/lib/server-errors";
import{NextResponse}from"next/server";import{supabase}from"@/lib/supabase";import type{Role}from"@/lib/types";
import { requirePermission } from "@/lib/authorization";
export type ManagerContext={actorId:string;role:Role;client:NonNullable<typeof supabase>};
export async function guardManager(allow: (role: Role) => boolean, denial: string): Promise<ManagerContext | NextResponse> {
  const result = await requirePermission(allow, denial);
  if (result.error) return result.error;
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  return { actorId: result.session.user.id, role: result.session.user.role, client: supabase };
}
export const managerGuardFailed=(value:ManagerContext|NextResponse):value is NextResponse=>value instanceof NextResponse;
export function managerRpcFailure(error:{message:string},map:Record<string,string>,fallback:string){const code=Object.keys(map).find(key=>error.message.includes(key));return publicJson({error:code?map[code]:fallback,code:code??"OPERATION_UNCONFIRMED",outcome:code?"rejected":"unknown"},{status:/FORBIDDEN/.test(error.message)?403:409})}
