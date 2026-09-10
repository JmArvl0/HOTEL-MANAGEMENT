"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CarFront, CarTaxiFront, CheckCircle2, ClipboardCheck, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { FormField } from "@/components/ui/FormDialog";
import { canCancelTransportation, canOperateTransportation } from "@/lib/permissions";
import { formatPeso } from "@/lib/format";
import { SERVICE_TYPE_LABELS, TRANSPORTATION_STATUS_LABELS, isTerminalStatus, type TransportationAction, type TransportationStatus } from "@/lib/transportation-display";
import type { Role } from "@/lib/types";

// Staff Transportation workspace. Front Desk executes the whole operational path;
// Manager supervises (view + cancel/reject with reason); Owner is read-only.
// Every button here is re-checked server-side by the route guard and the RPC role gate.
type StaffTrip = {
  id: string; reservation_id: string; service_type: "PICKUP" | "DROPOFF" | "ROUND_TRIP";
  pickup_location: string; dropoff_location: string; pickup_date: string; pickup_time: string;
  return_location: string | null; return_date: string | null; return_time: string | null;
  passenger_count: number; special_instructions: string | null; status: TransportationStatus;
  driver_name: string | null; fare_amount: number | null; staff_notes: string | null; customer_visible_notes: string | null;
  cancellation_reason: string | null; completed_at: string | null; version: number; created_at: string;
  transport_vehicle_types?: { name: string } | null;
  reservations?: { confirmation_number: string | null; guest_name: string | null; guest_email: string | null; check_in: string; check_out: string } | null;
};
type VehicleType = { id: string; name: string; seats: number; description: string | null; base_fare: number; booking_fee: number };

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const formatTime = (value: string) => new Date(`2000-01-01T${value}:00`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const required = (message: string) => (v: string | number | boolean) => (String(v ?? "").trim() ? null : message);

const QUEUES: [string, string][] = [["all", "All"], ["pending", "Needs review"], ["today", "Today"], ["active", "Scheduled / assigned"], ["completed", "Completed"], ["closed", "Cancelled / rejected"]];

// Queue predicate shared by the filter chips (counts) and the visible rows,
// so the two can never drift (same pattern as the reservations panel).
function queueMatch(trip: StaffTrip, queue: string, today: string) {
  if (queue === "pending") return ["REQUESTED", "REVIEWED"].includes(trip.status);
  if (queue === "today") return trip.pickup_date === today && !isTerminalStatus(trip.status);
  if (queue === "active") return ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(trip.status);
  if (queue === "completed") return trip.status === "COMPLETED";
  if (queue === "closed") return ["CANCELLED", "REJECTED"].includes(trip.status);
  return true;
}

export default function TransportationPanel({ role }: { role: Role }) {
  const [trips, setTrips] = useState<StaffTrip[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [queue, setQueue] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [weekAgo, setWeekAgo] = useState(0);
  const dialogs = useActionDialogs();
  const canOperate = canOperateTransportation(role);
  const canCancel = canCancelTransportation(role);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/transportation", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load transportation requests.");
      setTrips(body.data ?? []);
      setVehicleTypes(body.vehicleTypes ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load transportation requests.");
    }
    if (!quiet) setLoading(false);
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => load(), 0); const timer = window.setInterval(() => load(true), 30000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const set = () => setWeekAgo(Date.now() - 7 * 86400000); set(); const timer = window.setInterval(set, 30000); return () => window.clearInterval(timer); }, []);

  async function transition(trip: StaffTrip, action: TransportationAction, details: Record<string, unknown> = {}) {
    const response = await fetch(`/api/transportation/${trip.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion: trip.version, details }) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? `Unable to ${action.toLowerCase()} this request.`); return false; }
    await load(true);
    return true;
  }

  async function act(trip: StaffTrip, action: TransportationAction) {
    if (action === "REVIEW") {
      const data = await dialogs.askForm({
        title: "Review transportation request", description: `${label(trip.reservations?.guest_name)} · ${SERVICE_TYPE_LABELS[trip.service_type]} · ${trip.pickup_location} → ${trip.dropoff_location}`,
        fields: [
          { key: "staffNotes", label: "Internal review notes (optional)", type: "textarea", rows: 2 },
          { key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 },
        ], submitText: "Mark reviewed",
      });
      if (!data) return;
      await transition(trip, "REVIEW", { staffNotes: String(data.staffNotes ?? "").trim() || undefined, customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined }) && notify("Request reviewed.");
    }
    if (action === "SCHEDULE") {
      const data = await dialogs.askForm({
        title: "Schedule transportation", description: "Confirm the pickup date and time the guest will see.",
        fields: [
          { key: "pickupDate", label: "Pickup date", type: "date", required: true, defaultValue: trip.pickup_date, validation: (v: string | number | boolean) => (datePattern.test(String(v ?? "").trim()) ? null : "Enter a valid date.") },
          { key: "pickupTime", label: "Pickup time (HH:MM, 24-hour)", type: "text", required: true, defaultValue: trip.pickup_time, validation: (v: string | number | boolean) => (timePattern.test(String(v ?? "").trim()) ? null : "Enter the time as HH:MM.") },
          { key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 },
        ], submitText: "Schedule",
      });
      if (!data) return;
      await transition(trip, "SCHEDULE", { pickupDate: String(data.pickupDate), pickupTime: String(data.pickupTime), customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined }) && notify("Transportation scheduled.");
    }
    if (action === "ASSIGN") {
      const legs = trip.service_type === "ROUND_TRIP" ? 2 : 1;
      const flatFare = (type: VehicleType) => (type.base_fare + type.booking_fee) * legs;
      const fields: FormField[] = [
        { key: "driverName", label: "Driver name", type: "text", required: true, validation: (v: string | number | boolean) => (String(v ?? "").trim().length >= 2 ? null : "Enter the driver's name.") },
        { key: "vehicleTypeId", label: "Vehicle type", type: "select", required: true, defaultValue: "", options: vehicleTypes.map((type) => ({ value: type.id, label: `${type.name} (${type.seats} seats) · ${formatPeso(flatFare(type))}` })), validation: (v: string | number | boolean) => (String(v ?? "").trim() ? null : "Choose a vehicle type — its fare is charged to the guest folio.") },
      ];
      const data = await dialogs.askForm({ title: "Assign driver & vehicle", description: `The guest sees the assignment once saved. The vehicle's flat fare${legs === 2 ? " (×2 legs)" : ""} is added to the guest's folio on assignment.`, fields, submitText: "Assign" });
      if (!data) return;
      await transition(trip, "ASSIGN", { driverName: String(data.driverName).trim(), vehicleTypeId: String(data.vehicleTypeId) }) && notify("Driver assigned. Fare added to the guest folio.");
    }
    if (action === "START") {
      const ok = await dialogs.askConfirm({ title: "Start trip", message: `Mark the ${label(trip.reservations?.guest_name)} trip as in progress?`, confirmText: "Start trip" });
      if (!ok) return;
      await transition(trip, "START") && notify("Trip in progress.");
    }
    if (action === "COMPLETE") {
      const data = await dialogs.askForm({
        title: "Complete trip", description: "Confirm the guest was transported.",
        fields: [{ key: "customerVisibleNotes", label: "Note for the guest (optional)", type: "textarea", rows: 2 }], submitText: "Complete trip",
      });
      if (!data) return;
      await transition(trip, "COMPLETE", { customerVisibleNotes: String(data.customerVisibleNotes ?? "").trim() || undefined }) && notify("Trip completed.");
    }
    if (action === "CANCEL" || action === "REJECT") {
      const reason = await dialogs.askPrompt({
        title: action === "CANCEL" ? "Cancel transportation request" : "Reject transportation request",
        message: action === "CANCEL" ? "The request history is kept; the guest sees the cancellation and reason. Any fare already posted is reversed by Accounting." : "Rejection records why the hotel cannot take this request.",
        label: "Reason", multiline: true, rows: 3, required: true, validation: required("A reason is required."),
      });
      if (!reason) return;
      await transition(trip, action, { reason: String(reason).trim() }) && notify(action === "CANCEL" ? "Request cancelled." : "Request rejected.");
    }
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const visible = trips.filter((trip) => {
    if (serviceFilter !== "all" && trip.service_type !== serviceFilter) return false;
    if (!queueMatch(trip, queue, today)) return false;
    return JSON.stringify(trip).toLowerCase().includes(search.toLowerCase());
  });
  const counts = Object.fromEntries(QUEUES.map(([value]) => [value, trips.filter((trip) => queueMatch(trip, value, today)).length])) as Record<string, number>;
  const hasActiveFilters = queue !== "all" || serviceFilter !== "all" || search.trim() !== "";
  const clearFilters = () => { setQueue("all"); setServiceFilter("all"); setSearch(""); };
  const cards: { name: string; value: number; hint: string; queue: string; icon: LucideIcon; tone: string }[] = [
    { name: "Needs review", value: trips.filter((trip) => ["REQUESTED", "REVIEWED"].includes(trip.status)).length, hint: "Requested or reviewed", queue: "pending", icon: ClipboardCheck, tone: "attention" },
    { name: "Trips today", value: trips.filter((trip) => trip.pickup_date === today && !isTerminalStatus(trip.status)).length, hint: "Scheduled for today", queue: "today", icon: CalendarDays, tone: "today" },
    { name: "Assigned / in progress", value: trips.filter((trip) => ["ASSIGNED", "IN_PROGRESS"].includes(trip.status)).length, hint: "Driver on the trip", queue: "active", icon: CarFront, tone: "active" },
    { name: "Completed this week", value: trips.filter((trip) => trip.status === "COMPLETED" && trip.completed_at && new Date(trip.completed_at).getTime() >= weekAgo).length, hint: "Last 7 days", queue: "completed", icon: CheckCircle2, tone: "done" },
  ];

  const actions = (trip: StaffTrip) => {
    const buttons: [string, () => void][] = [];
    if (canOperate) {
      if (trip.status === "REQUESTED") buttons.push(["Review", () => act(trip, "REVIEW")]);
      if (trip.status === "REVIEWED") buttons.push(["Schedule", () => act(trip, "SCHEDULE")]);
      if (trip.status === "SCHEDULED") buttons.push(["Assign", () => act(trip, "ASSIGN")]);
      if (trip.status === "ASSIGNED") buttons.push(["Start", () => act(trip, "START")]);
      if (trip.status === "IN_PROGRESS") buttons.push(["Complete", () => act(trip, "COMPLETE")]);
    }
    if (canCancel && !isTerminalStatus(trip.status)) buttons.push(["Cancel", () => act(trip, "CANCEL")]);
    if (canCancel && ["REQUESTED", "REVIEWED"].includes(trip.status)) buttons.push(["Reject", () => act(trip, "REJECT")]);
    if (!buttons.length) return <small className="tp-view-only">{trip.cancellation_reason ? label(trip.cancellation_reason) : "View only"}</small>;
    return <div className="reservation-actions">{buttons.map(([text, onClick], index) => <button className={`table-action${index === 0 && canOperate ? " view-action" : ""}`} key={text} onClick={onClick}>{text}</button>)}</div>;
  };

  const when = (trip: StaffTrip) => <div className={`tp-when${trip.pickup_date === today ? " today" : ""}`}><b>{formatDate(trip.pickup_date)} · {formatTime(trip.pickup_time)}</b>{trip.service_type === "ROUND_TRIP" && trip.return_date && <small>Return {formatDate(trip.return_date)} · {formatTime(trip.return_time!)}</small>}</div>;

  return <>
    <div className="page-title module-title"><div><p className="eyebrow">Hotel operations</p><h1>Transportation</h1><p>Review, schedule, assign and complete guest pickup, drop-off and round-trip trips.</p></div></div>
    {error && <div className="tp-empty"><span className="tp-empty-icon"><CarTaxiFront size={22}/></span><h3>Transportation unavailable</h3><p>{error}</p></div>}
    {!error && (<>
    <div className="tp-kpis">{cards.map(({ name, value, hint, queue: target, icon: Icon, tone }) => <button className={`tp-kpi${queue === target ? " active" : ""} ${tone}`} key={name} aria-pressed={queue === target} onClick={() => setQueue(target)}><span>{name}</span><b>{value}</b><small>{hint}</small><i aria-hidden="true"><Icon size={16}/></i></button>)}</div>
    <div className="tp-toolbar reservation-filters"><div className="tp-queues">{QUEUES.map(([value, text]) => <button key={value} className={queue === value ? "active" : ""} aria-pressed={queue === value} onClick={() => setQueue(value)}>{text}<i className="chip-count">{counts[value]}</i></button>)}</div><label>Service<select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="all">All services</option><option value="PICKUP">Airport Pickup</option><option value="DROPOFF">Hotel Drop-off</option><option value="ROUND_TRIP">Round Trip</option></select></label></div>
    <div className="tp-search-row table-tools"><label><Search size={17}/><input type="search" aria-label="Search transportation requests" placeholder="Search guest, reservation, route, location…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>{hasActiveFilters && <button className="tp-clear" onClick={clearFilters}><X size={13}/>Clear filters</button>}</div>
    <p className="tp-note">Locations are recorded as text — coordinate trips by phone; there is no external mapping or fleet service.</p>
    <div className="data-panel">
      {loading ? <div className="tp-skeleton" role="status" aria-label="Loading transportation requests"><i/><i/><i/><i/></div>
      : visible.length === 0 ? <div className="tp-empty"><span className="tp-empty-icon"><CarTaxiFront size={22}/></span><h3>No transportation requests</h3><p>{trips.length === 0 ? "Guest transfer requests appear here as soon as they are submitted at booking or from the guest account." : "No requests match the current filters or search."}</p>{trips.length > 0 && hasActiveFilters && <button className="tp-clear" onClick={clearFilters}><X size={13}/>Clear filters</button>}</div>
      : <>
      <div className="table-scroll tp-table-wrap"><table className="tp-table" aria-label="Transportation requests"><thead><tr><th>Guest / reservation</th><th>Service</th><th>Route</th><th>When</th><th>Passengers</th><th>Status</th><th>Driver / vehicle</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((trip) => <tr key={trip.id}>
          <td><div className="cell-stack"><b>{label(trip.reservations?.guest_name)}</b><small>{label(trip.reservations?.confirmation_number ?? trip.reservation_id)}</small></div></td>
          <td>{SERVICE_TYPE_LABELS[trip.service_type]}</td>
          <td><div className="cell-stack tp-route"><b>{trip.pickup_location} → {trip.dropoff_location}</b>{trip.service_type === "ROUND_TRIP" && trip.return_location && <small>Return: {trip.dropoff_location} → {trip.return_location}</small>}</div></td>
          <td>{when(trip)}</td>
          <td><div className="cell-stack"><b>{trip.passenger_count}</b><small>{trip.passenger_count === 1 ? "passenger" : "passengers"}</small></div></td>
          <td><div className="cell-stack"><span className={`badge ${trip.status.toLowerCase()}`}>{TRANSPORTATION_STATUS_LABELS[trip.status]}</span>{trip.special_instructions && <small title="Special instructions">{label(trip.special_instructions)}</small>}</div></td>
          <td>{trip.driver_name ? <div className="cell-stack"><b>{label(trip.driver_name)}</b><small>{label(trip.transport_vehicle_types?.name)}</small>{trip.fare_amount != null && <small>{formatPeso(trip.fare_amount)} on folio</small>}</div> : <span className="tp-unassigned">Not assigned</span>}</td>
          <td className="tp-actions">{actions(trip)}</td>
        </tr>)}</tbody></table></div>
      <div className="tp-cards">{visible.map((trip) => <article className="tp-card" key={trip.id}>
        <header><b>{SERVICE_TYPE_LABELS[trip.service_type]}</b><span className={`badge ${trip.status.toLowerCase()}`}>{TRANSPORTATION_STATUS_LABELS[trip.status]}</span></header>
        <div className="tp-card-guest"><strong>{label(trip.reservations?.guest_name)}</strong><small>{label(trip.reservations?.confirmation_number ?? trip.reservation_id)}</small></div>
        <p className="tp-card-route">{trip.pickup_location}<i aria-hidden="true">→</i>{trip.dropoff_location}</p>
        <div className="tp-card-meta"><span>{formatDate(trip.pickup_date)} · {formatTime(trip.pickup_time)}</span><span>{trip.passenger_count} {trip.passenger_count === 1 ? "passenger" : "passengers"}</span></div>
        {trip.service_type === "ROUND_TRIP" && trip.return_date && <p className="tp-card-return">Return {formatDate(trip.return_date)} · {formatTime(trip.return_time!)}{trip.return_location ? ` · ${trip.return_location}` : ""}</p>}
        {trip.driver_name ? <p className="tp-card-driver">Driver: {label(trip.driver_name)} · {label(trip.transport_vehicle_types?.name)}{trip.fare_amount != null ? ` · ${formatPeso(trip.fare_amount)} on folio` : ""}</p> : <p className="tp-card-driver tp-unassigned">Driver not assigned yet</p>}
        {trip.special_instructions && <p className="tp-card-note">Note: {label(trip.special_instructions)}</p>}
        <div className="tp-card-actions">{actions(trip)}</div>
      </article>)}</div>
      </>}
      <div className="table-footer">Showing {visible.length} request{visible.length !== 1 ? "s" : ""}<span>Every transition is server-validated, versioned and audited.</span></div>
    </div></>)}
    {toast && <div className="toast"><ClipboardCheck size={18}/>{toast}</div>}
    {dialogs.view}
  </>;
}
