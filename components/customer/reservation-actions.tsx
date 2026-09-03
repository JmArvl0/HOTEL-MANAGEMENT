"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog, PromptDialog } from "@/components/ui/Modal";

export function ReservationActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Cancel dialogs
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Change dialogs
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeStep, setChangeStep] = useState<"dates" | "reason">("dates");
  const [changeData, setChangeData] = useState({
    checkIn: "",
    checkOut: "",
    roomType: "",
    reason: "",
  });

  if (!["pending", "confirmed"].includes(status)) return null;

  async function handleCancelSubmit(reason: string) {
    setBusy(true);
    const response = await fetch(`/api/account/reservations/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Unable to cancel.");
      return;
    }
    const refund = Number(body.data?.eligible_refund ?? 0);
    setMessage(
      refund > 0
        ? `Cancelled. PHP ${refund.toLocaleString("en-PH")} is awaiting Accounting refund processing.`
        : "Cancelled. The booking-time policy provides no deposit refund."
    );
    router.refresh();
  }

  async function handleChangeSubmit(data: typeof changeData) {
    setBusy(true);
    const response = await fetch(`/api/account/reservations/${id}/change-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn: data.checkIn || undefined,
        checkOut: data.checkOut || undefined,
        roomType: data.roomType || undefined,
        reason: data.reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    setBusy(false);
    setMessage(
      response.ok
        ? body.data?.status === "executed"
          ? `Reservation updated. New total: PHP ${Number(body.data.calculatedTotal).toLocaleString("en-PH")}.`
          : "Your request requires Manager approval. Front Desk will execute it after approval."
        : body.error ?? "Unable to request changes."
    );
    if (response.ok) router.refresh();
  }

  return (
    <div className="customer-reservation-actions">
      <button className="btn btn-soft" disabled={busy} onClick={() => setChangeOpen(true)}>
        Request a change
      </button>
      <button className="btn btn-soft danger-action" disabled={busy} onClick={() => setCancelReasonOpen(true)}>
        Cancel reservation
      </button>
      {message && <p role="status">{message}</p>}

      {/* Cancel Reason Prompt */}
      <PromptDialog
        isOpen={cancelReasonOpen}
        onClose={() => setCancelReasonOpen(false)}
        onSubmit={(reason) => {
          setCancelReason(reason);
          setCancelReasonOpen(false);
          setCancelConfirmOpen(true);
        }}
        title="Cancel Reservation"
        message="Please provide a reason for cancelling this reservation."
        label="Reason"
        placeholder="Why are you cancelling?"
        required
        submitText="Continue"
        cancelText="Back"
      />

      {/* Cancel Confirmation */}
      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => handleCancelSubmit(cancelReason)}
        title="Confirm Cancellation"
        message="Cancel this reservation? Refund eligibility will be calculated from the policy accepted when you booked."
        confirmText="Yes, cancel"
        cancelText="Keep reservation"
        variant="danger"
        loading={busy}
      />

      {/* Change Request - Step 1: Dates */}
      <Modal
        isOpen={changeOpen && changeStep === "dates"}
        onClose={() => {
          setChangeOpen(false);
          setChangeStep("dates");
          setChangeData({ checkIn: "", checkOut: "", roomType: "", reason: "" });
        }}
        title="Request a Change"
        description="Enter the new dates or room type you're requesting. Leave blank to keep current values."
        size="sm"
        footer={
          <div className="prompt-actions">
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setChangeOpen(false);
                setChangeStep("dates");
                setChangeData({ checkIn: "", checkOut: "", roomType: "", reason: "" });
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-accent" onClick={() => setChangeStep("reason")}>
              Continue
            </button>
          </div>
        }
      >
        <div className="change-form-fields" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="prompt-field">
            <label htmlFor="change-checkin" className="prompt-label">New Check-in (YYYY-MM-DD)</label>
            <input
              id="change-checkin"
              type="date"
              className="prompt-input"
              value={changeData.checkIn}
              onChange={(e) => setChangeData((d) => ({ ...d, checkIn: e.target.value }))}
              placeholder="Leave blank to keep current"
            />
          </div>
          <div className="prompt-field">
            <label htmlFor="change-checkout" className="prompt-label">New Check-out (YYYY-MM-DD)</label>
            <input
              id="change-checkout"
              type="date"
              className="prompt-input"
              value={changeData.checkOut}
              onChange={(e) => setChangeData((d) => ({ ...d, checkOut: e.target.value }))}
              placeholder="Leave blank to keep current"
            />
          </div>
          <div className="prompt-field">
            <label htmlFor="change-roomtype" className="prompt-label">Requested Room Type</label>
            <input
              id="change-roomtype"
              type="text"
              className="prompt-input"
              value={changeData.roomType}
              onChange={(e) => setChangeData((d) => ({ ...d, roomType: e.target.value }))}
              placeholder="Leave blank to keep current"
            />
          </div>
        </div>
      </Modal>

      {/* Change Request - Step 2: Reason */}
      <PromptDialog
        isOpen={changeOpen && changeStep === "reason"}
        onClose={() => {
          setChangeOpen(false);
          setChangeStep("dates");
          setChangeData({ checkIn: "", checkOut: "", roomType: "", reason: "" });
        }}
        onSubmit={(reason) => handleChangeSubmit({ ...changeData, reason })}
        title="Request a Change"
        message="Please provide a reason for the requested change."
        label="Reason"
        placeholder="Why are you requesting this change?"
        defaultValue={changeData.reason}
        required
        submitText="Submit Request"
        cancelText="Back"
        validation={(v) => (v.trim() ? null : "Reason is required")}
      />
    </div>
  );
}