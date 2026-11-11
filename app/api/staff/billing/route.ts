import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hotelToday } from "@/lib/booking";
import { demoStore } from "@/lib/demo-store";
import { canCollectPayment } from "@/lib/permissions";
import { readAllRows } from "@/lib/read-all-rows";
import { attachBillingDeposits, type BillingFolio, type BillingSnapshot } from "@/lib/staff-billing";
import { supabase } from "@/lib/supabase";
import type { RecordItem } from "@/lib/types";

const STAY = "id,confirmation_number,guest_name,room_number,room_type,check_in,check_out,status,deposit_required";
const ACTIVITY = "id,purpose,method,amount,status,created_at,verified_at,submitted_at";
const INVOICE = "id,reservation_id,guest_name,amount,paid,balance,credit_balance,status";
const DEPOSIT = `${ACTIVITY},reservation_id,invoice_id,reference,proof_original_name,proof_size_bytes,proof_uploaded_at`;
type JoinedInvoice = { id: string; reservation: RecordItem | null; activity: RecordItem[] };
type JoinedDeposit = { id: string; reservation: RecordItem | null };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCollectPayment(session.user.role)) return NextResponse.json({ error: "Billing access required." }, { status: 403 });

  const today = hotelToday();
  const client = supabase;
  try {
    let folios: BillingFolio[];
    let pending: { payment: RecordItem; reservation: RecordItem | null }[];
    if (client) {
      const [invoices, deposits] = await Promise.all([
        readAllRows(() => client.from("invoices")
          .select(`${INVOICE},reservation:reservations(${STAY}),activity:payments(${ACTIVITY})`)
          .order("created_at", { ascending: false })
          .order("created_at", { referencedTable: "activity", ascending: false })
          .order("id", { referencedTable: "activity" })
          .limit(4, { referencedTable: "activity" }).returns<JoinedInvoice[]>()),
        readAllRows(() => client.from("payments")
          .select(`${DEPOSIT},reservation:reservations(${STAY})`)
          .eq("status", "pending_verification").eq("purpose", "reservation_deposit")
          .order("submitted_at", { ascending: true }).returns<JoinedDeposit[]>()),
      ]);
      folios = invoices.map(({ reservation, activity, ...invoice }) =>
        ({ key: invoice.id, invoice, reservation, activity, deposits: [] }));
      pending = deposits.map(({ reservation, ...payment }) => ({ reservation, payment }));
    } else {
      const reservationFor = (id: RecordItem[string]) =>
        demoStore.reservations.find(stay => stay.id === id) ?? null;
      folios = demoStore.invoices.map(invoice => ({
        key: invoice.id, invoice, reservation: reservationFor(invoice.reservation_id),
        deposits: [], activity: demoStore.payments.filter(payment => payment.invoice_id === invoice.id).slice(0, 4),
      }));
      pending = demoStore.payments
        .filter(payment => payment.status === "pending_verification" && payment.purpose === "reservation_deposit")
        .map(payment => ({ payment, reservation: reservationFor(payment.reservation_id) }));
    }
    const data: BillingSnapshot = { today, folios: attachBillingDeposits(folios, pending), demo: !client };
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load Billing." }, { status: 503 });
  }
}
