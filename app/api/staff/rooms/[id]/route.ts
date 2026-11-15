import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { getRoomDetail } from "@/lib/staff-data";

// Read-only room dossier. GET only — room readiness itself changes exclusively
// through the housekeeping, maintenance, and front-desk workflows.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!canAccess(session.user.role, "rooms")) return publicJson({ error: "You don't have permission to perform this action. Ask your system administrator if you need access." }, { status: 403 });
  try {
    const record = await getRoomDetail((await params).id, session.user.role);
    return record ? publicJson({ data: record }) : publicJson({ error: "Room not found" }, { status: 404 });
  } catch {
    return publicJson({ error: "Unable to load room details" }, { status: 500 });
  }
}
