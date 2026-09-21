import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maskEmail } from "@/lib/otp-email";
import { challengeStatus, pendingToken, readChallenge } from "@/lib/otp-flow";

/** Display metadata for the verify screen. Safe values only — never the code. */
export async function GET(request: NextRequest) {
  const pending = await pendingToken(request);
  if (!pending) return NextResponse.json({ error: "Verification session not found. Sign in again." }, { status: 401 });
  const row = await readChallenge(pending.challengeId);
  const status = challengeStatus(row);
  if (status !== "valid")
    return NextResponse.json({ error: status === "expired" ? "This verification code has expired." : "This code is no longer valid.", status }, { status: 410 });
  return NextResponse.json({
    data: { email: maskEmail(pending.email), expiresAt: row?.expires_at, resendAvailableAt: row?.resend_available_at },
  });
}
