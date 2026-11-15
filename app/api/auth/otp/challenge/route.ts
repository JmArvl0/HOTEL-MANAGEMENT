import { publicJson } from "@/lib/server-errors";

import { type NextRequest } from "next/server";
import { maskEmail } from "@/lib/otp-email";
import { challengeStatus, pendingToken, readChallenge } from "@/lib/otp-flow";

/** Display metadata for the verify screen. Safe values only — never the code. */
export async function GET(request: NextRequest) {
  const pending = await pendingToken(request);
  if (!pending) return publicJson({ error: "Please sign in again to request a verification code." }, { status: 401 });
  const row = await readChallenge(pending.challengeId);
  const status = challengeStatus(row);
  if (status !== "valid")
    return publicJson({ error: status === "expired" ? "This verification code has expired. Request a new code." : "This code is no longer valid. Please sign in again.", status }, { status: 410 });
  return publicJson({
    data: { email: maskEmail(pending.email), expiresAt: row?.expires_at, resendAvailableAt: row?.resend_available_at },
  });
}
