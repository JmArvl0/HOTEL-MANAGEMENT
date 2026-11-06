import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  let actor: string | null = null;
  if (new URL(request.url).searchParams.get("preview") === "1") { const context = await guardAdmin(); if (adminGuardFailed(context)) return context; actor = context.actorId; }
  if (!supabase) return new NextResponse(null, { status: 503 });
  const { data, error } = await supabase.rpc("website_image_read", { p_id: id, p_actor: actor });
  if (error || !data) return new NextResponse(null, { status: error ? 503 : 404 });
  const result = await supabase.storage.from("location-images").download(data.storage_key);
  if (result.error || !result.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(result.data, { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
}
