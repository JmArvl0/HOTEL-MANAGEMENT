import { NextResponse } from "next/server";
import { getSecurityPolicy } from "@/lib/security-policy";

// Unauthenticated by design: the login page needs to know whether to offer
// "Keep me signed in". Exposes ONE boolean — no durations, revisions, or
// audit detail. Safe to cache briefly at the edge.
export const dynamic = "force-dynamic";

export async function GET() {
  const policy = await getSecurityPolicy();
  return NextResponse.json({ data: { persistentSessionEnabled: policy.persistentSessionEnabled } });
}
