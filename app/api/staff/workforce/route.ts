import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readWorkforceJson, workforceConfiguration } from "@/lib/workforce-contract";

const readers = new Set(["owner", "admin", "manager", "front_desk", "housekeeping", "maintenance", "accounting"]);
async function context(manage = false) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!readers.has(session.user.role) || manage && !["owner", "admin"].includes(session.user.role)) return publicJson({ error: "Workforce access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "Workforce data unavailable." }, { status: 503 });
  return { actor: session.user.id, client: supabase };
}
export async function GET() {
  const ctx = await context();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.client.rpc("hotel_workforce_snapshot", { p_actor: ctx.actor });
  if (error) return publicJson({ error: "Workforce data unavailable. Try again or contact the System Administrator." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 503 });
  return publicJson({ data: { ...data, receiverConfigured: Boolean(workforceConfiguration()) } }, { headers: { "Cache-Control": "no-store" } });
}
const reason = z.string().trim().min(3).max(500);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), sourceSystem: z.string().trim().min(1).max(120), propertyId: z.string().trim().min(1).max(120), autoAssignCheckout: z.boolean(), expectedVersion: z.number().int().positive(), reason }).strict(),
  z.object({ action: z.literal("link"), userId: z.string().uuid(), employeeId: z.string().trim().min(1).max(120), reason }).strict(),
  z.object({ action: z.literal("unlink"), userId: z.string().uuid(), linkId: z.string().uuid(), reason }).strict(),
]);
export async function POST(request: Request) {
  const ctx = await context(true);
  if (ctx instanceof NextResponse) return ctx;
  let input: unknown;
  try { input = await readWorkforceJson(request); }
  catch (error) { return publicJson({ error: "Please check the details and try again." }, { status: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  const result = actionSchema.safeParse(input);
  if (!result.success) return publicJson(validationBody(result.error, { error: "Check the employee, integration settings, and reason." }), { status: 422 });
  const v = result.data;
  if (v.action === "configure" && v.autoAssignCheckout && !workforceConfiguration()) return publicJson({ error: "Configure the Workforce receiver before enabling automatic assignment." }, { status: 409 });
  const { data, error } = v.action === "configure"
    ? await ctx.client.rpc("hotel_configure_workforce", { p_actor: ctx.actor, p_source: v.sourceSystem, p_property: v.propertyId, p_auto: v.autoAssignCheckout, p_version: v.expectedVersion, p_reason: v.reason })
    : await ctx.client.rpc("hotel_link_workforce_employee", { p_actor: ctx.actor, p_user: v.userId, p_employee: v.action === "link" ? v.employeeId : null, p_link: v.action === "unlink" ? v.linkId : null, p_reason: v.reason });
  if (error) return publicJson({ error: /CONFLICT|unique|duplicate/.test(error.message) ? "The mapping or settings changed. Refresh and review the existing employee links." : "Unable to save. Check the account, employee link, and settings." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 409 });
  return publicJson({ data }, { headers: { "Cache-Control": "no-store" } });
}
