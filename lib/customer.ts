import { supabase } from "@/lib/supabase";
import { calculateNights, hotelToday } from "@/lib/booking";
import { inclusiveTaxBreakdown, ratePercent } from "@/lib/accounting";
import { getOperationalPolicy } from "@/lib/hotel-policy";
import { buildReceiptDocument, receiptEligible, type ReceiptDocument } from "@/lib/receipt";
import type { CustomerNotification } from "@/lib/notifications";
import { readAllRows } from "@/lib/read-all-rows";

export type ReservationCategory = "current" | "upcoming" | "past" | "cancelled";
const STATUS_LABELS: Record<string,string> = {
  checked_in:"Checked in",checked_out:"Checked out",in_progress:"In progress",no_show:"No-show",
  manual_bank_transfer:"Bank transfer",manual_gcash:"GCash",manual_refund:"Refund",
  partial:"Partially paid",deposit:"Deposit paid",reservation_deposit:"Reservation deposit",stay_payment:"Stay payment",refund:"Refund",
  pending_verification:"Awaiting verification",refund_pending:"Refund pending",partial_refund:"Partially refunded",refunded:"Refunded",
  unpaid:"Unpaid",paid:"Paid",failed:"Failed",expired:"Expired"
};
export const friendlyStatus=(value:string)=>STATUS_LABELS[value]??value.replaceAll("_"," ").replace(/^./,(char)=>char.toUpperCase());
export { formatStayDate } from "@/lib/format";
export function formatStayRange(checkIn:string,checkOut:string){const start=new Date(`${checkIn}T00:00:00Z`),end=new Date(`${checkOut}T00:00:00Z`);const sameYear=start.getUTCFullYear()===end.getUTCFullYear();const first=new Intl.DateTimeFormat("en-PH",{month:"short",day:"numeric",...(sameYear?{}:{year:"numeric"}),timeZone:"UTC"}).format(start);const last=new Intl.DateTimeFormat("en-PH",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(end);return `${first} - ${last}`}
export function reservationCategory(reservation:{status:string;check_in:string;check_out:string},today=hotelToday()):ReservationCategory{if(["cancelled","no_show"].includes(reservation.status))return"cancelled";if(reservation.status==="checked_in")return"current";if(reservation.status==="checked_out"||reservation.check_out<=today)return"past";return"upcoming"}
export function groupReservations<T extends{status:string;check_in:string;check_out:string}>(reservations:T[],today=hotelToday()){const groups:Record<ReservationCategory,T[]>={current:[],upcoming:[],past:[],cancelled:[]};for(const reservation of reservations)groups[reservationCategory(reservation,today)].push(reservation);groups.current.sort((a,b)=>a.check_out.localeCompare(b.check_out));groups.upcoming.sort((a,b)=>a.check_in.localeCompare(b.check_in));groups.past.sort((a,b)=>b.check_out.localeCompare(a.check_out));groups.cancelled.sort((a,b)=>b.check_in.localeCompare(a.check_in));return groups}

export type ReservationHistoryStatus="all"|"current"|"upcoming"|"completed"|"cancelled";
export type ReservationHistorySort="recommended"|"stay-oldest"|"stay-newest"|"booked-newest";
type ReservationHistoryRecord={status:string;check_in:string;check_out:string;confirmation_number?:string|null;guest_name?:string|null;room_type?:string|null;created_at?:string|null};
const HISTORY_STATUSES:ReservationHistoryStatus[]=["all","current","upcoming","completed","cancelled"];
const HISTORY_SORTS:ReservationHistorySort[]=["recommended","stay-oldest","stay-newest","booked-newest"];
export function filterReservationHistory<T extends ReservationHistoryRecord>(records:T[],filters:{status?:string|null;query?:string|null;sort?:string|null},today=hotelToday()):T[]{
 const status=HISTORY_STATUSES.includes(filters.status as ReservationHistoryStatus)?filters.status as ReservationHistoryStatus:"all";
 const sort=HISTORY_SORTS.includes(filters.sort as ReservationHistorySort)?filters.sort as ReservationHistorySort:"recommended";
 const query=filters.query?.trim().toLocaleLowerCase()??"";
 const category=status==="completed"?"past":status;
 const result=records.filter((record)=>(category==="all"||reservationCategory(record,today)===category)&&(!query||[record.confirmation_number,record.room_type,record.guest_name].some((value)=>value?.toLocaleLowerCase().includes(query))));
 return result.sort((a,b)=>{
  if(sort==="stay-oldest")return a.check_in.localeCompare(b.check_in);
  if(sort==="stay-newest")return b.check_in.localeCompare(a.check_in);
  if(sort==="booked-newest")return (b.created_at??"").localeCompare(a.created_at??"");
  return b.check_in.localeCompare(a.check_in);
 });
}

/* Payments & folio filter derivation (Customer Portal): presentation-only.
   folioMoney mirrors the page's invoice-fallback math so the two never drift. */
export type FolioPaymentState="pending"|"due"|"refund"|"settled";
export const FOLIO_STAY_FILTERS:ReservationCategory[]=["current","upcoming","past","cancelled"];
export const FOLIO_PAY_FILTERS:FolioPaymentState[]=["pending","due","refund","settled"];
export type FolioMoneyInput={total:string|number;deposit?:string|number|null;invoice:{amount:string|number;paid:string|number;balance:string|number;status:string;credit_balance?:string|number;terminal_settlement?:unknown}|null};
export type FolioStateInput=FolioMoneyInput&{status:string;check_in:string;check_out:string;payments:{status:string}[];refunds:unknown[]};
export function folioMoney(record:FolioMoneyInput){const total=Number(record.invoice?.amount??record.total);const paid=Number(record.invoice?.paid??record.deposit??0)+Number(record.invoice?.credit_balance??0);const balance=Number(record.invoice?.balance??Math.max(total-paid,0));return{total,paid,balance}}
// Precedence: a terminal reservation is never an actionable payment state.
// A stale pending_verification row on a cancelled/no-show stay (cancelled
// before 20261024080000 backfilled it to expired) must not bucket as
// "Awaiting Verification"; the row itself stays visible in the folio card so
// nothing is hidden, but the bucket follows the reservation's final state.
// Live flow: a live balance outranks refund bookkeeping.
export function financialPaymentState(record:FolioStateInput):FolioPaymentState{if(["cancelled","no_show"].includes(record.status)){if(record.invoice?.terminal_settlement&&folioMoney(record).balance>0)return"due";if(record.refunds.length>0)return"refund";return"settled"}if(record.payments.some((payment)=>payment.status==="pending_verification")||record.invoice?.status==="pending_verification")return"pending";if(folioMoney(record).balance>0)return"due";if(record.refunds.length>0)return"refund";return"settled"}
export function filterFinancialRecords<T extends FolioStateInput>(records:T[],filters:{stay?:string|null;pay?:string|null},today=hotelToday()):T[]{const stay=FOLIO_STAY_FILTERS.includes(filters.stay as ReservationCategory)?(filters.stay as ReservationCategory):null;const pay=FOLIO_PAY_FILTERS.includes(filters.pay as FolioPaymentState)?(filters.pay as FolioPaymentState):null;return records.filter((record)=>(!stay||reservationCategory(record,today)===stay)&&(!pay||financialPaymentState(record)===pay))}

const financialColumns="id,confirmation_number,room_type,room_number,check_in,check_out,guests,status,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,amenity_snapshot,payment_due_at,payment_status,cancellation_reason,identity_status";
const invoiceColumns = "id,reservation_id,amount,paid,balance,credit_balance,terminal_settlement,status,method,due_date,created_at";

export async function getGuestSubmittedDeposits(userId: string, reservationIds: string[]) {
  const deposits = new Map<string, number>();
  if (!supabase || !reservationIds.length) return deposits;
  const { data, error } = await supabase.from("payments")
    .select("reservation_id,amount,reservations!inner(user_id)")
    .eq("reservations.user_id", userId)
    .in("reservation_id", reservationIds)
    .eq("purpose", "reservation_deposit")
    .eq("status", "pending_verification")
    .in("method", ["manual_gcash", "manual_bank_transfer"]);
  if (error) throw new Error("Could not load submitted deposits.", { cause: error });
  for (const payment of data ?? []) {
    deposits.set(payment.reservation_id, (deposits.get(payment.reservation_id) ?? 0) + Number(payment.amount));
  }
  return deposits;
}

function groupGuestRows<T>(rows: T[], key: (row: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    const group = grouped.get(id);
    if (group) group.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

export async function getCustomerFinancialSummary(userId: string) {
  const client = supabase;
  if (!client) return [];
  await client.rpc("expire_booking_holds");
  const [reservations, invoices, refunds, payments] = await Promise.all([
    readAllRows(() => client.from("reservations").select(financialColumns)
      .eq("user_id", userId).order("check_in", { ascending: false })),
    readAllRows(() => client.from("invoices")
      .select(`${invoiceColumns},reservations!inner()`)
      .eq("reservations.user_id", userId)),
    readAllRows(() => client.from("refund_requests")
      .select("id,reservation_id,reason,paid_deposit,refund_basis_points,eligible_amount,status,reference,processed_at,created_at,reservations!inner()")
      .eq("reservations.user_id", userId).order("created_at", { ascending: false })),
    // Follow the invoice relationship so pre-existing payments without a reservation_id remain visible.
    readAllRows(() => client.from("payments")
      .select("id,invoice_id,reservation_id,amount,currency,method,reference,purpose,status,submitted_at,verified_at,created_at,invoices!inner(reservations!inner())")
      .eq("invoices.reservations.user_id", userId).order("created_at", { ascending: false })),
  ]);
  const invoiceByStay = groupGuestRows(invoices, (row) => row.reservation_id);
  const refundsByStay = groupGuestRows(refunds, (row) => row.reservation_id);
  const paymentsByInvoice = groupGuestRows(payments, (row) => row.invoice_id);
  return reservations.map((reservation) => {
    const invoice = invoiceByStay.get(reservation.id)?.[0] ?? null;
    return {
      ...reservation,
      invoice,
      payments: invoice ? paymentsByInvoice.get(invoice.id) ?? [] : [],
      refunds: refundsByStay.get(reservation.id) ?? [],
    };
  });
}

/** Add line items for one page of records already loaded through getCustomerFinancialSummary. */
export async function getCustomerFolioDetails(financial: Awaited<ReturnType<typeof getCustomerFinancialSummary>>) {
  const client = supabase;
  if (!client || !financial.length) return [];
  const ids = financial.map((item) => item.id);
  const invoiceIds = financial.flatMap(({ invoice }) => invoice ? [invoice.id] : []);
  const [charges, adjustments] = await Promise.all([
    invoiceIds.length ? readAllRows(() => client.from("folio_charges")
      .select("id,invoice_id,reservation_id,description,category,amount,status,created_at")
      .in("invoice_id", invoiceIds).order("created_at", { ascending: false })) : [],
    readAllRows(() => client.from("financial_adjustments")
      .select("id,invoice_id,reservation_id,transaction_type,direction,amount,reason,created_at")
      .in("reservation_id", ids).order("created_at", { ascending: false })),
  ]);
  const chargesByInvoice = groupGuestRows(charges, (row) => row.invoice_id);
  const adjustmentsByStay = groupGuestRows(adjustments, (row) => row.reservation_id);
  return financial.map((record) => ({
    ...record,
    charges: record.invoice ? chargesByInvoice.get(record.invoice.id) ?? [] : [],
    adjustments: adjustmentsByStay.get(record.id) ?? [],
  }));
}
/* The ONLY data door for a customer receipt. Ownership and eligibility are
   enforced here, server-side, for every caller — the preview modal, the JSON
   route, the printable page and the email route. Hiding a button is not the
   control: an id belonging to another guest returns null here and 404 upstream. */
export async function getCustomerReceipt(userId:string,paymentId:string):Promise<ReceiptDocument|null>{
  if(!supabase)return null;
  const{data:payment}=await supabase.from("payments").select("id,reservation_id,amount,currency,method,reference,purpose,status,verified_at,created_at").eq("id",paymentId).maybeSingle();
  // Eligibility is checked in code rather than in the query so the refund case is
  // explicit — the same predicate accounting_generate_document applies.
  if(!payment||!receiptEligible(payment))return null;
  // Ownership: the payment must belong to one of THIS user's reservations.
  const{data:reservation}=await supabase.from("reservations").select("id,confirmation_number,guest_name,room_type,check_in,check_out,operational_policy_snapshot").eq("id",payment.reservation_id).eq("user_id",userId).maybeSingle();
  if(!reservation)return null;
  // A real RCP- number when Accounting has issued one, null otherwise. An
  // invented number would be fabricated data, so absent stays absent.
  const{data:document,error:documentError}=await supabase.from("financial_documents").select("document_number,snapshot").eq("payment_id",paymentId).eq("document_type","receipt").order("created_at").order("id").limit(1).maybeSingle();
  if(documentError)throw documentError;
  const issued=document?.snapshot as {
    reservationId:string; confirmationNumber:string|null; guestName:string|null;
    roomType:string|null; checkIn:string; checkOut:string;
    taxBreakdown?:NonNullable<ReturnType<typeof inclusiveTaxBreakdown>>;
  }|null|undefined;
  // Frozen policy snapshot first, current policy as the fallback for reservations
  // created before tax configuration — unchanged from the original receipt page.
  const snapshot=(reservation.operational_policy_snapshot??{})as Record<string,unknown>;
  const policy=issued?null:await getOperationalPolicy();
  const tax=issued?issued.taxBreakdown:inclusiveTaxBreakdown(
    payment.amount,
    typeof snapshot.vatRateBp==="number"?snapshot.vatRateBp:policy?.vatRateBp??0,
    typeof snapshot.serviceChargeBp==="number"?snapshot.serviceChargeBp:policy?.serviceChargeBp??0,
  );
  const stay=issued?{
    id:issued.reservationId,confirmation_number:issued.confirmationNumber,guest_name:issued.guestName,
    room_type:issued.roomType,check_in:issued.checkIn,check_out:issued.checkOut,
  }:reservation;
  return buildReceiptDocument({payment,reservation:stay,labels:{purpose:friendlyStatus(payment.purpose),method:friendlyStatus(payment.method)},tax:tax?{netSubtotal:tax.netSubtotal,serviceCharge:tax.serviceCharge,vatAmount:tax.vatAmount,grossTotal:tax.grossTotal,serviceChargeRate:ratePercent(tax.serviceChargeBp),vatRate:ratePercent(tax.vatRateBp)}:null,documentNumber:document?.document_number??null});
}
export async function getCustomerRequests(userId: string) {
  const client = supabase;
  if (!client) return [];
  const requests = await readAllRows(() => client.from("guest_requests")
    .select("id,version,reservation_id,request,request_type,batch_id,approval_status,approval_note,approved_at,department,priority,severity,escalation_status,status,created_at,reservation:reservations!inner(id,confirmation_number,room_type,room_number,check_in,check_out,status,guest_id)")
    .eq("reservation.user_id", userId).order("created_at", { ascending: false }));
  return requests.map((row) => ({ ...row, reservation: relatedRow(row.reservation) ?? null }));
}

// The service client types embeds as arrays without a schema. Many-to-one
// relationships arrive as objects from PostgREST.
function relatedRow<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

async function getPrimaryStay(client: NonNullable<typeof supabase>, userId: string) {
  const owned = () => client.from("reservations").select(financialColumns).eq("user_id", userId);
  const current = await owned().eq("status", "checked_in")
    .order("check_out").order("check_in", { ascending: false }).order("id").limit(1).maybeSingle();
  if (current.error) throw current.error;
  const result = current.data ? current : await owned()
    .not("status", "in", "(cancelled,no_show,checked_in,checked_out)").gt("check_out", hotelToday())
    .order("check_in").order("id").limit(1).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const { data: invoice, error } = await client.from("invoices").select(invoiceColumns)
    .eq("reservation_id", result.data.id).order("id").limit(1).maybeSingle();
  if (error) throw error;
  const payments = invoice ? await readAllRows(() => client.from("payments").select("id,amount,purpose,method,status")
    .eq("invoice_id", invoice.id).eq("status", "pending_verification").in("method", ["manual_gcash", "manual_bank_transfer"])) : [];
  return { ...result.data, invoice, payments };
}

const RECENT_UPDATES = 5;
type RecentQuery<T> = {
  order(column: string, options?: { ascending?: boolean }): RecentQuery<T>;
  limit(count: number): PromiseLike<{ data: T[] | null; error: unknown }>;
};
async function latest<T>(query: RecentQuery<T>, date = "created_at") {
  const { data, error } = await query.order(date, { ascending: false }).order("id").limit(RECENT_UPDATES);
  if (error) throw error;
  return data ?? [];
}

async function getRecentStayUpdates(client: NonNullable<typeof supabase>, userId: string) {
  const stayRef = "id,room_type,status,confirmation_number";
  const payments = () => client.from("payments")
    .select("id,method,purpose,status,verified_at,submitted_at,created_at,invoices!inner(reservations!inner(id,confirmation_number))")
    .eq("invoices.reservations.user_id", userId);
  const refunds = () => client.from("refund_requests")
    .select("id,reservation_id,status,eligible_amount,processed_at,created_at,reservations!inner(confirmation_number)")
    .eq("reservations.user_id", userId);
  // Each timestamp branch is disjoint. Its first five rows are sufficient
  // for the overall first five, including activity from legacy records.
  const [invoiced, noInvoiceDate, verified, submitted, entered, processed, requested,
    changes, requests, trips] = await Promise.all([
    latest(client.from("invoices").select(`id,created_at,reservations!inner(${stayRef})`)
      .eq("reservations.user_id", userId).not("created_at", "is", null)),
    latest(client.from("reservations").select(`${stayRef},check_in,invoices()`)
      .eq("user_id", userId).not("invoices.created_at", "is", null).is("invoices", null), "check_in"),
    latest(payments().not("verified_at", "is", null), "verified_at"),
    latest(payments().is("verified_at", null).not("submitted_at", "is", null), "submitted_at"),
    latest(payments().is("verified_at", null).is("submitted_at", null).not("created_at", "is", null)),
    latest(refunds().not("processed_at", "is", null), "processed_at"),
    latest(refunds().is("processed_at", null)),
    latest(client.from("reservation_change_requests").select("id,reservation_id,status,created_at,reservations!inner(confirmation_number)")
      .eq("reservations.user_id", userId)),
    latest(client.from("guest_requests").select("id,request,status,created_at,reservations!inner()")
      .eq("reservations.user_id", userId).not("created_at", "is", null)),
    latest(client.from("transportation_requests").select("id,status,pickup_location,dropoff_location,created_at,reservations!inner()")
      .eq("reservations.user_id", userId)),
  ]);
  const updates: CustomerNotification[] = [];
  for (const { stay, createdAt } of [
    ...invoiced.map((row) => ({ stay: relatedRow(row.reservations), createdAt: row.created_at })),
    ...noInvoiceDate.map((stay) => ({ stay, createdAt: `${stay.check_in}T00:00:00Z` })),
  ]) {
    if (!stay) continue;
    updates.push({
      id: `reservation-${stay.id}`, title: `Reservation ${friendlyStatus(stay.status)}`,
      detail: `${stay.room_type} - ${stay.confirmation_number ?? stay.id}`, createdAt, href: `/my-reservations/${stay.id}`,
    });
  }
  for (const payment of [...verified, ...submitted, ...entered]) {
    const stay = relatedRow(relatedRow(payment.invoices)?.reservations);
    if (!stay) continue;
    let title = `${friendlyStatus(payment.purpose)} ${friendlyStatus(payment.status)}`;
    if (payment.purpose === "reservation_deposit" && payment.status === "paid") title = "Reservation deposit verified";
    if (payment.purpose === "reservation_deposit" && payment.status === "pending_verification") title = "Deposit awaiting verification";
    updates.push({
      id: `payment-${payment.id}`, title, detail: `${friendlyStatus(payment.method)} - ${stay.confirmation_number ?? stay.id}`,
      createdAt: payment.verified_at ?? payment.submitted_at ?? payment.created_at, href: "/account/payments",
    });
  }
  for (const refund of [...processed, ...requested]) {
    updates.push({
      id: `refund-${refund.id}`, title: `Refund ${friendlyStatus(refund.status)}`,
      detail: `PHP ${Number(refund.eligible_amount).toLocaleString("en-PH")} - ${relatedRow(refund.reservations)?.confirmation_number ?? refund.reservation_id}`,
      createdAt: refund.processed_at ?? refund.created_at, href: "/account/payments",
    });
  }
  for (const change of changes) {
    updates.push({
      id: `change-${change.id}`, title: `Change request ${friendlyStatus(change.status)}`,
      detail: relatedRow(change.reservations)?.confirmation_number ?? change.reservation_id, createdAt: change.created_at,
      href: `/my-reservations/${change.reservation_id}`,
    });
  }
  for (const request of requests) {
    updates.push({
      id: `request-${request.id}`, title: `Request ${friendlyStatus(request.status)}`,
      detail: request.request, createdAt: request.created_at, href: "/account/requests",
    });
  }
  for (const trip of trips) {
    updates.push({
      id: `transportation-${trip.id}`, title: `Transportation ${friendlyStatus(trip.status.toLowerCase())}`,
      detail: `${trip.pickup_location} → ${trip.dropoff_location}`, createdAt: trip.created_at, href: "/account/transportation",
    });
  }
  return updates.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, RECENT_UPDATES);
}

export async function getCustomerOverview(userId: string) {
  const client = supabase;
  if (!client) return { primary: null, notifications: [] };
  await client.rpc("expire_booking_holds");
  const [primary, notifications] = await Promise.all([
    getPrimaryStay(client, userId),
    getRecentStayUpdates(client, userId),
  ]);
  return { primary, notifications };
}


export async function getCustomerReservationDetail(userId:string,id:string){
 const client = supabase;
 if(!client)return null;await client.rpc("expire_booking_holds");
 const{data:reservation,error:reservationError}=await client.from("reservations").select("id,confirmation_number,guest_id,guest_name,guest_email,room_type,room_number,check_in,check_out,guests,status,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,amenity_snapshot,breakfast_snapshot,payment_due_at,payment_status,payment_method,source,special_requests,request_options,transport_lines,transportation_preferences,expected_arrival,cancellation_reason,identity_status,checked_out_at,created_at").eq("id",id).eq("user_id",userId).maybeSingle();
 if(reservationError)throw new Error("Could not load reservation details.",{cause:reservationError});
 if(!reservation)return null;
 const [invoiceResult,guestResult,refunds,changeRequests]=await Promise.all([
  client.from("invoices").select("id,amount,paid,balance,credit_balance,terminal_settlement,status,method,due_date").eq("reservation_id",id).maybeSingle(),
  reservation.guest_id?client.from("guests").select("name,email,phone,nationality,address").eq("id",reservation.guest_id).maybeSingle():Promise.resolve({data:null}),
  readAllRows(() => client.from("refund_requests").select("id,reason,paid_deposit,refund_basis_points,eligible_amount,status,reference,processed_at,created_at").eq("reservation_id",id).order("created_at",{ascending:false})),
  readAllRows(() => client.from("reservation_change_requests").select("id,requested_check_in,requested_check_out,requested_room_type,requested_guests,requested_special_requests,calculated_total,payment_difference,execution_status,reason,status,created_at").eq("reservation_id",id).order("created_at",{ascending:false})),
 ]);
 for(const result of [invoiceResult,guestResult]){
  if("error" in result&&result.error)throw new Error("Could not load reservation details.",{cause:result.error});
 }
 const {data:invoice}=invoiceResult,{data:guest}=guestResult;
 const [payments,charges,adjustments] = invoice ? await Promise.all([
  readAllRows(() => client.from("payments").select("id,amount,method,reference,purpose,status,submitted_at,verified_at,proof_original_name,created_at").eq("invoice_id",invoice.id).order("created_at",{ascending:false})),
  readAllRows(() => client.from("folio_charges").select("id,description,category,amount,status,created_at").eq("invoice_id",invoice.id).order("created_at",{ascending:false})),
  readAllRows(() => client.from("financial_adjustments").select("id,reason,direction,amount,created_at").eq("invoice_id",invoice.id).order("created_at",{ascending:false})),
 ]) : [[], [], []];
 return{...reservation,invoice,guest,adjustments,payments,charges,refunds,changeRequests,nights:calculateNights(reservation.check_in,reservation.check_out)};
}
