import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canViewGuestContact } from "@/lib/permissions";
import { getStaffGuestProfile } from "@/lib/staff-data";

// Read-only consolidated guest profile. GET only — guest-facing data changes
// exclusively through the booking and front-desk workflows.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewGuestContact(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const record = await getStaffGuestProfile((await params).id, session.user.role);
    return record ? NextResponse.json({ data: record }) : NextResponse.json({ error: "Guest not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to load guest profile" }, { status: 500 });
  }
}
