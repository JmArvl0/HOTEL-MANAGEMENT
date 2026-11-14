// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ResourceView } from "./manager-dashboard-client";
import type { RecordItem } from "@/lib/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: false })));

const payment = {
  id: "payment-1",
  reservation_id: "reservation-1",
  purpose: "reservation_deposit",
  method: "manual_gcash",
  reference: "GC-12345",
  amount: 6480,
  status: "pending_verification",
  submitted_at: "2026-11-14T00:12:00Z",
  proof_original_name: "receipt.png",
  reservation: {
    guest_name: "Maya Santos",
    confirmation_number: "RSV-HVN-2408",
    room_type: "Deluxe King",
    check_in: "2026-11-21",
    check_out: "2026-11-24",
    deposit_required: 6480,
  },
} as unknown as RecordItem;

function props(canVerify: boolean) {
  return {
    resource: "payments",
    items: [payment],
    allItems: [payment],
    depositSlaHours: 4,
    search: "",
    setSearch: vi.fn(),
    canVerify,
    verifyDeposit: vi.fn(),
    rejectDeposit: vi.fn().mockResolvedValue(true),
    confirmVerifyDeposit: vi.fn().mockResolvedValue(true),
  } as unknown as ComponentProps<typeof ResourceView>;
}

describe("live deposit verification workspace", () => {
  it("shows the prototype's queue and inline review against live payment fields", () => {
    render(<ResourceView {...props(true)} />);
    expect(screen.getByRole("heading", { name: "Payment queue" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Payment review" })).toBeTruthy();
    expect(screen.getAllByText("Maya Santos").length).toBeGreaterThan(0);
    expect(screen.getByText("GC-12345")).toBeTruthy();
  });

  it("keeps Front Desk read-only and never requests a private proof", () => {
    const fetchProof = vi.fn();
    vi.stubGlobal("fetch", fetchProof);
    render(<ResourceView {...props(false)} />);
    expect(screen.getByText("Front Desk view · read-only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verify payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject payment" })).toBeNull();
    expect(fetchProof).not.toHaveBeenCalled();
  });

  it("requires a second confirmation before Accounting verifies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const actions = props(true);
    render(<ResourceView {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Verify payment" }));
    expect(actions.confirmVerifyDeposit).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Verify this payment?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify payment" }));
    await waitFor(() => expect(actions.confirmVerifyDeposit).toHaveBeenCalledWith(payment));
  });

  it("requires a useful rejection reason and passes it to the existing decision route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const actions = props(true);
    render(<ResourceView {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject payment" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject payment" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("at least 10 characters");
    expect(actions.rejectDeposit).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), { target: { value: "Reference does not match statement" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject payment" }));
    await waitFor(() => expect(actions.rejectDeposit).toHaveBeenCalledWith(payment, "Reference does not match statement"));
  });

  it("shows provider payments separately without offering manual verification", () => {
    vi.stubGlobal("fetch", vi.fn());
    const provider = { ...payment, id: "provider-1", method: "gateway_paymongo", reference: "PM-1" } as RecordItem;
    const actions = { ...props(true), items: [provider], allItems: [provider] };
    render(<ResourceView {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: /Provider 1/ }));
    expect(screen.getByText("Awaiting provider settlement")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verify payment" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reject payment" })).toBeTruthy();
  });

  it("shows overdue proofs as a visibility cue while keeping Accounting in control", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const overdue = { ...payment, submitted_at: "2026-01-01T00:00:00Z" } as RecordItem;
    const actions = { ...props(true), items: [overdue], allItems: [overdue] };
    render(<ResourceView {...actions} />);
    expect(screen.getAllByText("Past SLA").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Verify payment" })).toBeTruthy();
    expect(actions.confirmVerifyDeposit).not.toHaveBeenCalled();
  });
});
