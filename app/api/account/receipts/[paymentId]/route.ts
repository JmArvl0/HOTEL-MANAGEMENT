import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getCustomerReceipt } from "@/lib/customer";

/**
 * The single authorized door to a customer receipt.
 *
 * The preview modal reads from here and nowhere else, so ownership and
 * eligibility are decided once, server-side — not inferred from which buttons
 * happened to render. Changing the id in the URL is therefore useless.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });

  const { paymentId } = await params;
  try {
    const data = await getCustomerReceipt(session.user.id, paymentId);
    // Another guest's payment, an unsettled one and a refund all answer the same
    // way as a missing one — the response is not a probing oracle.
    if (!data) return publicJson({ error: "Receipt not found." }, { status: 404 });
    return publicJson({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return publicJson({ error: "Unable to load this receipt." }, { status: 500 });
  }
}
