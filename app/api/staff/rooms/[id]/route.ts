import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { getRoomDetail } from "@/lib/staff-data";

// Read-only room dossier. GET only — room readiness itself changes exclusively
// through the housekeeping, maintenance, and front-desk workflows.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(session.user.role, "rooms")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const record = await getRoomDetail((await params).id, session.user.role);
    return record ? NextResponse.json({ data: record }) : NextResponse.json({ error: "Room not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to load room details" }, { status: 500 });
  }
}
