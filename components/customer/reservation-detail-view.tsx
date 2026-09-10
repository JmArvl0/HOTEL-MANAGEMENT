"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BedDouble, BookOpenText, CalendarDays, CarTaxiFront,
  Check, ChevronDown, ClipboardCheck, CreditCard, Copy,
  FileText, ReceiptText, RotateCcw, Users,
} from "lucide-react";
import { formatPeso } from "@/lib/format";
import { CheckInQr } from "@/components/customer/check-in-qr";
import { ReservationActions } from "@/components/customer/reservation-actions";
import {
  SERVICE_TYPE_LABELS, isAssignmentVisible,
  type CustomerTransportationRequest,
} from "@/lib/transportation-display";

// All data arrives as plain serializable props from the server page — the view
// only renders and manages UI state (tabs, copy, disclosures). Money math and
// policy resolution happen server-side in the page.
export type ReservationDetailViewData = {
  id: string;
  confirmationNumber: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  status: string;
  paymentStatus: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomNumber: string | null;
  identityStatus: string;
  source: string;
  specialRequests: string | null;
  expectedArrival: string | null;
  cancellationReason: string | null;
  checkInTime: string;
  checkOutTime: string;
  transportLines: { name: string; price: number; note?: string | null }[];
  policyText: string;
  pendingNotice: string | null;
  money: {
    stayTotal: number;
    folioTotal: number;
    depositRequired: number;
    paid: number;
    balance: number;
    nightly: number;
  };
  charges: { id: string; description: string; category: string; amount: number; status: string; createdAt: string }[];
  payments: { id: string; amount: number; method: string; purpose: string; status: string; createdAt: string }[];
  refunds: { id: string; reason: string; eligibleAmount: number; status: string; createdAt: string }[];
  changeRequests: { id: string; reason: string; status: string; createdAt: string }[];
  transportation: CustomerTransportationRequest[];
};

const friendly = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
const formatStayDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const formatStamp = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

const STATUS_STEPS = ["pending", "confirmed", "checked_in", "checked_out"] as const;
const STEP_LABELS: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", checked_out: "Checked out" };
const terminal = (status: string) => ["cancelled", "no_show"].includes(status);

type TabKey = "stay" | "folio" | "transportation" | "policy";
const TABS: { key: TabKey; label: string; icon: typeof BedDouble }[] = [
  { key: "stay", label: "Stay", icon: BedDouble },
  { key: "folio", label: "Folio & activity", icon: ReceiptText },
  { key: "transportation", label: "Transportation", icon: CarTaxiFront },
  { key: "policy", label: "Policy", icon: FileText },
];

function DetailRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActivityGroup({
  title, icon: Icon, count, children,
}: { title: string; icon: typeof ReceiptText; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!count) return null;
  return (
    <div className="crd-activity-group">
      <button
        type="button"
        className="crd-activity-heading"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={15} aria-hidden="true" />
        <span>{title}</span>
        <b>{count}</b>
        <ChevronDown size={15} aria-hidden="true" className="crd-activity-chevron" data-open={open} />
      </button>
      {open && <div className="crd-activity-list">{children}</div>}
    </div>
  );
}

function TimelineDot({ tone }: { tone: "payment" | "refund" | "charge" | "change" }) {
  return <i className={`crd-activity-dot ${tone}`} aria-hidden="true" />;
}

export function ReservationDetailView({ data }: { data: ReservationDetailViewData }) {
  const [tab, setTab] = useState<TabKey>("stay");
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.confirmationNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — no-op, the code remains selectable text */ }
  }, [data.confirmationNumber]);

  const tabNodes = useRef<Partial<Record<TabKey, HTMLButtonElement>>>({});
  const onTabKeyDown = (event: React.KeyboardEvent, key: TabKey) => {
    const order = TABS.map((t) => t.key);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "Home" ? -order.indexOf(key) : event.key === "End" ? order.length - 1 - order.indexOf(key) : 0;
    if (!delta) return;
    event.preventDefault();
    const next = order[(order.indexOf(key) + delta + order.length) % order.length];
    setTab(next);
    tabNodes.current[next]?.focus();
  };

  const currentStep = terminal(data.status) ? -1 : STATUS_STEPS.indexOf(data.status as (typeof STATUS_STEPS)[number]);

  const money = data.money;
  const paidRatio = money.folioTotal > 0 ? Math.min(100, Math.round((money.paid / money.folioTotal) * 100)) : 0;

  return (
    <div className="customer-reservation-detail">
      <section className="customer-reservation-hero">
        <Link className="customer-back" href="/my-reservations"><ArrowLeft size={14} />All reservations</Link>
        <div className="customer-reservation-heading">
          <div>
            <p className="customer-reservation-reference">
              {data.confirmationNumber}
              <button type="button" className="crd-copy" onClick={copyCode} aria-label="Copy confirmation number" title="Copy confirmation number">
                {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              </button>
              <span className="crd-copy-status" role="status" aria-live="polite">{copied ? "Copied" : ""}</span>
            </p>
            <h1>{data.roomType}</h1>
            <p className="customer-reservation-dates">{formatStayDate(data.checkIn)} – {formatStayDate(data.checkOut)}</p>
            <p className="crd-hero-facts">
              <span><CalendarDays size={14} aria-hidden="true" />{data.nights} night{data.nights !== 1 ? "s" : ""}</span>
              <span><Users size={14} aria-hidden="true" />{data.guests} guest{data.guests !== 1 ? "s" : ""}</span>
            </p>
          </div>
          <div className="customer-reservation-summary">
            <div className="customer-title-status" aria-label="Reservation and payment status">
              <span><small>Reservation</small><span className={`customer-status ${data.status}`}>{friendly(data.status)}</span></span>
              <span><small>Payment</small><span className={`customer-status ${data.paymentStatus}`}>{friendly(data.paymentStatus)}</span></span>
            </div>
            <ReservationActions id={data.id} status={data.status} />
          </div>
        </div>
        {!terminal(data.status) && (
          <ol className="crd-stepper" aria-label="Reservation progress">
            {STATUS_STEPS.map((step, index) => (
              <li key={step} data-state={index < currentStep ? "past" : index === currentStep ? "current" : "future"} aria-current={index === currentStep ? "step" : undefined}>
                <i aria-hidden="true" />
                <span>{STEP_LABELS[step]}</span>
                {index < STATUS_STEPS.length - 1 && <em aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
        {terminal(data.status) && (
          <p className={`crd-terminal customer-status ${data.status}`}>{friendly(data.status)} — {data.cancellationReason ? data.cancellationReason : "this reservation will not proceed."}</p>
        )}
      </section>

      {data.status === "confirmed" && <CheckInQr reservationId={data.id} confirmationNumber={data.confirmationNumber} />}

      <section className="crd-folio-strip" aria-label="Payment summary">
        <div className="crd-folio-figures">
          <div><span>Paid</span><strong>{formatPeso(money.paid)}</strong></div>
          <div><span>Balance{money.balance > 0 ? " due" : ""}</span><strong className={money.balance > 0 ? "crd-balance-due" : "crd-balance-clear"}>{formatPeso(money.balance)}</strong></div>
          <div><span>Deposit required</span><strong>{formatPeso(money.depositRequired)}</strong></div>
          <div><span>Folio total</span><strong>{formatPeso(money.folioTotal)}</strong></div>
        </div>
        <div className="crd-folio-bar" role="progressbar" aria-valuenow={paidRatio} aria-valuemin={0} aria-valuemax={100} aria-label="Portion of folio paid">
          <div className={money.balance > 0 ? "crd-folio-fill partial" : "crd-folio-fill clear"} style={{ width: `${paidRatio}%` }} />
        </div>
      </section>

      <div className="crd-tabs" role="tablist" aria-label="Reservation details">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            ref={(node) => { tabNodes.current[key] = node ?? undefined; }}
            type="button"
            role="tab"
            id={`crd-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`crd-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            onKeyDown={(event) => onTabKeyDown(event, key)}
          >
            <Icon size={15} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <section className="customer-detail-card crd-panel" role="tabpanel" id="crd-panel-stay" aria-labelledby="crd-tab-stay" hidden={tab !== "stay"}>
        <h2>Stay details</h2>
        <dl>
          <DetailRow term="Check-in"><span>{formatStayDate(data.checkIn)} · from {data.checkInTime}</span></DetailRow>
          <DetailRow term="Check-out"><span>{formatStayDate(data.checkOut)} · by {data.checkOutTime}</span></DetailRow>
          {data.expectedArrival && <DetailRow term="Expected arrival">{data.expectedArrival}</DetailRow>}
          <DetailRow term="Guests">{data.guests}</DetailRow>
          <DetailRow term="Guest">{data.guestName}</DetailRow>
          <DetailRow term="Email">{data.guestEmail}</DetailRow>
          <DetailRow term="Mobile">{data.guestPhone}</DetailRow>
          <DetailRow term="Physical room">{["checked_in", "checked_out"].includes(data.status) && data.roomNumber ? data.roomNumber : "Assigned by Front Desk when operationally appropriate"}</DetailRow>
          <DetailRow term="Identity check">{friendly(data.identityStatus)}</DetailRow>
          <DetailRow term="Booking source">{friendly(data.source)}</DetailRow>
        </dl>
        {data.specialRequests && (
          <div className="customer-special-request"><strong>Special requests</strong><p>{data.specialRequests}</p></div>
        )}
        {data.transportLines.length > 0 && (
          <div className="customer-special-request"><strong>Hotel transport</strong><p>{data.transportLines.map((line) => <span key={line.name}>{line.name} · {formatPeso(line.price)}</span>)}<small className="summary-note">Included in your stay total and covered by the reservation deposit. Total {formatPeso(data.transportLines.reduce((sum, line) => sum + line.price, 0))}.</small></p></div>
        )}
      </section>

      <section className="customer-detail-card crd-panel" role="tabpanel" id="crd-panel-folio" aria-labelledby="crd-tab-folio" hidden={tab !== "folio"}>
        <h2>Rate &amp; folio</h2>
        <dl>
          <DetailRow term={`Nightly rate × ${data.nights}`}>{formatPeso(money.nightly * data.nights)}</DetailRow>
          <DetailRow term="Original stay total">{formatPeso(money.stayTotal)}</DetailRow>
          <DetailRow term="Current folio total">{formatPeso(money.folioTotal)}</DetailRow>
          <DetailRow term="Net payments received">{formatPeso(money.paid)}</DetailRow>
          <div className="detail-balance"><dt>Remaining balance</dt><dd>{formatPeso(money.balance)}</dd></div>
        </dl>

        <div className="crd-activity">
          <ActivityGroup title="Folio charges" icon={CreditCard} count={data.charges.length}>
            {data.charges.map((charge) => (
              <div key={charge.id} className="crd-activity-row">
                <TimelineDot tone="charge" />
                <div><b>{charge.description}</b><small>{friendly(charge.category)} · {formatStamp(charge.createdAt)}</small></div>
                <span>{formatPeso(charge.amount)}</span>
              </div>
            ))}
          </ActivityGroup>
          <ActivityGroup title="Transactions" icon={ReceiptText} count={data.payments.length}>
            {data.payments.map((payment) => (
              <div key={payment.id} className="crd-activity-row">
                <TimelineDot tone="payment" />
                <div><b>{friendly(payment.purpose)} · {friendly(payment.method)}</b><small>{friendly(payment.status)} · {formatStamp(payment.createdAt)}</small></div>
                <span>{formatPeso(payment.amount)}{payment.status === "paid" && <> · <Link href={`/account/receipts/${payment.id}`}>Receipt</Link></>}</span>
              </div>
            ))}
          </ActivityGroup>
          <ActivityGroup title="Refund requests" icon={RotateCcw} count={data.refunds.length}>
            {data.refunds.map((refund) => (
              <div key={refund.id} className="crd-activity-row">
                <TimelineDot tone="refund" />
                <div><b>{refund.reason}</b><small>{friendly(refund.status)} · {formatStamp(refund.createdAt)}</small></div>
                <span>{formatPeso(refund.eligibleAmount)}</span>
              </div>
            ))}
          </ActivityGroup>
          <ActivityGroup title="Change requests" icon={ClipboardCheck} count={data.changeRequests.length}>
            {data.changeRequests.map((request) => (
              <div key={request.id} className="crd-activity-row">
                <TimelineDot tone="change" />
                <div><b>{request.reason}</b><small>{friendly(request.status)} · {formatStamp(request.createdAt)}</small></div>
                <span>—</span>
              </div>
            ))}
          </ActivityGroup>
          {!data.charges.length && !data.payments.length && !data.refunds.length && !data.changeRequests.length && (
            <div className="crd-activity-empty"><ReceiptText /><p>No folio activity yet. Charges and payments will appear here.</p></div>
          )}
        </div>
        <Link className="customer-inline-action" href="/account/payments"><ReceiptText size={15} />View payments &amp; folio</Link>
        <Link className="customer-inline-action" href="/account/requests"><BookOpenText size={15} />Submit a guest request</Link>
      </section>

      <section className="customer-detail-card crd-panel" role="tabpanel" id="crd-panel-transportation" aria-labelledby="crd-tab-transportation" hidden={tab !== "transportation"}>
        <h2>Transportation</h2>
        {data.transportation.length > 0 ? (
          <div className="crd-transport-list">
            {data.transportation.map((trip) => (
              <article key={trip.id} className="crd-transport-card">
                <header>
                  <b>{SERVICE_TYPE_LABELS[trip.service_type]}</b>
                  <span className={`customer-status ${trip.status.toLowerCase()}`}>{trip.status.toLowerCase().replaceAll("_", " ")}</span>
                </header>
                <p>{trip.pickup_location} → {trip.dropoff_location}</p>
                <small>{formatStayDate(trip.pickup_date)} · {trip.pickup_time}{trip.passenger_count ? ` · ${trip.passenger_count} passenger${trip.passenger_count !== 1 ? "s" : ""}` : ""}</small>
                {isAssignmentVisible(trip.status) && trip.driver_name && <small>Driver: {trip.driver_name}{trip.vehicle_type ? ` · ${trip.vehicle_type}` : ""}</small>}
                {trip.customer_visible_notes && <small className="crd-transport-note">{trip.customer_visible_notes}</small>}
              </article>
            ))}
          </div>
        ) : (
          <div className="crd-activity-empty"><CarTaxiFront /><p>No transportation on this reservation. Airport pickup and drop-off can be requested any time before check-in.</p></div>
        )}
        <Link className="customer-inline-action" href="/account/transportation"><CarTaxiFront size={15} />Manage transportation</Link>
      </section>

      <section className="customer-policy crd-panel" role="tabpanel" id="crd-panel-policy" aria-labelledby="crd-tab-policy" hidden={tab !== "policy"}>
        <h2>Policy accepted with this reservation</h2>
        {data.pendingNotice && <p className="crd-policy-notice">{data.pendingNotice}</p>}
        <p>{data.policyText}</p>
      </section>
    </div>
  );
}
