import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Guest access required." }, { status: 403 });
  const body = z.object({ version: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  const id = z.string().uuid().safeParse((await params).id);
  if (!body.success || !id.success) return NextResponse.json({ error: "Refresh your request and try again." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("customer_withdraw_guest_request", { p_user_id: session.user.id, p_request_id: id.data, p_expected_version: body.data.version });
  if (error) return NextResponse.json({ error: error.message.includes("REQUEST_NOT_FOUND") ? "Request not found." : "This request has changed or is already being handled. Refresh the page or contact Front Desk." }, { status: error.message.includes("REQUEST_NOT_FOUND") ? 404 : 409 });
  return NextResponse.json({ data });
}
