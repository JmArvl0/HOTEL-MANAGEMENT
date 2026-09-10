import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canViewStaffDuty } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { getStaffDutySnapshot } from "@/lib/staff-duty";
import type { Role } from "@/lib/types";

// Read-only operational supervision. Manager-only, enforced here at the route
// (sidebar visibility is never the gate); returns operationally relevant staff
// fields only — the underlying query selects name/role, never contact or
// account-security columns. Duty is derived from operational records — login
// is never a duty signal. Demo mode (no Supabase) serves the demo store.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewStaffDuty(session.user.role as Role)) return NextResponse.json({ error: "Staff duty access required." }, { status: 403 });
  try {
    return NextResponse.json({ data: await getStaffDutySnapshot(supabase) });
  } catch {
    return NextResponse.json({ error: "Unable to load staff duty." }, { status: 500 });
  }
}
