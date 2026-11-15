import { publicJson } from "@/lib/server-errors";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
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
  if (request.body) {
    const mime = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (mime !== "application/json" && mime !== "multipart/form-data") {
      return publicJson({ error: "We couldn't read this request. Refresh the page and try again." }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
