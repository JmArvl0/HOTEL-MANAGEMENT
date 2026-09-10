import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { canReviewFrontDeskReports } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const schema = z.object({ decision: z.enum(["acknowledge", "return"]), note: z.string().trim().max(1000).optional(), version: z.coerce.number().int().positive() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canReviewFrontDeskReports(session.user.role as Role)) return NextResponse.json({ error: "Manager review authority required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A decision, current version, and (for returns) a note are required." }, { status: 400 });
  const { data, error } = await supabase.rpc("review_front_desk_report", {
    p_report_id: id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? "",
    p_expected_version: parsed.data.version,
    p_manager_user_id: session.user.id
  });
  if (error) {
    const messages: Record<string, string> = {
      REPORT_REVIEW_FORBIDDEN: "Only the Manager reviews daily operations reports.",
      REPORT_ALREADY_REVIEWED: "This report has already been reviewed.",
      REPORT_NOTE_REQUIRED: "Returning a report requires a note for Front Desk.",
      REPORT_DECISION_INVALID: "Choose acknowledge or return."
    };
    const key = Object.keys(messages).find((item) => error.message.includes(item));
    return NextResponse.json({ error: key ? messages[key] : "Unable to review this report." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 409 });
  }
  return NextResponse.json({ data: Array.isArray(data) ? data[0] : data });
}
