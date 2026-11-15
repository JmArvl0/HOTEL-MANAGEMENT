import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { databaseMode, getDashboard } from "@/lib/data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.disabled || session.user.role === "guest" || session.user.role === "admin" || session.user.role === "owner") return publicJson({ error: "Please sign in with an authorized staff account to continue." }, { status: 403 });
  try { return publicJson({ data: await getDashboard(session.user.role, session.user.id), mode: databaseMode }); }
  catch { return publicJson({ error: "We couldn't load the dashboard. Please try again." }, { status: 500 }); }
}
