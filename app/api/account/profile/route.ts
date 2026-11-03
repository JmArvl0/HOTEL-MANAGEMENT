import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
const schema = z.object({ name: z.string().trim().min(2).max(120), mobile: z.string().trim().max(30).default(""), address: z.string().trim().max(300).default(""), nationality: z.string().trim().max(80).default("") });
export async function GET() {
 const session = await getServerSession(authOptions);
 if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
 if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
 const [account, guests] = await Promise.all([supabase.from("user_accounts").select("name,email").eq("id", session.user.id).single(), supabase.from("guests").select("phone,address,nationality").eq("user_account_id", session.user.id).limit(2)]);
 if (account.error || guests.error) return NextResponse.json({ error: "Unable to load your profile. Please retry." }, { status: 503 });
 if ((guests.data?.length ?? 0) > 1) return NextResponse.json({ error: "Multiple guest profiles are linked to your account. Front Desk must resolve the link before editing." }, { status: 409 });
 const g = guests.data?.[0];
 return NextResponse.json({ ok: true, profile: { name: account.data.name, email: account.data.email, mobile: g?.phone ?? "", address: g?.address ?? "", nationality: g?.nationality ?? "" } });
}
export async function PATCH(request: Request) {
 const session = await getServerSession(authOptions);
 if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
 if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
 const parsed = schema.safeParse(await request.json().catch(() => null));
 if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile." }, { status: 400 });
 const v = parsed.data;
 const { data, error } = await supabase.rpc("hms_save_guest_profile", { p_actor: session.user.id, p_name: v.name, p_mobile: v.mobile, p_address: v.address, p_nationality: v.nationality });
 if (error) return NextResponse.json({ error: /AMBIGUOUS|LINK_REVIEW/.test(error.message) ? "Your guest profile link needs Front Desk review. No changes were saved." : "Unable to save your complete profile. Your entries are preserved; please retry." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 409 });
 return NextResponse.json({ ok: true, data });
}
