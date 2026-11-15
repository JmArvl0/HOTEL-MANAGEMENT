import { publicJson } from "@/lib/server-errors";

import { getSecurityPolicy } from "@/lib/security-policy";

// Unauthenticated by design: the login page needs to know whether to offer
// "Keep me signed in". Exposes TWO booleans — no durations, revisions, or
// audit detail. Safe to cache briefly at the edge.
export const dynamic = "force-dynamic";

export async function GET() {
  const policy = await getSecurityPolicy();
  return publicJson({ data: { persistentSessionEnabled: policy.persistentSessionEnabled, cookieEnabled: policy.cookieEnabled } });
}
