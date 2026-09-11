"use client";
// Guided Front Desk arrival → room assignment → check-in.
// Self-sufficient: fetches the reservation detail, eligible rooms, and any
// approved room-type exception itself, so both the Reservations row action and
// the Approvals "execute room-type exception" entry open the same flow. Every
// step is presentational; the server (front_desk_check_in) remains the arbiter
// and its friendly gate errors are surfaced inline on the final step.
import { useCallback, useEffect, useRef, useState } from "react";
import { BedDouble, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, KeyRound, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RecordItem } from "@/lib/types";
import type { AskFormOptions, AskFormData } from "@/components/ui/action-dialogs";
import { ROOM_TYPE_CHANGE_REASONS, roomTypeChangeResponsibility, roomTypeChangeReasonLabel, financialDifference, type RoomTypeChangeFinancials } from "@/lib/room-type-change-reasons";

type EligibleRoom = { id: string; number: string; floor?: unknown; type: string; housekeeping?: string };
type AlternativeRoomType = { roomTypeId: string; roomTypeName: string; eligibleRoomCount: number };
type InvoiceRow = { amount?: unknown; paid?: unknown; balance?: unknown; credit_balance?: unknown; status?: string };
type Detail = { reservation: RecordItem; invoice: InvoiceRow | null };

const moneyExact = (v: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(v || 0));
const human = (v: unknown) => String(v ?? "").replaceAll("_", " ");
const DAY = 86400000;
const nightsBetween = (a: unknown, b: unknown) => { const from = Date.parse(String(a ?? "").slice(0, 10)); const to = Date.parse(String(b ?? "").slice(0, 10)); return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.round((to - from) / DAY)) : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

const STEPS = [
  { key: "identity", label: "Identity", icon: ShieldCheck },
  { key: "financial", label: "Financial", icon: Wallet },
  { key: "room", label: "Room", icon: BedDouble },
  { key: "checkin", label: "Check in", icon: ClipboardCheck },
];

// Wizard progress lifted to the parent so a closed-and-reopened dialog resumes where
// the front desk left off (step + chosen room + active exception mode). In-memory only:
// the server re-validates everything on room-step entry and at check-in.
export type ArrivalProgress = { step: number; selected: string; exceptionMode: string | null };

export default function FrontDeskArrivalDialog({ reservationId, guestName, exceptionType, askForm, resume, onProgress, onClose, onCheckedIn }: {
  reservationId: string;
  guestName: string;
  exceptionType?: string | null;
  askForm: (options: AskFormOptions) => Promise<AskFormData | null>;
  resume?: ArrivalProgress | null;
  onProgress?: (progress: ArrivalProgress) => void;
  onClose: () => void;
  onCheckedIn: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [step, setStep] = useState(0);
  const [rooms, setRooms] = useState<EligibleRoom[]>([]);
  const [exceptionMode, setExceptionMode] = useState<string | null>(exceptionType ?? null);
  const [exceptionFinancials, setExceptionFinancials] = useState<RoomTypeChangeFinancials | null>(null);
  const [approvedException, setApprovedException] = useState<{ type: string; id: string; financials: RoomTypeChangeFinancials | null; guestAcceptedAt: string | null } | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Alternative-assignment exception state: every option comes from the server's
  // eligible-inventory endpoint — never free text, never client-side availability.
  const [alternatives, setAlternatives] = useState<AlternativeRoomType[]>([]);
  const [reservedRoomTypeId, setReservedRoomTypeId] = useState("");
  const [targetTypeId, setTargetTypeId] = useState("");
  const [targetRooms, setTargetRooms] = useState<EligibleRoom[]>([]);
  const [targetRoomsLoading, setTargetRoomsLoading] = useState(false);
  const [requestedRoomId, setRequestedRoomId] = useState("");
  const [requestedReasonCode, setRequestedReasonCode] = useState("");
  const [requestedReason, setRequestedReason] = useState("");
  const [targetRate, setTargetRate] = useState<number | null>(null);
  const [targetNightlyRates, setTargetNightlyRates] = useState<{ night: string; rate: number }[]>([]);
  const [requestSent, setRequestSent] = useState(false);
  const [exceptionStatus, setExceptionStatus] = useState<"" | "pending" | "rejected">("");
  // Voluntary reassignment while reserved-type rooms remain: the form is reachable
  // through this toggle (guest-requested reasons are legitimate upgrades).
  const [showAlternativeForm, setShowAlternativeForm] = useState(false);
  const loadingRef = useRef(false);
  // Mount-time capture of the resume payload: the parent keys this dialog per open,
  // so the ref is read exactly once per open and later prop changes are ignored.
  const resumeRef = useRef(resume);

  const reservation = detail?.reservation ?? null;
  const invoice = detail?.invoice ?? null;

  // Policy drives whether valid-ID verification is required at check-in
  // (mirrors the server's default of required when the snapshot is absent).
  const policy = reservation && typeof reservation.operational_policy_snapshot === "object" && reservation.operational_policy_snapshot ? (reservation.operational_policy_snapshot as Record<string, unknown>) : null;
  const idRequired = typeof policy?.validIdRequired === "boolean" ? policy.validIdRequired : true;
  const identityReady = reservation ? String(reservation.identity_status) === "verified" || !idRequired : false;
  const websiteDepositRequired = reservation ? String(reservation.source).toLowerCase() === "website" && Number(reservation.deposit_required || 0) > 0 : false;
  const depositReady = reservation ? !websiteDepositRequired || ["partial", "paid", "credit"].includes(String(reservation.payment_status)) : false;
  const balance = invoice ? Number(invoice.balance ?? 0) : null;
  const financialReady = balance !== null && balance <= 0 && depositReady;
  const nights = reservation ? nightsBetween(reservation.check_in, reservation.check_out) : 0;
  const paid = invoice ? Number(invoice.paid ?? 0) : Number(reservation?.deposit || 0);
  // Server-stamped financials for the active exception (approved callout or exception
  // mode); display only — the RPCs re-derive and consume the stamp server-side.
  const exceptionFinancialsActive = exceptionMode ? (exceptionFinancials ?? approvedException?.financials ?? null) : null;
  const exceptionDiff = financialDifference(exceptionFinancialsActive);
  const exceptionResponsibility = exceptionFinancialsActive?.responsibility ?? null;

  const fetchDetail = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/staff/reservations/${reservationId}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Unable to load the reservation."); setDetail(null); return; }
      setDetail(body.data as Detail);
    } finally { setBusy(false); }
  }, [reservationId]);

  // Returns the mapped rooms so the caller can validate a resumed selection.
  const loadRooms = useCallback(async (mode: string | null): Promise<EligibleRoom[]> => {
    const q = mode ? `?exceptionType=${encodeURIComponent(mode)}` : "";
    const res = await fetch(`/api/front-desk/reservations/${reservationId}/eligible-rooms${q}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Unable to load eligible rooms."); setRooms([]); setAlternatives([]); return []; }
    const mapped = ((body.data ?? []) as EligibleRoom[]).map((room) => ({ ...room, number: String(room.number) }));
    setRooms(mapped);
    setAlternatives(((body.alternativeRoomTypes ?? []) as AlternativeRoomType[]));
    setReservedRoomTypeId(String(body.reservedRoomTypeId ?? ""));
    if (mode) {
      if (body.exceptionApproved) { setExceptionFinancials((body.financials ?? null) as RoomTypeChangeFinancials | null); }
      else { setError(`The approved room-type exception for ${human(mode)} is no longer valid.`); setExceptionMode(null); setExceptionFinancials(null); return mapped; }
    } else { setExceptionFinancials(null); }
    setSelected("");
    return mapped;
  }, [reservationId]);

  const checkApprovals = useCallback(async () => {
    const res = await fetch("/api/manager/approvals", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    const rows = (body.data ?? []) as (RecordItem & { requested_action?: Record<string, unknown> | null })[];
    const latest = rows
      .filter((row) => String(row.reservation_id) === reservationId && row.request_type === "room_type_exception")
      .sort((a, b) => String(b.requested_at ?? "").localeCompare(String(a.requested_at ?? "")))[0];
    if (!latest) return;
    if (latest.status === "approved" && latest.execution_status === "awaiting_execution") {
      const action = (latest.requested_action ?? {}) as Record<string, unknown>;
      const target = String(action.roomType || "");
      if (target) { setApprovedException({ type: target, id: String(latest.id), financials: (action.financials ?? null) as RoomTypeChangeFinancials | null, guestAcceptedAt: latest.guest_accepted_at ? String(latest.guest_accepted_at) : null }); setExceptionStatus(""); }
    } else if (latest.status === "pending") {
      setExceptionStatus("pending");
    } else if (latest.status === "rejected") {
      setExceptionStatus("rejected");
    }
  }, [reservationId]);

  // Load the eligible physical rooms of one alternative room type (server-filtered).
  // A 409 means the inventory shifted while the dialog was open — clear the stale
  // selection and reload both availability lists.
  const loadTargetRooms = useCallback(async (roomTypeId: string) => {
    setRequestedRoomId(""); setTargetRooms([]); setTargetRoomsLoading(true); setError("");
    try {
      const res = await fetch(`/api/front-desk/reservations/${reservationId}/eligible-rooms?roomTypeId=${encodeURIComponent(roomTypeId)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTargetTypeId("");
        setError(body.error ?? "Room inventory changed. Please refresh and choose again.");
        await loadRooms(null);
        await checkApprovals();
        return;
      }
      setTargetRooms(((body.data ?? []) as EligibleRoom[]).map((room) => ({ ...room, number: String(room.number) })));
      setTargetRate(body.typeRate === null || body.typeRate === undefined ? null : Number(body.typeRate));
      setTargetNightlyRates(((body.nightlyRates ?? []) as { night: string; rate: number }[]).map((night) => ({ night: String(night.night), rate: Number(night.rate) })));
    } finally { setTargetRoomsLoading(false); }
  }, [reservationId, loadRooms, checkApprovals]);

  const selectTargetType = (value: string) => {
    setTargetTypeId(value);
    setRequestedRoomId(""); setTargetRooms([]);
    if (value) void loadTargetRooms(value); else { setTargetRate(null); setTargetNightlyRates([]); }
  };
  const clearAlternativeSelection = () => { setTargetTypeId(""); setTargetRooms([]); setRequestedRoomId(""); setTargetRate(null); setTargetNightlyRates([]); };

  // Open: reset and pull fresh server state. A resume (the wizard was previously left
  // mid-flow for this reservation) restores the step, chosen room, and active exception
  // mode — everything else reloads from the server. checkApprovals runs here too so the
  // Financial step can itemize an accepted upgrade charge before the Room step.
  useEffect(() => {
    const saved = resumeRef.current;
    setStep(saved?.step ?? 0); setRooms([]);
    setExceptionMode(saved ? saved.exceptionMode : exceptionType ?? null);
    setExceptionFinancials(null); setApprovedException(null); setSelected(saved?.selected ?? ""); setError(""); setNotice("");
    setAlternatives([]); setTargetTypeId(""); setTargetRooms([]); setRequestedRoomId(""); setRequestedReasonCode(""); setRequestedReason(""); setTargetRate(null); setTargetNightlyRates([]); setRequestSent(false); setExceptionStatus(""); setShowAlternativeForm(false);
    void fetchDetail();
    void checkApprovals();
  }, [exceptionType, fetchDetail, checkApprovals]);

  // Room step entry: load rooms for the active mode and scan for an approved exception.
  // A resumed flow re-validates the saved room selection against live inventory on the
  // first entry — restored when still eligible, or clamped back to this step when not
  // (the server rejects stale rooms at check-in regardless). The resume survives the
  // detail fetch (reservation is null on the first run) and is consumed only when the
  // load actually runs.
  useEffect(() => {
    const saved = resumeRef.current;
    const resumingAtRoom = Boolean(saved && saved.step >= 2);
    if ((!resumingAtRoom && step !== 2) || !reservation || loadingRef.current) return;
    resumeRef.current = null; // one-shot: only the first load after (re)open restores
    loadingRef.current = true;
    setError(""); setNotice("");
    (async () => {
      const loaded = await loadRooms(exceptionMode);
      if (!exceptionMode) await checkApprovals();
      if (saved) {
        if (saved.selected && loaded.some((room) => room.number === saved.selected)) { setSelected(saved.selected); }
        else if (saved.step >= 3) { setStep(2); }
      }
    })().finally(() => { loadingRef.current = false; });
  }, [step, exceptionMode, reservation, loadRooms, checkApprovals]);

  // Report wizard progress upward so the parent can resume the flow after close.
  // The transient mount-time report (pre-restore values) is harmless: resume is read
  // through the mount-time ref only, and this converges to the true state in-mount.
  useEffect(() => { onProgress?.({ step, selected, exceptionMode }); }, [step, selected, exceptionMode, onProgress]);

  // Escape / overlay / close-button all route through the shared Modal — this
  // guard keeps a posting step from dismissing the wizard.
  const guardedClose = () => { if (!busy) onClose(); };

  if (!reservation) {
    return (
      <Modal
        isOpen
        onClose={guardedClose}
        title={`Check in ${human(guestName)}`}
        description="Arrival workflow — loading reservation details."
        size="xl"
        headerVariant="branded"
      >
        <div className="arrival-body"><div className="arrival-empty">{error ? <p className="arrival-error">{error}</p> : <p>Loading arrival details…</p>}<button className="btn btn-soft" onClick={fetchDetail}><RefreshCw size={15} /> Retry</button></div></div>
      </Modal>
    );
  }

  const notConfirmed = String(reservation.status) !== "confirmed";
  const stepOk = (index: number) => (index === 0 ? identityReady : index === 1 ? financialReady : index === 2 ? Boolean(selected) : false);

  const next = () => {
    setError("");
    if (step === 0 && !identityReady) { setError("Verify the guest's valid ID before continuing."); return; }
    if (step === 1 && !financialReady) { setError(depositReady ? "Collect the remaining folio balance before continuing." : "The website deposit must be verified before this guest can check in."); return; }
    if (step === 2 && !selected) { setError("Choose one of the eligible rooms."); return; }
    setNotice(""); setStep((s) => s + 1);
  };
  const back = () => { setError(""); setNotice(""); setStep((s) => Math.max(0, s - 1)); };

  const doVerify = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/front-desk/reservations/${reservationId}/identity`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Identity verification is not permitted for this reservation."); return; }
      setNotice("Guest identity verified.");
      await fetchDetail();
    } finally { setBusy(false); }
  };

  const doCollect = async () => {
    const data = await askForm({
      title: "Collect payment",
      description: "Record a payment against this guest's folio. The remaining balance must be settled before check-in.",
      fields: [
        { key: "amount", label: "Payment amount (PHP)", type: "number", required: true, min: 0.01, step: 0.01, validation: (v: string | number | boolean) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) && n > 0 ? null : "Enter a payment amount greater than zero."; } },
        { key: "method", label: "Method", type: "select", required: true, defaultValue: "cash", options: ["cash", "card", "bank_transfer", "gcash"].map((value) => ({ value, label: human(value) })), validation: () => null },
        { key: "reference", label: "Transaction reference", type: "text", required: true, dependsOn: "method", showWhen: (v: string | number | boolean) => String(v) !== "cash", validation: (v: string | number | boolean) => (String(v ?? "").trim() ? null : "Enter the payment reference.") },
      ],
      submitText: "Record payment",
    });
    if (!data) return;
    const method = String(data.method);
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/front-desk/reservations/${reservationId}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(data.amount), method, reference: method === "cash" ? null : String(data.reference), idempotencyKey: crypto.randomUUID(), allowOverpayment: false }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Unable to record payment."); return; }
      const ref = String(body.data?.reference ?? "");
      setNotice(Number(body.data?.folio_credit ?? 0) > 0
        ? `Payment recorded${ref ? ` · ${ref}` : ""}. Folio credit: ${moneyExact(body.data.folio_credit)}.`
        : `Payment recorded in the folio${ref ? ` · ${ref}` : ""}.`);
      await fetchDetail();
    } finally { setBusy(false); }
  };

  const sendExceptionRequest = async () => {
    const alternative = alternatives.find((type) => type.roomTypeId === targetTypeId);
    const room = targetRooms.find((item) => item.id === requestedRoomId);
    if (!alternative || !room) { setError("Choose a target room type and one of its eligible physical rooms."); return; }
    if (!requestedReasonCode) { setError("Choose the reason for the room-type change."); return; }
    if (requestedReason.trim().length < 3) { setError("Explain why the exception is required."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/manager/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "room_type_exception", relatedEntityType: "reservation", relatedEntityId: reservationId, reservationId, department: "front_desk", severity: "normal", reason: requestedReason.trim(), requestedAction: { reasonCode: requestedReasonCode, roomType: alternative.roomTypeName, requestedRoomTypeId: alternative.roomTypeId, requestedRoomId: room.id, requestedRoomNumber: String(room.number), originalRoomTypeId: reservedRoomTypeId, originalRoomType: reservation?.room_type ?? "" } }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Unable to request the Manager exception."); return; }
      setRequestSent(true); setExceptionStatus("pending"); clearAlternativeSelection(); setRequestedReason(""); setRequestedReasonCode(""); setShowAlternativeForm(false);
    } finally { setBusy(false); }
  };

  // Record the guest's acceptance of a guest-pays difference. The RPC (not this
  // dialog) posts the upgrade charge to the folio and stamps the acceptance —
  // check-in cannot finalize without it.
  const doRecordAcceptance = async () => {
    if (!approvedException) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/manager/approvals/${approvedException.id}/record-acceptance`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Unable to record guest acceptance."); return; }
      setNotice("Guest acceptance recorded — the upgrade charge is now on the folio.");
      await checkApprovals();
      await fetchDetail();
    } finally { setBusy(false); }
  };

  const doCheckIn = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/front-desk/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, room: selected }) });
      if (res.ok) { onCheckedIn(); return; }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Unable to complete check-in.");
    } finally { setBusy(false); }
  };

  const eligibleLabel = exceptionMode ? `rooms of the approved type ${human(exceptionMode)}` : `rooms of the reserved type ${human(reservation.room_type)}`;

  // When an exception is already approved, the request form exists only for asking
  // for a DIFFERENT type — the approved one is filtered out so staff can't send a
  // duplicate approval request for what a Manager already granted.
  const approvedTypeName = approvedException && !exceptionMode ? human(approvedException.type) : "";
  const requestableAlternatives = approvedTypeName ? alternatives.filter((type) => type.roomTypeName !== approvedTypeName) : alternatives;

  // Controlled exception form: every select is fed by the server's eligible-inventory
  // lists or the shared reason allowlist — the reserved type, inactive types, types
  // with zero eligible rooms, and unknown reason codes never appear as options.
  const exceptionForm = (
    <div className="arrival-exception-request">
      <b>Alternative room assignment</b>
      {approvedTypeName && <small className="arrival-exception-hint">Need a different room type than the approved {approvedTypeName}? Request another exception below.</small>}
      <label className="arrival-field">Target room type
        <select value={targetTypeId} onChange={(event) => selectTargetType(event.target.value)} disabled={busy}>
          <option value="">Select an available room type</option>
          {requestableAlternatives.map((type) => (
            <option key={type.roomTypeId} value={type.roomTypeId}>{type.roomTypeName} — {type.eligibleRoomCount} room{type.eligibleRoomCount === 1 ? "" : "s"} available</option>
          ))}
        </select>
      </label>
      {targetTypeId && (
        <label className="arrival-field">Physical room
          {targetRoomsLoading ? <small>Loading eligible rooms…</small> : targetRooms.length === 0 ? <small>No eligible rooms of that type are available right now.</small> : (
            <select value={requestedRoomId} onChange={(event) => setRequestedRoomId(event.target.value)} disabled={busy}>
              <option value="">Select a physical room</option>
              {targetRooms.map((room) => (
                <option key={room.id} value={room.id}>Room {human(room.number)}{room.floor !== undefined && room.floor !== null ? ` · Floor ${human(room.floor)}` : ""}</option>
              ))}
            </select>
          )}
        </label>
      )}
      {requestedReasonCode && roomTypeChangeResponsibility(requestedReasonCode) === "hotel" && rooms.length > 0 && (
        <small className="arrival-exception-hint warn">Reserved-type rooms are still available — a hotel-caused reason will be rejected as unnecessary. Pick a reserved-type room, or choose a guest-requested reason if the guest wants the change.</small>
      )}
      {requestedReasonCode && reservation && (() => {
        // Per-night resolver rates when the server sent them; base-rate fallback
        // otherwise. Preview only — the exception RPC stamps the real financials.
        const rates = targetNightlyRates.map((night) => night.rate);
        const uniform = rates.length > 0 && rates.every((rate) => rate === rates[0]);
        const previewTotal = rates.length > 0
          ? round2(rates.reduce((sum, rate) => sum + rate, 0))
          : targetRate !== null ? round2(Number(targetRate) * nights) : null;
        if (previewTotal === null) return null;
        const previewDiff = round2(previewTotal - Number(reservation.total || 0));
        const payer = roomTypeChangeResponsibility(requestedReasonCode);
        return (
          <small className="arrival-exception-hint">
            {uniform
              ? <>Target rate {moneyExact(rates[0])} × {nights} night{nights === 1 ? "" : "s"} = {moneyExact(previewTotal)}</>
              : <>{nights} night{nights === 1 ? "" : "s"} at varying rates ({moneyExact(Math.min(...rates))}–{moneyExact(Math.max(...rates))}) = {moneyExact(previewTotal)}</>}{" "}
            vs the agreed total {moneyExact(reservation.total)} —{" "}
            {payer === "hotel"
              ? previewDiff > 0 ? `the hotel absorbs ${moneyExact(previewDiff)}; the guest keeps the agreed price.` : "no guest charge; the guest keeps the agreed price."
              : previewDiff > 0 ? `the guest pays ${moneyExact(previewDiff)} on acceptance.` : "no additional guest charge."}
            {" "}(The server derives the final amounts — this is a preview.)
          </small>
        );
      })()}
      <label className="arrival-field">Reason for the change
        <select value={requestedReasonCode} onChange={(event) => setRequestedReasonCode(event.target.value)} disabled={busy}>
          <option value="">Select a reason</option>
          <optgroup label="Hotel-caused — the hotel absorbs the difference">
            {ROOM_TYPE_CHANGE_REASONS.filter((reason) => reason.responsibility === "hotel").map((reason) => (
              <option key={reason.code} value={reason.code}>{reason.label}</option>
            ))}
          </optgroup>
          <optgroup label="Guest-requested — the guest pays the difference">
            {ROOM_TYPE_CHANGE_REASONS.filter((reason) => reason.responsibility === "guest").map((reason) => (
              <option key={reason.code} value={reason.code}>{reason.label}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="arrival-field">Why is the exception required?<textarea rows={3} value={requestedReason} onChange={(event) => setRequestedReason(event.target.value)} placeholder="Explain why the guest must be reassigned to another room type." /></label>
      <div className="arrival-actions">
        <button className="btn btn-soft" disabled={busy} onClick={() => { clearAlternativeSelection(); setRequestedReason(""); setRequestedReasonCode(""); setShowAlternativeForm(false); }}>Cancel</button>
        <button className="btn btn-accent" disabled={busy || !targetTypeId || !requestedRoomId || !requestedReasonCode || requestedReason.trim().length < 3} onClick={sendExceptionRequest}>Request Manager approval</button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={guardedClose}
      title={`Check in ${human(guestName)}`}
      description={`${human(reservation.source)} reservation · ${human(reservation.confirmation_number || reservation.id)}`}
      size="xl"
      headerVariant="branded"
      footer={
        !notConfirmed ? (
          <div className="arrival-footer">
            {step > 0 && <button className="btn btn-soft" onClick={back} disabled={busy}><ChevronLeft size={15} /> Back</button>}
            {step === 3
              ? <button className="btn btn-accent" onClick={doCheckIn} disabled={busy}>{busy ? "Checking in…" : "Check in guest"}</button>
              : step === 2
                ? <button className="btn btn-accent" onClick={next} disabled={busy || !selected}><ClipboardCheck size={15} /> Review &amp; check in <ChevronRight size={15} /></button>
                : <button className="btn btn-accent" onClick={next} disabled={busy || !stepOk(step)}>Continue <ChevronRight size={15} /></button>}
          </div>
        ) : undefined
      }
    >
      <span className={`badge ${reservation.status}`}>{human(reservation.status)}</span>

      <div className="arrival-summary">
          <span><b>{human(reservation.confirmation_number || reservation.id)}</b> · {human(reservation.room_type)}</span>
          <span>{human(reservation.check_in)} to {human(reservation.check_out)} · {nights} night{nights === 1 ? "" : "s"}</span>
        </div>

        {notConfirmed && <p className="arrival-error">This reservation is no longer confirmed and cannot be checked in.</p>}

        <div className="arrival-steps" role="tablist" aria-label="Check-in steps">
          {STEPS.map((item, index) => (
            <div key={item.key} className={`arrival-step ${index < step ? "done" : ""} ${index === step ? "active" : ""}`}>
              <span className="arrival-step-badge">{index < step ? <Check size={14} /> : index + 1}</span>
              <span className="arrival-step-label"><item.icon size={13} /> {item.label}</span>
            </div>
          ))}
        </div>

        <div className="arrival-body">
          {error && <p className="arrival-error" role="alert">{error}</p>}
          {notice && !error && <p className="arrival-notice">{notice}</p>}

          {step === 0 && (
            <section className="arrival-section">
              <h3>Guest identity</h3>
              <p className="arrival-section-copy">Confirm the guest&apos;s valid ID before this arrival can be assigned and checked in.</p>
              <div className="arrival-facts">
                <div><dt>Identity status</dt><dd><span className={`badge ${String(reservation.identity_status || "unverified")}`}>{human(reservation.identity_status || "unverified")}</span></dd></div>
                <div><dt>Policy requirement</dt><dd>{idRequired ? "Valid ID required" : "Valid ID not required by policy"}</dd></div>
              </div>
              <div className="arrival-actions">
                {String(reservation.identity_status) !== "verified" && <button className="btn btn-soft" onClick={doVerify} disabled={busy}><KeyRound size={15} /> Verify guest ID</button>}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="arrival-section">
              <h3>Financial readiness</h3>
              <p className="arrival-section-copy">The folio must show no remaining balance before this arrival checks in.</p>
              <div className="arrival-facts">
                <div><dt>Folio total</dt><dd>{moneyExact(invoice?.amount ?? reservation.total)}</dd></div>
                {approvedException?.guestAcceptedAt && approvedException.financials?.responsibility === "guest" && financialDifference(approvedException.financials) > 0 && (
                  <div><dt>Upgrade charge</dt><dd>{moneyExact(financialDifference(approvedException.financials))} (included in the folio total)</dd></div>
                )}
                <div><dt>Net paid</dt><dd>{moneyExact(invoice?.paid ?? reservation.deposit)}</dd></div>
                <div><dt>Balance</dt><dd>{moneyExact(balance)}</dd></div>
                <div><dt>Source</dt><dd>{human(reservation.source)}</dd></div>
              </div>
              {websiteDepositRequired && !depositReady && <p className="arrival-notice warn">This website booking requires a verified deposit before check-in. Verify it in Deposit Verification first.</p>}
              <div className="arrival-actions">
                {Number(balance || 0) > 0 && <button className="btn btn-soft" onClick={doCollect} disabled={busy}><Wallet size={15} /> Collect {moneyExact(balance)}</button>}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="arrival-section">
              <h3>Choose the physical room</h3>
              <p className="arrival-section-copy">Only clean, serviceable, conflict-free {eligibleLabel} are shown. The server re-checks readiness atomically at check-in.</p>

              {approvedException && !exceptionMode && (
                <div className="arrival-approval" role="status">
                  <div className="arrival-approval-body">
                    <p className="arrival-approval-title"><CheckCircle2 size={14} aria-hidden="true" /> Room-type exception approved</p>
                    <p className="arrival-approval-detail">A Manager approved <b>{human(approvedException.type)}</b> as the alternative room type for this reservation. Load those rooms to continue check-in.</p>
                    {approvedException.financials && (() => {
                      const fin = approvedException.financials;
                      const diff = financialDifference(fin);
                      return (
                        <>
                          <p className="arrival-approval-detail">
                            {roomTypeChangeReasonLabel(fin.reasonCode ?? "")} —{" "}
                            {fin.responsibility === "hotel"
                              ? diff > 0
                                ? <>the hotel absorbs <b>{moneyExact(diff)}</b>; the guest keeps the agreed total of <b>{moneyExact(fin.originalTotal)}</b>.</>
                                : <>the guest keeps the agreed total of <b>{moneyExact(fin.originalTotal)}</b> (rate difference {moneyExact(diff)} — no automatic refund applies).</>
                              : diff > 0
                                ? <>the guest pays <b>{moneyExact(diff)}</b> on top of the agreed total of {moneyExact(fin.originalTotal)} (new total <b>{moneyExact(fin.targetTotal)}</b>).</>
                                : <>no additional guest charge (new total {moneyExact(fin.targetTotal)}).</>}
                          </p>
                          {fin.responsibility === "guest" && diff > 0 && (
                            approvedException.guestAcceptedAt
                              ? <p className="arrival-approval-detail">Guest acceptance recorded — the {moneyExact(diff)} upgrade charge is on the folio.</p>
                              : <div className="arrival-actions"><button className="btn btn-soft" disabled={busy} onClick={doRecordAcceptance}>Record guest acceptance of {moneyExact(diff)}</button></div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <button className="btn btn-accent arrival-approval-cta" disabled={busy} onClick={() => { setError(""); setExceptionMode(approvedException.type); }}>Load {human(approvedException.type)} rooms</button>
                </div>
              )}
              {exceptionMode && (
                <p className="arrival-notice approved">
                  <CheckCircle2 size={13} aria-hidden="true" /> Approved exception active — checking in to <b>{human(exceptionMode)}</b>{" "}
                  {exceptionResponsibility === "hotel"
                    ? "keeps the original agreed total; the hotel absorbs any rate difference."
                    : exceptionDiff > 0
                      ? `adds a ${moneyExact(exceptionDiff)} guest charge (${approvedException?.guestAcceptedAt ? "acceptance recorded" : "guest acceptance required"}).`
                      : "keeps the original agreed total."}{" "}
                  <button className="table-action" disabled={busy} onClick={() => { setError(""); setExceptionMode(null); }}>Use reserved-type rooms instead</button>
                </p>
              )}

              {rooms.length > 0 && (
                <div className="arrival-options" role="radiogroup" aria-label="Eligible rooms">
                  {rooms.map((room) => (
                    <label key={room.id || room.number} className={`arrival-option ${selected === room.number ? "selected" : ""}`}>
                      <input type="radio" name="arrival-room" value={room.number} checked={selected === room.number} onChange={(e) => setSelected(e.target.value)} disabled={busy} />
                      <span className="arrival-option-name"><b>Room {human(room.number)}</b><small>{human(room.type)}{room.floor !== undefined ? ` · Floor ${human(room.floor)}` : ""}</small></span>
                      <span className="arrival-option-ready"><Check size={14} /> Ready</span>
                    </label>
                  ))}
                </div>
              )}

              {!exceptionMode && rooms.length > 0 && requestableAlternatives.length > 0 && (showAlternativeForm ? exceptionForm : (
                // Reserved-type rooms exist, but a guest-requested upgrade is a legitimate
                // exception — the server gates decide (hotel-caused reasons are rejected
                // as unnecessary while reserved-type rooms remain).
                <button className="btn btn-soft" disabled={busy} onClick={() => { setError(""); setShowAlternativeForm(true); }}>Request a different room type</button>
              ))}

              {rooms.length === 0 && !busy && (
                <div className="arrival-empty">
                  <p>No eligible {eligibleLabel} are available right now.</p>
                  {!exceptionMode && (
                    requestSent || exceptionStatus === "pending" ? (
                      <p className="arrival-notice">Room-type exception requested. Once a Manager approves it, refresh to load the approved type&apos;s rooms.</p>
                    ) : exceptionStatus === "rejected" ? (
                      <>
                        <p className="arrival-notice warn">A Manager rejected the room-type exception request. Choose another eligible room type and room below, or refresh to re-check inventory.</p>
                        {exceptionForm}
                      </>
                    ) : requestableAlternatives.length === 0 ? (
                      // With an approved exception, the callout above is the path
                      // forward — only announce "no alternatives" when nothing was approved.
                      approvedTypeName ? null : <p className="arrival-notice">No alternative room types currently have eligible rooms. Use Refresh eligible rooms to re-check inventory.</p>
                    ) : (
                      exceptionForm
                    )
                  )}
                  {exceptionMode && <button className="btn btn-soft" disabled={busy} onClick={() => { setError(""); setExceptionMode(null); }}>Try reserved-type rooms instead</button>}
                </div>
              )}
              <button className="btn btn-soft arrival-refresh" disabled={busy} onClick={() => { setError(""); setSelected(""); clearAlternativeSelection(); if (exceptionMode) { void loadRooms(exceptionMode); } else { void loadRooms(null); void checkApprovals(); } }}><RefreshCw size={14} /> Refresh eligible rooms</button>
            </section>
          )}

          {step === 3 && (
            <section className="arrival-section">
              <h3>Review and check in</h3>
              <div className="arrival-facts">
                <div><dt>Guest</dt><dd>{human(reservation.guest_name)}</dd></div>
                <div><dt>Room</dt><dd>Room {human(selected)}</dd></div>
                <div><dt>Room type</dt><dd>{exceptionMode ? `${human(reservation.room_type)} → ${human(exceptionMode)}` : human(reservation.room_type)}</dd></div>
                <div><dt>Stay</dt><dd>{human(reservation.check_in)} to {human(reservation.check_out)} ({nights} night{nights === 1 ? "" : "s"})</dd></div>
                {exceptionMode && exceptionFinancialsActive && <>
                  {exceptionResponsibility === "hotel"
                    ? <>
                        <div><dt>Stay total (unchanged)</dt><dd>{moneyExact(exceptionFinancialsActive.originalTotal)} — the guest keeps the agreed price</dd></div>
                        {exceptionDiff !== 0 && <div><dt>{exceptionDiff > 0 ? "Hotel absorbs" : "Rate difference (no refund applies)"}</dt><dd>{moneyExact(exceptionDiff)}</dd></div>}
                      </>
                    : <>
                        <div><dt>Stay total</dt><dd>{moneyExact(exceptionFinancialsActive.targetTotal)}{exceptionFinancialsActive.targetRate != null ? ` (${moneyExact(exceptionFinancialsActive.targetRate)} × ${human(exceptionFinancialsActive.nights)} night${Number(exceptionFinancialsActive.nights) === 1 ? "" : "s"})` : ` · ${human(exceptionFinancialsActive.nights)} night${Number(exceptionFinancialsActive.nights) === 1 ? "" : "s"} at varying rates`}</dd></div>
                        <div><dt>{exceptionDiff > 0 ? "Upgrade difference (guest pays)" : "Rate difference (no refund applies)"}</dt><dd>{moneyExact(exceptionDiff)}</dd></div>
                      </>}
                  <div><dt>Net paid toward folio</dt><dd>{moneyExact(paid)}</dd></div>
                </>}
              </div>
              {exceptionMode && exceptionFinancialsActive && exceptionResponsibility === "guest" && exceptionDiff > 0 && !approvedException?.guestAcceptedAt && (
                <p className="arrival-notice warn">Guest acceptance of the {moneyExact(exceptionDiff)} difference must be recorded before check-in can complete.</p>
              )}
              {exceptionMode && exceptionFinancialsActive && (() => {
                const effectiveTotal = exceptionResponsibility === "guest" && exceptionDiff > 0 ? Number(exceptionFinancialsActive.targetTotal) : Number(exceptionFinancialsActive.originalTotal ?? reservation.total);
                return paid >= effectiveTotal
                  ? <p className="arrival-notice">Paid funds fully cover the stay total — check-in will proceed.</p>
                  : <p className="arrival-notice warn">The stay total {moneyExact(effectiveTotal)} exceeds the {moneyExact(paid)} already paid. Collect {moneyExact(effectiveTotal - paid)} first, then return here.</p>;
              })()}
            </section>
          )}
        </div>
    </Modal>
  );
}
