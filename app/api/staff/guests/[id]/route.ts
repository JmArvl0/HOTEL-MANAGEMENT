import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { canViewGuestContact } from "@/lib/permissions";
import { getStaffGuestProfile } from "@/lib/staff-data";

// Read-only consolidated guest profile. GET only — guest-facing data changes
// exclusively through the booking and front-desk workflows.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!canViewGuestContact(session.user.role)) return publicJson({ error: "You don't have permission to perform this action. Ask your system administrator if you need access." }, { status: 403 });
  try {
    const record = await getStaffGuestProfile((await params).id, session.user.role);
    return record ? publicJson({ data: record }) : publicJson({ error: "Guest not found" }, { status: 404 });
  } catch {
    return publicJson({ error: "Unable to load guest profile" }, { status: 500 });
  }
}
