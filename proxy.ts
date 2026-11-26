import { publicJson } from "@/lib/server-errors";
import { NextResponse, type NextRequest } from "next/server";

async function hasPayload(request: NextRequest) {
  if (!request.body) return false;

  // Next's Node adapter may attach a stream even when the browser sent no bytes.
  // Inspect a clone so handlers can still consume their own request body.
  const reader = request.clone().body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) return true;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function proxy(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (/^\/api\/auth\/(?:signin|signout|callback|csrf|providers|session|error|verify-request)(?:\/|$)/.test(path) || path.startsWith("/api/webhooks/") || path.startsWith("/api/integrations/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const configured = process.env.NEXTAUTH_URL;
  const trustedOrigins = [request.nextUrl.origin, configured ? URL.parse(configured)?.origin : undefined];
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && !trustedOrigins.includes(origin))) {
    return publicJson({ error: "Please reopen the Haven website and try this action again." }, { status: 403 });
  }
  const mime = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mime !== "application/json" && mime !== "multipart/form-data" && await hasPayload(request)) {
    return publicJson({ error: "We couldn't read this request. Refresh the page and try again." }, { status: 415 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
