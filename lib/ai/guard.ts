import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAuthenticatedSession } from "@/lib/authorization";
import type { Role } from "@/lib/types";
import { AI_MODULE_METADATA, type AiModuleId } from "./module-metadata";

/**
 * Server-side AI RBAC. Manager gets broad operational assistance; Owner gets
 * executive assistance; Admin per its administrative authority. No AI access
 * for Front Desk, Housekeeping, Maintenance, Accounting or Guests — enforced
 * here, on the server, before any data is fetched or any Gemini call is made.
 */
export const AI_ROLES: Role[] = ["manager", "owner", "admin"];

export async function guardAiSession(): Promise<{ userId: string; role: Role } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!AI_ROLES.includes(session.user.role as Role)) return publicJson({ error: "AI assistant access required." }, { status: 403 });
  return { userId: session.user.id, role: session.user.role as Role };
}

export const aiGuardFailed = (value: { userId: string; role: Role } | NextResponse): value is NextResponse => value instanceof NextResponse;

/** Module-scoped guard. Checks module existence, enabled flag, and role membership before any data fetch or Gemini call. */
export interface ModuleSession { userId: string; role: Role; module: { id: AiModuleId; metadata: typeof AI_MODULE_METADATA[AiModuleId] } }

export async function guardModuleAiSession(moduleId: string): Promise<ModuleSession | NextResponse> {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const metadata = AI_MODULE_METADATA[moduleId as AiModuleId];
  if (!Object.hasOwn(AI_MODULE_METADATA, moduleId) || !metadata.enabled) return NextResponse.json({ error: "Module not found" }, { status: 404 });
  if (!metadata.roles.includes(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { userId: session.user.id, role: session.user.role as Role, module: { id: moduleId as AiModuleId, metadata } };
}

export const moduleGuardFailed = (value: ModuleSession | NextResponse): value is NextResponse => value instanceof NextResponse;
