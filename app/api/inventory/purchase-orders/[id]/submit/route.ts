import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ROLES, submitRoute } from "../../_actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ROLES.includes(session.user.role as never)) return NextResponse.json({ error: "Submission access required." }, { status: 403 });
  const parsed = z.object({ version: z.number().int().positive() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Version is required." }, { status: 400 });
  return submitRoute((await params).id, session.user.id, parsed.data.version);
}
