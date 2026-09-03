import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { databaseMode, getDashboard } from "@/lib/data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.disabled || session.user.role === "guest" || session.user.role === "admin" || session.user.role === "owner") return NextResponse.json({ error: "Operational staff access required" }, { status: 403 });
  try { return NextResponse.json({ data: await getDashboard(session.user.role), mode: databaseMode }); }
  catch { return NextResponse.json({ error: "Unable to load dashboard" }, { status: 500 }); }
}
