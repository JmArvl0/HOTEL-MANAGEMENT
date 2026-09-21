import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { touchSecuritySeen } from "@/lib/security-policy";

const unauthorized = () => NextResponse.json({ error: "Session expired." }, { status: 401 });

/** Non-mutating synchronization: background checks never extend the session. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || !session.user.id) return unauthorized();
  return NextResponse.json({ data: { expiresAt: session.sessionExpiresAt ?? null } }, { headers: { "Cache-Control": "no-store" } });
}

/** Called only after a real pointer/keyboard interaction in an authenticated shell. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || !session.user.id || !supabase) return unauthorized();
  const { data, error } = await supabase.from("user_accounts").select("last_seen_at").eq("id", session.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Unable to refresh session activity." }, { status: 503 });
  await touchSecuritySeen(session.user.id, typeof data.last_seen_at === "string" ? data.last_seen_at : null);
  const refreshed = await getServerSession(authOptions);
  if (!refreshed || refreshed.user.disabled || !refreshed.user.id) return unauthorized();
  return NextResponse.json({ data: { expiresAt: refreshed.sessionExpiresAt ?? null } }, { headers: { "Cache-Control": "no-store" } });
}
