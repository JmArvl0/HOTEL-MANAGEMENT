import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ROLES, submitRoute } from "../../_actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!ROLES.includes(session.user.role as never)) return publicJson({ error: "Submission access required." }, { status: 403 });
  const parsed = z.object({ version: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Reopen the latest record before continuing." }), { status: 400 });
  return submitRoute((await params).id, session.user.id, parsed.data.version);
}
