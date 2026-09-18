// @vitest-environment jsdom
// Before-You-Pay panel renders deposit, refund, and remaining-balance terms
// from the hold's frozen policy snapshots — never hardcoded policy text.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DEPOSIT_POLICY } from "@/lib/booking";
import { DEFAULT_OPERATIONAL_POLICY } from "@/lib/hotel-policy";
import { DepositPolicyPanel } from "./deposit-policy-panel";

afterEach(() => cleanup());

const base = {
  depositPolicy: DEFAULT_DEPOSIT_POLICY,
  cancelPolicy: DEFAULT_OPERATIONAL_POLICY,
  depositRequired: 1740,
  remainingBalance: 4060,
  checkIn: "2026-10-20",
};

describe("DepositPolicyPanel", () => {
  it("renders deposit percentage and amount from the authoritative snapshot", () => {
    render(<DepositPolicyPanel {...base} />);
    expect(screen.getByText(/30% of stay total/)).toBeTruthy();
    expect(screen.getByText("₱1,740")).toBeTruthy();
  });

  it("renders a fixed-amount deposit policy without inventing a percentage", () => {
    render(
      <DepositPolicyPanel
        {...base}
        depositPolicy={{ ...DEFAULT_DEPOSIT_POLICY, calculationType: "fixed", fixedAmount: 2000 }}
        depositRequired={2000}
      />,
    );
    expect(screen.getByText(/of stay total/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/30%/);
  });

  it("explains manual verification without promising confirmation on upload", () => {
    render(<DepositPolicyPanel {...base} />);
    expect(screen.getByText(/not confirmed yet/)).toBeTruthy();
    expect(screen.getByText(/does not mark the deposit as paid/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/booking is confirmed after you send/i);
  });

  it("distinguishes submitted, awaiting verification, paid, and confirmed states", () => {
    const { container } = render(<DepositPolicyPanel {...base} />);
    const ladder = container.querySelector(".byp-status-ladder")?.textContent ?? "";
    for (const state of ["Submitted", "Awaiting verification", "Verified / Paid", "Reservation confirmed"]) {
      expect(ladder).toMatch(state);
    }
  });

  it("renders refund tiers from the snapshot, not hardcoded values", () => {
    render(
      <DepositPolicyPanel
        {...base}
        cancelPolicy={{
          ...DEFAULT_OPERATIONAL_POLICY,
          cancellationFullRefundDays: 21,
          cancellationPartialRefundDays: 10,
          cancellationPartialRefundBasisPoints: 2500,
        }}
      />,
    );
    expect(screen.getByText("21 days or more before check-in")).toBeTruthy();
    expect(screen.getByText("10–20 days before check-in")).toBeTruthy();
    expect(screen.getByText("25% of eligible deposit refundable")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/14 days or more/);
  });

  it("prefers the booking-time snapshot over later policy changes", () => {
    // A hold created under a wider window keeps its terms even though the
    // current default is narrower — the panel only sees the snapshot prop.
    render(
      <DepositPolicyPanel
        {...base}
        cancelPolicy={{ ...DEFAULT_OPERATIONAL_POLICY, cancellationFullRefundDays: 30 }}
      />,
    );
    expect(screen.getByText("30 days or more before check-in")).toBeTruthy();
  });

  it("marks late cancellation and no-show non-refundable with the snapshot cutoff", () => {
    render(<DepositPolicyPanel {...base} />);
    expect(screen.getByText("Less than 7 days before check-in")).toBeTruthy();
    expect(screen.getByText(/No-show \(after .* local on check-in day\)/)).toBeTruthy();
    expect(screen.getAllByText("Non-refundable").length).toBe(2);
  });

  it("renders the remaining balance and the configured settlement wording", () => {
    render(<DepositPolicyPanel {...base} />);
    expect(screen.getByText("₱4,060")).toBeTruthy();
    expect(screen.getByText(/at hotel \/ check-in according to hotel policy/i)).toBeTruthy();
    expect(screen.getByText(/cleared before check-in/)).toBeTruthy();
  });

  it("keeps refund restrictions as text, not color alone", () => {
    const { container } = render(<DepositPolicyPanel {...base} />);
    const restricted = container.querySelectorAll(".byp-restricted");
    expect(restricted.length).toBe(2);
    for (const row of restricted) expect(row.textContent).toMatch(/Non-refundable/);
  });
});
