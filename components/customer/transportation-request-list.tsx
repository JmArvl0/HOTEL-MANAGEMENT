"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CarTaxiFront, Hotel, MapPin, Users, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { formatPeso } from "@/lib/format";
import { isAssignmentVisible, isCustomerCancellable, isTerminalStatus, SERVICE_TYPE_LABELS, TRANSPORTATION_STATUS_LABELS, type CustomerTransportationRequest, type TransportationStatus } from "@/lib/transportation-display";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const formatTime = (value: string) => new Date(`2000-01-01T${value}:00`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

// Journey steps shown on the stepper — terminal states render a notice instead.
const STEPS: { key: TransportationStatus; label: string }[] = [
  { key: "REQUESTED", label: "Requested" },
  { key: "REVIEWED", label: "Reviewed" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In progress" },
];
const TERMINAL_COPY: Record<string, string> = {
  COMPLETED: "This trip is completed.",
  CANCELLED: "This request was cancelled.",
  REJECTED: "The hotel could not accommodate this request.",
};

type FilterKey = "all" | "active" | "completed" | "closed";
const ACTIVE_STATUSES = ["REQUESTED", "REVIEWED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"];

function RouteLeg({ from, to, fromHotel, caption }: { from: string; to: string; fromHotel: boolean; caption?: string }) {
  return (
    <div className="ctr-route">
      {fromHotel ? <Hotel size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
      <div className="ctr-route-stops">
        <b>{from}</b>
        <i aria-hidden="true" />
        <b>{to}</b>
        {caption && <small>{caption}</small>}
      </div>
      {fromHotel ? <MapPin size={14} aria-hidden="true" /> : <Hotel size={14} aria-hidden="true" />}
    </div>
  );
}

export function TransportationRequestList({ requests }: { requests: CustomerTransportationRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirming, setConfirming] = useState<CustomerTransportationRequest | null>(null);

  const counts = {
    all: requests.length,
    active: requests.filter((request) => ACTIVE_STATUSES.includes(request.status)).length,
    completed: requests.filter((request) => request.status === "COMPLETED").length,
    closed: requests.filter((request) => request.status === "CANCELLED" || request.status === "REJECTED").length,
  };
  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "closed", label: "Cancelled & rejected" },
  ];
  const visible = requests.filter((request) =>
    filter === "all" ? true
      : filter === "active" ? ACTIVE_STATUSES.includes(request.status)
        : filter === "completed" ? request.status === "COMPLETED"
          : request.status === "CANCELLED" || request.status === "REJECTED");

  async function cancel(request: CustomerTransportationRequest) {
    setBusy(request.id); setError("");
    const response = await fetch(`/api/account/transportation/${request.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version }) });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) { setError(body.error ?? "Unable to cancel this request."); return; }
    setConfirming(null);
    router.refresh();
  }

  if (!requests.length) return <div className="customer-empty ctr-empty"><CarTaxiFront aria-hidden="true" /><h2>No rides scheduled yet</h2><p>Your pickup, drop-off, and driver updates will appear here after you submit a request.</p></div>;

  return (
    <div className="customer-request-list-wrap ctr-list">
      <div className="ctr-filters" role="group" aria-label="Filter transportation requests">
        {chips.map((chip) => (
          <button key={chip.key} type="button" className={filter === chip.key ? "active" : ""} onClick={() => setFilter(chip.key)}>
            {chip.label}<b>{counts[chip.key]}</b>
          </button>
        ))}
      </div>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <div className="customer-request-list ctr-cards">
        {visible.map((request) => {
          const terminal = isTerminalStatus(request.status);
          const currentStep = STEPS.findIndex((step) => step.key === request.status);
          return (
            <article key={request.id} className="ctr-card">
              <header className="ctr-card-header">
                <div>
                  <b>{SERVICE_TYPE_LABELS[request.service_type]}</b>
                  <small>Reservation {request.reservation?.confirmation_number ?? request.reservation_id}</small>
                </div>
                <div className="ctr-card-header-meta">
                  <span className={`customer-status ${request.status.toLowerCase()}`}>{TRANSPORTATION_STATUS_LABELS[request.status]}</span>
                  {isCustomerCancellable(request.status) && (
                    <button className="btn btn-soft" disabled={busy === request.id} onClick={() => setConfirming(request)}>
                      <X size={14} />{busy === request.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                </div>
              </header>

              {request.service_type === "DROPOFF"
                ? <RouteLeg from={request.pickup_location} to={request.dropoff_location} fromHotel />
                : request.service_type === "PICKUP"
                  ? <RouteLeg from={request.pickup_location} to={request.dropoff_location} fromHotel={false} />
                  : <>
                      <RouteLeg from={request.pickup_location} to={request.dropoff_location} fromHotel={false} caption="Arrival" />
                      {request.return_location && <RouteLeg from={request.dropoff_location} to={request.return_location} fromHotel caption={`Return · ${formatDate(request.return_date!)} ${formatTime(request.return_time!)}`} />}
                    </>}

              <p className="ctr-card-meta">
                <span>{formatDate(request.pickup_date)} · {formatTime(request.pickup_time)}</span>
                <span><Users size={12} aria-hidden="true" />{request.passenger_count} passenger{request.passenger_count !== 1 ? "s" : ""}</span>
                <time>{new Date(request.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time>
              </p>

              {isAssignmentVisible(request.status) && (request.driver_name || request.vehicle_type) && (
                <p className="ctr-assignment"><CarTaxiFront size={14} aria-hidden="true" />Your ride: {request.driver_name ?? "Driver pending"}{request.vehicle_type ? ` · ${request.vehicle_type}` : ""}</p>
              )}
              {request.fare_amount != null && <p className="ctr-note"><b>Vehicle fare</b>{formatPeso(request.fare_amount)} · added to your stay folio</p>}
              {request.customer_visible_notes && <p className="ctr-note"><b>Front Desk</b>{request.customer_visible_notes}</p>}
              {request.special_instructions && <p className="ctr-note"><b>Your notes</b>{request.special_instructions}</p>}

              {terminal
                ? <p className={`ctr-terminal-notice customer-status ${request.status.toLowerCase()}`}>{TERMINAL_COPY[request.status]}{request.cancellation_reason ? ` ${request.cancellation_reason}` : ""}</p>
                : <ol className="crd-stepper ctr-stepper" aria-label="Request progress">
                    {STEPS.map((step, index) => (
                      <li key={step.key} data-state={index < currentStep ? "past" : index === currentStep ? "current" : "future"} aria-current={index === currentStep ? "step" : undefined}>
                        <i aria-hidden="true" />
                        <span>{step.label}</span>
                        {index < STEPS.length - 1 && <em aria-hidden="true" />}
                      </li>
                    ))}
                  </ol>}
            </article>
          );
        })}
        {!visible.length && (
          <div className="crd-activity-empty ctr-filter-empty"><CarTaxiFront /><p>No requests in this view.</p></div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => { if (confirming) cancel(confirming); }}
        title="Cancel Transportation Request"
        message="Cancel this transportation request? The Front Desk will stop arranging it. You can submit a new request any time."
        confirmText="Yes, cancel"
        cancelText="Keep request"
        variant="danger"
        loading={busy === confirming?.id}
      />
    </div>
  );
}
