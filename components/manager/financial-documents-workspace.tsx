"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronRight, FileText, LockKeyhole, ReceiptText, Search } from "lucide-react";
import type { AccountingLedger } from "@/lib/accounting";
import { PageHeader } from "@/components/ui/Navigation";
import { HavenSearchInput } from "@/components/ui/haven-data-controls";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import type { ReactNode } from "react";

type IssuedDocument = AccountingLedger["documents"][number];
type Snapshot = Record<string, unknown>;
type SnapshotLine = Record<string, unknown>;

const dayFormat = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const manilaDayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" });
const currencyFormat = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const documentName = (type: string) => type === "receipt" ? "Payment receipt" : "Folio statement";
const text = (value: unknown, fallback = "—") => value == null || String(value).trim() === "" ? fallback : String(value);
const humanize = (value: unknown) => text(value).replaceAll("_", " ");
const snapshotOf = (value: unknown): Snapshot => value && typeof value === "object" && !Array.isArray(value) ? value as Snapshot : {};
const listOf = (snapshot: Snapshot, key: string): SnapshotLine[] => {
  const value = snapshot[key];
  return Array.isArray(value) ? value.filter((line): line is SnapshotLine => Boolean(line) && typeof line === "object" && !Array.isArray(line)) : [];
};
const dateOf = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
};
const manilaDay = (value: unknown) => {
  const date = dateOf(value);
  if (!date) return "";
  const parts = Object.fromEntries(manilaDayFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const shiftDay = (day: string, amount: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const issueDate = (value: unknown) => {
  const date = dateOf(value);
  return date ? dayFormat.format(date) : "Date unavailable";
};
const issueTime = (value: unknown) => {
  const date = dateOf(value);
  return date ? timeFormat.format(date) : "";
};
const money = (value: unknown) => {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return currencyFormat.format(Number(value));
};
const paymentLabel = (payment: SnapshotLine) =>
  [payment.purpose, payment.method, payment.reference].filter(value => value != null && String(value).trim() !== "").map(humanize).join(" · ") || "Payment details unavailable";
const snapshotAmount = (value: unknown) => value == null || value === "" ? null : money(value);

function DocumentSnapshot({ document }: { document: IssuedDocument | null }) {
  if (!document) {
    return <div className="fd-empty">
      <FileText size={22} aria-hidden="true" />
      <h3>No document selected</h3>
      <p>Choose a receipt or statement to view its saved details.</p>
    </div>;
  }

  const snapshot = snapshotOf(document.snapshot);
  const type = String(snapshot.documentType ?? document.document_type);
  const isReceipt = type === "receipt";
  const payments = listOf(snapshot, "payments");
  const charges = listOf(snapshot, "charges");
  const adjustments = listOf(snapshot, "adjustments");
  const tax = snapshotOf(snapshot.taxBreakdown);
  const hasTax = Object.keys(tax).length > 0;
  const issueStamp = snapshot.generatedAt ?? document.created_at;
  const receiptAmount = payments[0]?.amount;
  const featuredAmount = snapshotAmount(isReceipt ? receiptAmount : snapshot.balance);
  const featureLabel = isReceipt ? "Payment received" : "Balance at issue";
  const originalAmount = snapshotAmount(snapshot.originalFolioAmount);
  const folioLines: [string, string][] = [
    ...(snapshot.terminalSettlement && originalAmount ? [["Original reservation obligation", originalAmount] as [string, string]] : []),
    ["Folio amount", money(snapshot.folioAmount)],
    ["Paid", money(snapshot.paid)],
    ["Balance", money(snapshot.balance)],
    ...(Number(snapshot.creditBalance ?? 0) > 0 ? [["Credit held", money(snapshot.creditBalance)] as [string, string]] : []),
    ["Status", humanize(snapshot.folioStatus)],
  ];
  const taxLines: [string, string][] = [
    ["Net subtotal", money(tax.netSubtotal)],
    [`Service charge (${Number(tax.serviceChargeBp) / 100 || 0}%)`, money(tax.serviceCharge)],
    [`VAT (${Number(tax.vatRateBp) / 100 || 0}%)`, money(tax.vatAmount)],
    ["Gross total", money(tax.grossTotal)],
  ];
  const detailList = (lines: [string, string][]) => <dl>
    {lines.map(([name, amount], index) => <div key={`${name}-${index}`}><dt>{name}</dt><dd>{amount}</dd></div>)}
  </dl>;
  const disclosure = (title: string, contents: ReactNode) => <details>
    <summary>{title}<ChevronDown size={15} aria-hidden="true" /></summary>
    {contents}
  </details>;

  return <article className="fd-paper" aria-label={`${documentName(type)} ${text(document.document_number)}`}>
    <header className="fd-paper-brand">
      <span><FileText size={18} aria-hidden="true" /> HAVEN</span>
      <span className="fd-snapshot-label"><LockKeyhole size={13} aria-hidden="true" /> Issued snapshot</span>
    </header>
    <div className="fd-paper-title">
      <h3>{documentName(type)}</h3>
      <p>{text(document.document_number)}</p>
    </div>
    <dl className="fd-metadata">
      <div><dt>Guest</dt><dd>{text(snapshot.guestName)}</dd></div>
      <div><dt>Booking reference</dt><dd>{text(snapshot.confirmationNumber ?? snapshot.reservationId ?? document.reservation_id)}</dd></div>
      <div><dt>Issued · Manila time</dt><dd>{issueDate(issueStamp)}{issueTime(issueStamp) ? <> · {issueTime(issueStamp)}</> : null}</dd></div>
      <div><dt>Stay · {text(snapshot.roomType)}</dt><dd>{text(snapshot.checkIn)} → {text(snapshot.checkOut)}</dd></div>
    </dl>
    <div className="fd-featured-amount">
      <div><span>{featureLabel}</span><strong>{featuredAmount ?? "Amount unavailable"}</strong></div>
      <p>{isReceipt ? paymentLabel(payments[0] ?? {}) : `${humanize(snapshot.folioStatus)} · ${money(snapshot.paid)} paid`}</p>
    </div>
    <div className="fd-disclosures">
      {disclosure("Folio position at issue", detailList(folioLines))}
      {hasTax && disclosure("VAT-inclusive breakdown", <>{detailList(taxLines)}<p>Prices already include service charge and VAT. The saved figures use the rates at issue.</p></>)}
      {!isReceipt && payments.length > 0 && disclosure("Recorded payments", detailList(payments.map(payment => [paymentLabel(payment), money(payment.amount)])))}
      {(charges.length > 0 || adjustments.length > 0) && disclosure("Charges and adjustments", detailList([
        ...charges.map(charge => [`${text(charge.description)} · ${humanize(charge.category)}`, money(charge.amount)] as [string, string]),
        ...adjustments.map(adjustment => [`${humanize(adjustment.transactionType)} · ${text(adjustment.reason)}`, `${adjustment.direction === "credit" ? "−" : "+"}${money(adjustment.amount)}`] as [string, string]),
      ]))}
    </div>
    <p className="fd-paper-note"><LockKeyhole size={14} aria-hidden="true" /> Amounts and details are preserved as issued.</p>
  </article>;
}

export default function FinancialDocumentsWorkspace({ documents, search, setSearch }: {
  documents: AccountingLedger["documents"];
  search: string;
  setSearch: (value: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const documentHeading = useRef<HTMLHeadingElement>(null);
  const mobileWasOpen = useRef(false);

  useEffect(() => {
    if (mobileDetailOpen) {
      mobileWasOpen.current = true;
      documentHeading.current?.focus({ preventScroll: true });
    } else if (mobileWasOpen.current) {
      mobileWasOpen.current = false;
      const activeId = selectedId ?? "";
      document.getElementById(`fd-document-${activeId}`)?.focus();
    }
  }, [mobileDetailOpen, selectedId]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const returnToRegister = () => { if (desktop.matches) setMobileDetailOpen(false); };
    desktop.addEventListener("change", returnToRegister);
    return () => desktop.removeEventListener("change", returnToRegister);
  }, []);

  const today = manilaDay(new Date());
  const searched = documents.filter(document => {
    const snapshot = snapshotOf(document.snapshot);
    const query = search.trim().toLocaleLowerCase();
    const fields = [
      document.document_number, document.reservation_id, document.payment_id,
      snapshot.guestName, snapshot.confirmationNumber, snapshot.reservationId,
    ];
    const matchesQuery = !query || fields.some(value => String(value ?? "").toLocaleLowerCase().includes(query));
    const day = manilaDay(document.created_at);
    const matchesDate = dateFilter === "all"
      || dateFilter === "today" && day === today
      || dateFilter === "yesterday" && day === shiftDay(today, -1)
      || dateFilter === "week" && day >= shiftDay(today, -6) && day <= today;
    return matchesQuery && matchesDate;
  });
  const documentsOfType = searched.filter(document => typeFilter === "all" || document.document_type === typeFilter);
  const page = useTablePagination(documentsOfType, 8);
  const selectedDocument = page.rows.find(document => String(document.id) === selectedId) ?? page.rows[0] ?? null;
  const hasFilters = Boolean(search.trim()) || typeFilter !== "all" || dateFilter !== "all";
  const counts = {
    all: searched.length,
    receipt: searched.filter(document => document.document_type === "receipt").length,
    folio: searched.filter(document => document.document_type === "folio").length,
  };
  const clearFilters = () => {
    setTypeFilter("all");
    setDateFilter("all");
    setSearch("");
    page.setPage(1);
  };
  const changeType = (value: string) => {
    setTypeFilter(value);
    page.setPage(1);
  };
  const changeDate = (value: string) => {
    setDateFilter(value);
    page.setPage(1);
  };

  return <div className="fd-module">
    <PageHeader variant="default" title="Financial documents" subtitle="Find issued payment receipts and guest folio statements." />
    <div className={`fd-workspace${mobileDetailOpen ? " is-mobile-detail" : ""}`}>
      <section className="fd-register" aria-labelledby="fd-register-heading">
        <header className="fd-register-heading">
          <h2 id="fd-register-heading">Document register</h2>
          <span role="status">{documentsOfType.length} {documentsOfType.length === 1 ? "record" : "records"}</span>
        </header>
        <div className="fd-type-filters" role="group" aria-label="Filter documents by type">
          {([
            ["all", "All documents", counts.all],
            ["receipt", "Receipts", counts.receipt],
            ["folio", "Folio statements", counts.folio],
          ] as const).map(([value, title, count]) => <button key={value} type="button" aria-pressed={typeFilter === value} onClick={() => changeType(value)}>
            {title}<span>{count}</span>
          </button>)}
        </div>
        <div className="fd-toolbar">
          <HavenSearchInput value={search} onValueChange={value => { setSearch(value); page.setPage(1); }} label="Search financial documents" placeholder="Search number, guest, or booking" debounceMs={180} />
          <label className="fd-date-filter">
            <CalendarDays size={16} aria-hidden="true" />
            <span className="visually-hidden">Filter by issue date in Manila</span>
            <select value={dateFilter} onChange={event => changeDate(event.target.value)}>
              <option value="all">All issue dates</option>
              <option value="today">Today · Manila</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          {hasFilters && <button className="fd-clear-filters" type="button" onClick={clearFilters}>Clear filters</button>}
        </div>
        <div className="fd-list" aria-label="Issued financial documents">
          {page.rows.length ? page.rows.map(document => {
            const snapshot = snapshotOf(document.snapshot);
            const isReceipt = document.document_type === "receipt";
            const id = String(document.id);
            const isSelected = selectedDocument ? String(selectedDocument.id) === id : false;
            const issuedAt = document.created_at;
            return <button
              className={`fd-document-row${isSelected ? " is-selected" : ""}`}
              key={id}
              id={`fd-document-${id}`}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${documentName(String(document.document_type))} ${text(document.document_number)}, ${text(snapshot.guestName)}, booking ${text(snapshot.confirmationNumber ?? snapshot.reservationId ?? document.reservation_id)}, issued ${issueDate(issuedAt)}`}
              onClick={() => {
                setSelectedId(String(document.id));
                if (window.matchMedia("(max-width: 900px)").matches) setMobileDetailOpen(true);
              }}
            >
              <span className={`fd-type-icon ${isReceipt ? "is-receipt" : "is-folio"}`}>{isReceipt ? <ReceiptText size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}</span>
              <span className="fd-document-identity">
                <span className="fd-document-number">{text(document.document_number)}</span>
                <span className="fd-document-type">{documentName(String(document.document_type))}</span>
              </span>
              <span className="fd-document-guest">
                <span>{text(snapshot.guestName)}</span>
                <small>{text(snapshot.confirmationNumber ?? snapshot.reservationId ?? document.reservation_id)}</small>
                <small className="fd-mobile-date">{issueDate(issuedAt)}</small>
              </span>
              <time className="fd-document-issued" dateTime={String(issuedAt ?? "")}>
                <span>{issueDate(issuedAt)}</span><small>{issueTime(issuedAt)}</small>
              </time>
              <ChevronRight className="fd-row-chevron" size={16} aria-hidden="true" />
            </button>;
          }) : <div className="fd-empty">
            <Search size={21} aria-hidden="true" />
            <h3>{documents.length && hasFilters ? "No matching documents" : "No documents issued yet"}</h3>
            <p>{documents.length && hasFilters ? "Try a different number, guest, booking, or issue date." : "Issued receipts and folio statements will appear here."}</p>
            {hasFilters && <button className="fd-clear-filters" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>}
        </div>
        <TablePagination {...page} onPageChange={page.setPage} noun="documents" note="Issued snapshots stay in their original order." />
      </section>
      <section className="fd-preview" aria-labelledby="fd-preview-heading">
        <header className="fd-preview-heading">
          <button className="fd-back" type="button" onClick={() => setMobileDetailOpen(false)}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to documents
          </button>
          <div>
            <h2 id="fd-preview-heading" ref={documentHeading} tabIndex={-1}>Document preview</h2>
            <span><LockKeyhole size={13} aria-hidden="true" /> Read-only</span>
          </div>
        </header>
        <div className="fd-preview-content"><DocumentSnapshot document={selectedDocument} /></div>
      </section>
    </div>
  </div>;
}
