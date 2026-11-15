import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { ROLES, cancelRoute } from "../../_actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!ROLES.includes(session.user.role as never)) return publicJson({ error: "Cancellation access required." }, { status: 403 });
  return cancelRoute((await params).id, session.user.id, await request.json());
}
