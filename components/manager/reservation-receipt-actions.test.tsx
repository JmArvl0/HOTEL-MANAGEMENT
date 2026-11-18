// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReservationDetailModal } from "./manager-dashboard-client";

afterEach(() => cleanup());

it("opens an existing booking receipt without issuing it again", () => {
  const generateDocument = vi.fn();
  const openIssuedReceipt = vi.fn();
  const action = vi.fn();
  render(<ReservationDetailModal
    detail={{
      reservation: { id: "stay-1", status: "checked_out", confirmation_number: "HVN-TEST", room_type: "Deluxe", check_in: "2026-11-01", check_out: "2026-11-03", total: 1000 },
      guest: null, invoice: { id: "folio-1", balance: 0, amount: 1000, paid: 1000 },
      payments: [{ id: "pay-1", status: "paid", amount: 1000, purpose: "stay_payment", method: "cash" }],
      documents: [{ id: "doc-1", document_type: "receipt", document_number: "RCP-TEST", payment_id: "pay-1" }],
      charges: [], adjustments: [], refunds: [], refundAttempts: [], changeRequests: [], assignments: [], requests: [], room: null, maintenance: [],
    }}
    refresh={action} close={action} checkIn={action} closeReservation={action} collectPayment={action}
    postCharge={action} assignRoom={action} changeRoom={action} extendStay={action} updateGuest={action}
    routeRequest={action} checkOut={action} reverseCharge={action} recordAdjustment={action}
    generateDocument={generateDocument} openIssuedReceipt={openIssuedReceipt}
    canFinancial canManage={false} canSetDnd={false} canAdjust={false} canIssueDocument
  />);
  fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
  expect(openIssuedReceipt).toHaveBeenCalledWith("RCP-TEST");
  expect(generateDocument).not.toHaveBeenCalled();
});

it("does not show a fabricated folio balance for a retired booking without an invoice", () => {
  const action = vi.fn();
  render(<ReservationDetailModal
    detail={{
      reservation: { id: "RSV-1046", status: "cancelled", room_type: "Garden Twin", check_in: "2026-08-26", check_out: "2026-08-29", total: 17400, payment_status: "unpaid" },
      guest: null, invoice: null, payments: [], documents: [], charges: [], adjustments: [], refunds: [], refundAttempts: [],
      changeRequests: [], assignments: [], requests: [], room: null, maintenance: [],
    }}
    refresh={action} close={action} checkIn={action} closeReservation={action} collectPayment={action}
    postCharge={action} assignRoom={action} changeRoom={action} extendStay={action} updateGuest={action}
    routeRequest={action} checkOut={action} reverseCharge={action} recordAdjustment={action}
    generateDocument={action} openIssuedReceipt={action}
    canFinancial canManage={false} canSetDnd={false} canAdjust canIssueDocument
  />);
  expect(screen.getByText("Original stay total")).toBeTruthy();
  expect(screen.getByText("No folio recorded for this booking.")).toBeTruthy();
  expect(screen.queryByText("Current folio total")).toBeNull();
  expect(screen.queryByText("Balance")).toBeNull();
  expect(screen.queryByRole("button", { name: "Adjust folio" })).toBeNull();
});
