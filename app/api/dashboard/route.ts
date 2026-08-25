import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { databaseMode, getDashboard } from "@/lib/data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ data: await getDashboard(), mode: databaseMode }); }
  catch { return NextResponse.json({ error: "Unable to load dashboard" }, { status: 500 }); }
}
