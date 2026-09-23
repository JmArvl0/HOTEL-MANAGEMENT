import { NextResponse } from "next/server";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";

/**
 * Admin-only identity-selfie inspection. Returns a 60-second signed URL for
 * the staged selfie — the storage path itself is never exposed to the
 * browser, and the image bytes never pass through this route's JSON.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardAdmin();
  if (adminGuardFailed(context)) return context;
  const { id } = await params;
  const { data } = await context.client.from("password_reset_logs")
    .select("selfie_url").eq("id", id).maybeSingle();
  const path = (data as { selfie_url?: unknown } | null)?.selfie_url;
  if (typeof path !== "string" || !path.startsWith("recovery-selfies/"))
    return NextResponse.json({ error: "No identity selfie is attached to this reset attempt." }, { status: 404 });
  const { data: signed, error } = await context.client.storage.from("recovery-selfies").createSignedUrl(path, 60);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "The selfie could not be loaded." }, { status: 500 });
  return NextResponse.json({ data: { url: signed.signedUrl } });
}
