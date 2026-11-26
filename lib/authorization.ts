import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isRole } from "@/lib/permissions";
import { publicJson } from "@/lib/server-errors";
import type { Role } from "@/lib/types";

export async function getAuthenticatedSession() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  return user?.id && !user.disabled && !user.otpPending && isRole(user.role) ? session : null;
}

export async function requirePermission(allow: (role: Role) => boolean, denial: string) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return { error: publicJson({ error: "Please sign in to continue." }, { status: 401 }) };
  }
  if (!allow(session.user.role)) {
    return { error: publicJson({ error: denial }, { status: 403 }) };
  }
  return { session };
}
