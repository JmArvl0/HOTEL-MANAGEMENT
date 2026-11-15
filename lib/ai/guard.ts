import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/types";

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
