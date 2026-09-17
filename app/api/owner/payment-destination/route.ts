import { NextResponse } from "next/server";
import { guardOwner, ownerGuardFailed } from "@/lib/owner-route";
import { normalizeGcashNumber, paymentDestinationSchema } from "@/lib/payment-destination";

const QR_STAGED = /^gcash\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export async function PATCH(request: Request) {
  const context = await guardOwner();
  if (ownerGuardFailed(context)) return context;
  const parsed = paymentDestinationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the payment destination." }, { status: 400 });
  const value = parsed.data;
  const mobile = normalizeGcashNumber(value.mobileNumber);
  try {
    const { data: current } = await context.client.from("hotel_operational_policies")
      .select("gcash_qr_storage_path").eq("key", "default").maybeSingle();
    const { data, error } = await context.client.rpc("owner_update_payment_destination", {
      p_account_name: value.accountName.trim(),
      p_mobile_number: mobile,
      p_qr_storage_path: value.qrStoragePath,
      p_enabled: value.enabled,
      p_reason: value.reason,
      p_expected_version: value.version,
      p_actor_user_id: context.actorId,
    });
    if (error) {
      const message = error.message;
      if (message.includes("PAYMENT_DESTINATION_OWNER_ONLY")) return NextResponse.json({ error: "Owner authority required." }, { status: 403 });
      if (message.includes("POLICY_STALE")) return NextResponse.json({ error: "The configuration changed since you opened it. Refresh and try again." }, { status: 409 });
      if (message.includes("INVALID_PAYMENT_DESTINATION")) return NextResponse.json({ error: "Account name, a valid 09XXXXXXXXX number, and the official QR are required while GCash deposits are enabled." }, { status: 400 });
      return NextResponse.json({ error: "Unable to update the payment destination." }, { status: 409 });
    }
    // Retire the previous QR object once the new destination is active — a
    // replaced QR must never stay accidentally live. Best-effort cleanup.
    const previous = (current as { gcash_qr_storage_path?: unknown } | null)?.gcash_qr_storage_path;
    if (typeof previous === "string" && QR_STAGED.test(previous) && previous !== value.qrStoragePath) {
      void context.client.storage.from("payment-qr").remove([previous]);
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to update the payment destination." }, { status: 500 });
  }
}
