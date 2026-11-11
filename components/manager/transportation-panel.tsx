"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ArrowLeft, CalendarDays, CarTaxiFront, FileText, Info, Users } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { HavenEmptyState, HavenFilterBadges, HavenSearchInput, HavenSkeletonList } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { paginateTableRows, TablePagination } from "@/components/ui/table-pagination";
import type { FormField } from "@/components/ui/FormDialog";
import { canCancelTransportation, canOperateTransportation } from "@/lib/permissions";
import { formatHotelDateTime, formatPeso, HOTEL_TIME_ZONE } from "@/lib/format";
import { canTransition, SERVICE_TYPE_LABELS, TRANSPORTATION_STATUS_LABELS, isTerminalStatus, type TransportationAction, type TransportationStatus } from "@/lib/transportation-display";
import type { Role } from "@/lib/types";
import "./transportation-workspace.css";

// Staff Transportation workspace. Front Desk executes the whole operational path;
// Manager supervises (view + cancel/reject with reason); Owner is read-only.
// Every button here is re-checked server-side by the route guard and the RPC role gate.
type StaffTrip = {
  id: string; reservation_id: string; service_type: "PICKUP" | "DROPOFF" | "ROUND_TRIP";
  pickup_location: string; dropoff_location: string; pickup_date: string; pickup_time: string;
  return_location: string | null; return_date: string | null; return_time: string | null;
  passenger_count: number; special_instructions: string | null; status: TransportationStatus;
  driver_name: string | null; fare_amount: number | null; staff_notes: string | null; customer_visible_notes: string | null;
  cancellation_reason: string | null; version: number; created_at: string;
  reviewed_at?: string | null; scheduled_at?: string | null; assigned_at?: string | null;
  started_at?: string | null; completed_at?: string | null; cancelled_at?: string | null;
  transport_vehicle_types?: { name: string } | null;
  reservations?: { confirmation_number: string | null; guest_name: string | null; guest_email: string | null; check_in: string; check_out: string } | null;
};
type VehicleType = { id: string; name: string; seats: number; description: string | null; base_fare: number; booking_fee: number };

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const required = (message: string) => (v: string | number | boolean) => (String(v ?? "").trim() ? null : message);
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: HOTEL_TIME_ZONE });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function formatDate(value: string | null, withYear = false) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? (withYear ? fullDateFormat : dateFormat).format(date) : "Date unavailable";
}
const formatTime = (value: string | null) => value && timePattern.test(value)
  ? timeFormat.format(new Date(`2000-01-01T${value}:00Z`)) : "Time unavailable";
const guestName = (trip: StaffTrip) => trip.reservations?.guest_name?.trim() || "Guest name unavailable";
const bookingRef = (trip: StaffTrip) => trip.reservations?.confirmation_number || trip.reservation_id;
const serviceNames = { ...SERVICE_TYPE_LABELS, PICKUP: "Airport pickup", DROPOFF: "Hotel drop-off", ROUND_TRIP: "Round trip" };
const pageSize = 10;
const queues = [
  { value: "today", label: "Today" },
  { value: "planning", label: "Needs planning" },
  { value: "upcoming", label: "Upcoming" },
  { value: "history", label: "History" },
  { value: "all", label: "All" },
];
const stages = [
  { status: "REQUESTED", date: "created_at", action: "REVIEW", label: "Review request" },
  { status: "REVIEWED", date: "reviewed_at", action: "SCHEDULE", label: "Schedule trip" },
  { status: "SCHEDULED", date: "scheduled_at", action: "ASSIGN", label: "Assign driver & vehicle" },
  { status: "ASSIGNED", date: "assigned_at", action: "START", label: "Start trip" },
  { status: "IN_PROGRESS", date: "started_at", action: "COMPLETE", label: "Complete trip" },
  { status: "COMPLETED", date: "completed_at" },
] as const;
const operatingStages = stages.filter(stage => "action" in stage);

type Leg = {
  kind: "Pickup" | "Outbound" | "Return";
  date: string | null;
  time: string | null;
  from: string | null;
  to: string | null;
};

function itinerary(trip: StaffTrip): Leg[] {
  const roundTrip = trip.service_type === "ROUND_TRIP";
  const outbound: Leg = {
    kind: roundTrip ? "Outbound" : "Pickup",
    date: trip.pickup_date, time: trip.pickup_time, from: trip.pickup_location, to: trip.dropoff_location,
  };
  return roundTrip ? [outbound, {
    kind: "Return", date: trip.return_date, time: trip.return_time, from: trip.dropoff_location, to: trip.return_location,
  }] : [outbound];
}

function dispatchLeg(trip: StaffTrip, queue: string, today: string) {
  const legs = itinerary(trip);
  const terminal = isTerminalStatus(trip.status);
  if (queue === "history") return terminal ? legs[0] : undefined;
  if (queue === "all") return legs[0];
  if (terminal) return;
  if (queue === "planning") return ["REQUESTED", "REVIEWED", "SCHEDULED"].includes(trip.status) ? legs[0] : undefined;
  const scheduled = legs.filter(leg => leg.date && (leg.kind !== "Return" || leg.time && timePattern.test(leg.time)));
  if (queue === "today") return scheduled.find(leg => leg.date === today);
  return scheduled.find(leg => leg.date! > today);
}

function searchTrips(trips: StaffTrip[], service: string, search: string) {
  const term = search.trim().toLowerCase();
  return trips.filter(trip => (service === "all" || trip.service_type === service) && (!term || [
    guestName(trip), bookingRef(trip), trip.reservations?.guest_email, trip.pickup_location,
    trip.dropoff_location, trip.return_location, trip.driver_name, serviceNames[trip.service_type], trip.reservation_id,
  ].some(value => value?.toLowerCase().includes(term))));
}

function dispatchRows(trips: StaffTrip[], queue: string, today: string) {
  return trips.flatMap(trip => {
    const leg = dispatchLeg(trip, queue, today);
    return leg ? [{ trip, leg }] : [];
  }).sort((a, b) => {
    const order = `${a.leg.date ?? ""}T${a.leg.time ?? "99:99"}`.localeCompare(`${b.leg.date ?? ""}T${b.leg.time ?? "99:99"}`);
    return queue === "history" ? -order : order;
  });
}

function TripStatus({ trip }: { trip: StaffTrip }) {
  const status = trip.status.toLowerCase();
  return <StatusBadge status={status} label={TRANSPORTATION_STATUS_LABELS[trip.status]} className={`tp-trip-status tp-trip-${status}`} size="sm" showIcon={false} />;
}

function TripDetails({ trip }: { trip: StaffTrip }) {
  const legs = itinerary(trip);
  const current = stages.findIndex(stage => stage.status === trip.status);
  return <>
    <section>
      <header className="tp-section-head"><h3>Itinerary</h3><span>{legs.length} {legs.length === 1 ? "leg" : "legs"}</span></header>
      <div className="tp-legs">{legs.map(leg => <div className="tp-leg" key={leg.kind}>
        <div className="tp-leg-time"><b>{leg.kind}</b><strong>{formatTime(leg.time)}</strong><span>{formatDate(leg.date, true)}{leg.date ? " · PHT" : ""}</span></div>
        <ol className="tp-stops"><li>{leg.from || "Pickup location unavailable"}</li><li>{leg.to || "Destination unavailable"}</li></ol>
      </div>)}</div>
    </section>
    <section>
      <header className="tp-section-head"><h3>Trip progress</h3></header>
      <ol className="tp-stages">{stages.map((stage, index) => {
        const date = trip[stage.date];
        return <li key={stage.status} aria-current={index === current ? "step" : undefined} data-done={index < current || Boolean(date)}>
          <i aria-hidden="true" />
          <span>{TRANSPORTATION_STATUS_LABELS[stage.status]}</span>
        </li>;
      })}</ol>
      {current >= 0 && trip[stages[current].date] && <p className="tp-stage-date">Marked {TRANSPORTATION_STATUS_LABELS[trip.status].toLowerCase()} · {formatHotelDateTime(trip[stages[current].date])}</p>}
      {current < 0 && <p className="tp-stage-date">{TRANSPORTATION_STATUS_LABELS[trip.status]}{trip.cancelled_at ? ` · ${formatHotelDateTime(trip.cancelled_at)}` : ""}</p>}
    </section>
    <dl className="tp-dispatch">
      <div><dt>Driver</dt><dd>{trip.driver_name || "Unassigned"}</dd></div>
      <div><dt>Vehicle</dt><dd>{trip.transport_vehicle_types?.name || (trip.driver_name ? "Unavailable" : "Unassigned")}</dd></div>
      <div><dt>Folio fare</dt><dd>{trip.fare_amount == null ? (isTerminalStatus(trip.status) ? "No fare recorded" : "Pending assignment") : `${formatPeso(trip.fare_amount)} posted`}</dd></div>
    </dl>
    {trip.special_instructions && <div className="tp-note"><Info size={16} aria-hidden="true" /><div><strong>Guest instructions</strong><p>{trip.special_instructions}</p></div></div>}
    {trip.cancellation_reason && <div className="tp-note"><Info size={16} aria-hidden="true" /><div>
      <strong>{trip.status === "REJECTED" ? "Rejection reason" : "Cancellation reason"}</strong><p>{trip.cancellation_reason}</p>
      {trip.fare_amount != null && <p>Accounting handles corrections to posted fares.</p>}
    </div></div>}
    {trip.staff_notes && <details><summary>Internal note</summary><p>{trip.staff_notes}</p></details>}
    {trip.customer_visible_notes && <details><summary>Note for the guest</summary><p>{trip.customer_visible_notes}</p></details>}
  </>;
}

export default function TransportationPanel({ role }: { role: Role }) {
  const [trips, setTrips] = useState<StaffTrip[] | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState("today");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [requestedPage, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [today, setToday] = useState(() => dayKey.format(new Date()));
  const loadSequence = useRef({ currentRequest: 0 });
  const saving = useRef(false);
  const navigation = useRef(0);
  const workspace = useRef<HTMLDivElement>(null);
  const listScroll = useRef<HTMLDivElement>(null);
  const detailScroll = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const dialogs = useActionDialogs();
  const canOperate = canOperateTransportation(role);
  const canCancel = canCancelTransportation(role);
  const notify = (message: string, error = false) => setFeedback({ message, error });

  const load = useCallback(async (quiet = false) => {
    const sequence = loadSequence.current;
    const request = ++sequence.currentRequest;
    setToday(dayKey.format(new Date()));
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/transportation", { cache: "no-store" });
      const body = await response.json();
      if (request !== sequence.currentRequest) return null;
      if (!response.ok) throw new Error(body.error ?? "Unable to load transportation requests.");
      const records: StaffTrip[] = body.data ?? [];
      setTrips(records);
      setVehicleTypes(body.vehicleTypes ?? []);
      setError("");
      return records;
    } catch (cause) {
      if (request === sequence.currentRequest) setError(cause instanceof Error ? cause.message : "Unable to load transportation requests.");
      return null;
    } finally {
      if (request === sequence.currentRequest) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const sequence = loadSequence.current;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (!saving.current) void load(true); }, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); sequence.currentRequest++; };
  }, [load]);

  async function transition(trip: StaffTrip, action: TransportationAction, details: Record<string, unknown> = {}) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    const context = navigation.current;
    try {
      const response = await fetch(`/api/transportation/${trip.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion: trip.version, details }) });
      const body = await response.json();
      if (!response.ok) {
        notify(body.error ?? "Unable to update this transportation request.", true);
        if (response.status === 409) await load(true);
        return false;
      }
      const refreshed = await load(true);
      if (refreshed && navigation.current === context) {
        const day = dayKey.format(new Date());
        const scoped = searchTrips(refreshed, serviceFilter, search);
        const updated = scoped.find(record => record.id === trip.id);
        if (updated) {
          const nextQueue = dispatchLeg(updated, queue, day) ? queue : isTerminalStatus(updated.status) ? "history" : "all";
          const index = dispatchRows(scoped, nextQueue, day).findIndex(row => row.trip.id === trip.id);
          setQueue(nextQueue);
          setPage(Math.floor(index / pageSize) + 1);
          setSelectedId(trip.id);
        }
      }
      return true;
    } catch {
      notify("Unable to confirm the update. Review the latest trip status before trying again.", true);
      await load(true);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function act(trip: StaffTrip, action: TransportationAction) {
    if (action === "REVIEW") {
      const data = await dialogs.askForm({
        title: "Review transportation request", description: `${guestName(trip)} · ${serviceNames[trip.service_type]} · ${trip.pickup_location} → ${trip.dropoff_location}`,
        fields: [
          { key: "staffNotes", label: "Internal review notes (optional)", type: "textarea", rows: 2 },
          { key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 },
        ], submitText: "Mark reviewed",
      });
      if (!data) return;
      if (await transition(trip, "REVIEW", { staffNotes: String(data.staffNotes ?? "").trim() || undefined, customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined })) notify("Request reviewed.");
    }
    if (action === "SCHEDULE") {
      const data = await dialogs.askForm({
        title: "Schedule transportation", description: "Confirm the pickup date and time the guest will see.",
        fields: [
          { key: "pickupDate", label: "Pickup date", type: "date", required: true, defaultValue: trip.pickup_date, validation: (v: string | number | boolean) => (datePattern.test(String(v ?? "").trim()) ? null : "Enter a valid date.") },
          { key: "pickupTime", label: "Pickup time (PHT, 24-hour)", type: "text", required: true, defaultValue: trip.pickup_time, placeholder: "HH:MM", validation: (v: string | number | boolean) => (timePattern.test(String(v ?? "").trim()) ? null : "Enter the time as HH:MM.") },
          { key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 },
        ], submitText: "Schedule",
      });
      if (!data) return;
      if (await transition(trip, "SCHEDULE", { pickupDate: String(data.pickupDate).trim(), pickupTime: String(data.pickupTime).trim(), customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined })) notify("Transportation scheduled.");
    }
    if (action === "ASSIGN") {
      const legs = trip.service_type === "ROUND_TRIP" ? 2 : 1;
      const flatFare = (type: VehicleType) => (type.base_fare + type.booking_fee) * legs;
      const fields: FormField[] = [
        { key: "driverName", label: "Driver name", type: "text", required: true, validation: (v: string | number | boolean) => (String(v ?? "").trim().length >= 2 ? null : "Enter the driver's name.") },
        { key: "vehicleTypeId", label: "Vehicle type", type: "select", required: true, defaultValue: "", options: vehicleTypes.map((type) => ({ value: type.id, label: `${type.name} (${type.seats} seats) · ${formatPeso(flatFare(type))}` })), validation: (v: string | number | boolean) => (String(v ?? "").trim() ? null : "Choose a vehicle type — its fare is charged to the guest folio.") },
      ];
      const data = await dialogs.askForm({ title: "Assign driver & vehicle", description: `Assignment posts the selected fare${legs === 2 ? " for both legs" : ""} to the guest folio.`, fields, submitText: "Assign and post fare" });
      if (!data) return;
      if (await transition(trip, "ASSIGN", { driverName: String(data.driverName).trim(), vehicleTypeId: String(data.vehicleTypeId) })) notify("Driver assigned. Fare added to the guest folio.");
    }
    if (action === "START") {
      const ok = await dialogs.askConfirm({ title: "Start trip", message: `Mark the trip for ${guestName(trip)} as in progress?`, confirmText: "Start trip" });
      if (!ok) return;
      if (await transition(trip, "START")) notify("Trip in progress.");
    }
    if (action === "COMPLETE") {
      const data = await dialogs.askForm({
        title: "Complete trip", description: "Confirm the guest was transported.",
        fields: [{ key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 }], submitText: "Complete trip",
      });
      if (!data) return;
      if (await transition(trip, "COMPLETE", { customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined })) notify("Trip completed.");
    }
    if (action === "CANCEL" || action === "REJECT") {
      const reason = await dialogs.askPrompt({
        title: action === "CANCEL" ? "Cancel transportation request" : "Reject transportation request",
        message: action === "CANCEL" ? "The guest sees the cancellation reason. Accounting handles corrections to any posted fare." : "Record the reason the hotel cannot accept the request.",
        label: "Reason", multiline: true, rows: 3, required: true, submitText: action === "CANCEL" ? "Cancel trip" : "Reject request",
        validation: value => String(value).trim().length > 300 ? "Use 300 characters or fewer." : required("A reason is required.")(value),
      });
      if (!reason) return;
      if (await transition(trip, action, { reason: String(reason).trim() })) notify(action === "CANCEL" ? "Request cancelled." : "Request rejected.");
    }
  }

  const scoped = searchTrips(trips ?? [], serviceFilter, search);
  const visible = dispatchRows(scoped, queue, today);
  const page = paginateTableRows(visible, requestedPage, pageSize);
  const selected = page.rows.find(row => row.trip.id === selectedId)?.trip ?? page.rows[0]?.trip;
  const hasFilters = queue !== "today" || serviceFilter !== "all" || search.trim() !== "";
  const groups = new Map<string | null, typeof page.rows>();
  for (const row of page.rows) {
    const group = groups.get(row.leg.date);
    if (group) group.push(row);
    else groups.set(row.leg.date, [row]);
  }

  function resetQueuePosition() {
    navigation.current++;
    setFeedback(null);
    setPage(1);
    setSelectedId("");
    setDetailOpen(false);
    if (listScroll.current) listScroll.current.scrollTop = 0;
    if (detailScroll.current) detailScroll.current.scrollTop = 0;
  }

  function selectTrip(trip: StaffTrip) {
    navigation.current++;
    setFeedback(null);
    setSelectedId(trip.id);
    setDetailOpen(true);
    if (detailScroll.current) detailScroll.current.scrollTop = 0;
    window.requestAnimationFrame(() => {
      if (backButton.current && getComputedStyle(backButton.current).display !== "none") {
        detailHeading.current?.focus({ preventScroll: true });
        workspace.current?.scrollIntoView?.({ block: "start" });
      }
    });
  }

  function backToQueue() {
    navigation.current++;
    setDetailOpen(false);
    window.requestAnimationFrame(() => {
      const target = workspace.current?.querySelector<HTMLButtonElement>('.tp-row[aria-current="true"]')
        ?? workspace.current?.querySelector<HTMLInputElement>('input[type="search"]');
      target?.focus();
    });
  }

  const next = canOperate && operatingStages.find(stage => stage.status === selected?.status);
  const exceptions = selected && canCancel ? (["REJECT", "CANCEL"] as const).filter(action => canTransition(selected.status, action)) : [];

  return <div className="transportation-workspace" ref={workspace}>
    <header className="tp-page-heading">
      <h1>Transportation</h1>
      <p>See what leaves next and dispatch each guest transfer.</p>
    </header>
    {feedback && <div className="tp-feedback" role={feedback.error ? "alert" : "status"}>{feedback.message}</div>}
    <div className="tp-workspace" data-detail-open={detailOpen && selected?.id === selectedId}>
      <section className="tp-panel tp-queue" aria-labelledby="tp-queue-heading">
        <header className="tp-queue-head">
          <div><h2 id="tp-queue-heading">Dispatch queue</h2><p>Pickup and return times are shown in Manila time.</p></div>
          <CarTaxiFront size={20} aria-hidden="true" />
        </header>
        <div className="tp-filters">
          <HavenFilterBadges label="Dispatch filters" value={queue} allValue="" onChange={value => {
            if (queue !== value) { resetQueuePosition(); setQueue(value); }
          }} options={queues.map(option => ({
            ...option, count: trips ? scoped.filter(trip => dispatchLeg(trip, option.value, today)).length : undefined,
          }))} />
          <div className="tp-search">
            <HavenSearchInput value={search} onValueChange={value => { resetQueuePosition(); setSearch(value); }} label="Search transportation requests" placeholder="Guest, booking, route or driver" />
            <HavenSelect value={serviceFilter} onChange={value => { resetQueuePosition(); setServiceFilter(value); }} ariaLabel="Filter by service type"
              options={[{ value: "all", label: "All services" }, ...Object.entries(serviceNames).map(([value, label]) => ({ value, label }))]} />
          </div>
        </div>
        {error && <div className="tp-feedback" role="alert">
          <p>{error}{trips && " Showing the last loaded trips."}</p>
          <button type="button" className="btn btn-soft btn-sm" disabled={loading || busy} onClick={() => void load()}>Retry</button>
        </div>}
        <div className="tp-list" ref={listScroll} tabIndex={0} role="region" aria-label="Trip list">
          {loading && !trips ? <div className="tp-loading" role="status" aria-label="Loading transportation requests"><HavenSkeletonList /></div>
            : page.rows.length ? Array.from(groups, ([date, rows]) => <section className="tp-group" key={date ?? "unscheduled"}>
              <h3><span>{date === today ? "Today · " : ""}{formatDate(date, date !== today)}</span><span>{rows.length} {rows.length === 1 ? "trip" : "trips"}</span></h3>
              <ul>{rows.map(({ trip, leg }) => {
                const route = `${leg.from || "Pickup location unavailable"} → ${leg.to || "Destination unavailable"}`;
                const stage = canOperate && operatingStages.find(stage => stage.status === trip.status);
                return <li key={trip.id}><button type="button" className="tp-row" aria-current={selected?.id === trip.id} onClick={() => selectTrip(trip)}>
                  <span className="tp-row-time"><strong>{formatTime(leg.time)}</strong><small data-return={leg.kind === "Return"}>{leg.kind === "Return" && leg.date === today ? "Return today" : leg.kind}</small></span>
                  <span className="tp-row-name"><strong className="tp-row-guest">{guestName(trip)}</strong><small>{bookingRef(trip)} · {serviceNames[trip.service_type]}</small><small className="tp-row-route" title={route}>{route}</small></span>
                  <span className="tp-row-state"><TripStatus trip={trip} />{stage ? <small>{stage.label}</small> : trip.driver_name && <small>{trip.driver_name}</small>}</span>
                </button></li>;
              })}</ul>
            </section>) : trips && <HavenEmptyState icon={<CarTaxiFront size={22} aria-hidden="true" />}
              title={!trips.length ? "No transportation requests" : queue === "today" && !hasFilters ? "No trips due today" : "No trips match this view"}
              body={!trips.length ? "Guest transfer requests appear here when they are submitted." : "Try another dispatch filter or search."} />}
        </div>
        {trips && <footer className="tp-queue-footer">
          <TablePagination {...page} onPageChange={value => { resetQueuePosition(); setPage(value); }} noun="trips" allTotal={trips.length} />
          {hasFilters && <button type="button" className="btn btn-soft btn-sm" onClick={() => {
            resetQueuePosition(); setQueue("today"); setServiceFilter("all"); setSearch("");
            workspace.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}>Clear filters</button>}
        </footer>}
      </section>
      <aside className="tp-panel tp-detail" aria-label="Trip details">
        <button type="button" className="btn btn-soft btn-sm tp-back" onClick={backToQueue} ref={backButton}><ArrowLeft size={15} aria-hidden="true" /> Back to queue</button>
        {selected ? <>
          <header className="tp-detail-head">
            <div className="tp-reference"><span><FileText size={15} aria-hidden="true" /> Trip <span title={selected.id}>{selected.id.slice(0, 8)}</span></span><TripStatus trip={selected} /></div>
            <div className="tp-guest">
              <span className="tp-avatar" aria-hidden="true">{selected.reservations?.guest_name?.trim().split(/\s+/).slice(0, 2).map(name => name.charAt(0).toUpperCase()).join("") || "–"}</span>
              <div><h2 tabIndex={-1} ref={detailHeading}>{guestName(selected)}</h2><p>Booking {bookingRef(selected)} · {serviceNames[selected.service_type]}</p></div>
            </div>
            <p className="tp-meta">
              <span><Users size={14} aria-hidden="true" /> {selected.passenger_count} {selected.passenger_count === 1 ? "passenger" : "passengers"}</span>
              {selected.reservations && <span><CalendarDays size={14} aria-hidden="true" /> Stay {formatDate(selected.reservations.check_in)} – {formatDate(selected.reservations.check_out)}</span>}
            </p>
          </header>
          <div className="tp-detail-scroll" tabIndex={0} ref={detailScroll} role="region" aria-label="Trip itinerary and progress">
            <TripDetails key={selected.id} trip={selected} />
          </div>
          <footer className="tp-detail-footer" aria-busy={busy}>
            <p>{busy ? "Updating trip…" : next ? "Next step" : role === "owner" ? "Owner view · Read only" : isTerminalStatus(selected.status) ? "Trip history" : "Manager view"}</p>
            {(next || exceptions.length > 0) && <div className="tp-actions">
              {exceptions.map(action => <button key={action} type="button" className="btn btn-soft btn-sm tp-exception" disabled={busy} onClick={() => void act(selected, action)}>{action === "REJECT" ? "Reject request" : "Cancel trip"}</button>)}
              {next && <button type="button" className="btn btn-primary btn-sm" disabled={busy || next.action === "ASSIGN" && !vehicleTypes.length}
                title={next.action === "ASSIGN" && !vehicleTypes.length ? "No active vehicle types are available." : undefined}
                onClick={() => void act(selected, next.action)}>{next.label}</button>}
            </div>}
          </footer>
        </> : <div className="tp-detail-scroll"><HavenEmptyState icon={<FileText size={22} aria-hidden="true" />} title="No trip selected" body="Choose a trip to view its itinerary." /></div>}
      </aside>
    </div>
    {dialogs.view}
  </div>;
}
