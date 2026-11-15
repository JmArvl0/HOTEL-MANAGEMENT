import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { numericInput } from "@/lib/input-validation";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { canReviewFrontDeskReports } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const schema = z.object({ decision: z.enum(["acknowledge", "return"]), note: z.string().trim().max(1000).optional(), version: numericInput(z.number().int().positive()) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!canReviewFrontDeskReports(session.user.role as Role)) return publicJson({ error: "Manager review authority required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return publicJson({ error: "Reopen the report and try again." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Choose a review decision and add a note if returning the report. If these details are complete, reopen the latest report." }), { status: 400 });
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
    return publicJson({ error: key ? messages[key] : "Unable to review this report." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 409 });
  }
  return publicJson({ data: Array.isArray(data) ? data[0] : data });
}
