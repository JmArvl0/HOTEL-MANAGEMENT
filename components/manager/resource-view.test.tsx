// @vitest-environment jsdom
// Billing (invoices) search contract — QA BUG-002: typing a guest name in
// "Search billing & payments" must narrow the visible records and the result
// count. The dashboard filters rows before they reach this view
// (filterStaffItems, lib/staff-search.test.ts); this view must render exactly
// what it is given and report its count honestly.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourceView } from "./manager-dashboard-client";
import { filterStaffItems } from "@/lib/staff-search";
import type { RecordItem } from "@/lib/types";

afterEach(cleanup);

const noop = () => {};
const no = () => false;

const invoice = (overrides: Record<string, unknown> = {}): RecordItem =>
  ({
    id: "inv-1",
    reservation_id: "RSV-1",
    guest_name: "Ava Santos",
    amount: 63800,
    paid: 0,
    balance: 63800,
    status: "unpaid",
    ...overrides,
  }) as RecordItem;

const all = [
  invoice(),
  invoice({ id: "inv-2", guest_name: "Sheniel Cruz" }),
  invoice({ id: "inv-3", guest_name: "Marco Reyes" }),
];

function renderBilling(items: RecordItem[], search: string, resource: "invoices" | "reservations" | "inventory" = "invoices", viewReservation = noop, requestApproval = noop, replenishment: Parameters<typeof ResourceView>[0]["replenishment"] = null) {
  render(
    <ResourceView
      resource={resource}
      items={items}
      allItems={all}
      depositSlaHours={4}
      replenishment={replenishment}
      createDraftPo={noop}
      submitPo={noop}
      receivePo={noop}
      cancelPo={noop}
      assets={null}
      registerAsset={noop}
      assetAction={noop}
      search={search}
      setSearch={noop}
      open={noop}
      advance={noop}
      checkIn={noop}
      verifyDeposit={noop}
      rejectDeposit={noop}
      viewReservation={viewReservation}
      viewRoom={noop}
      viewGuest={noop}
      processRefund={noop}
      failRefund={noop}
      requestApproval={requestApproval}
      escalateGuestRequest={noop}
      progressGuestRequest={noop}
      canProgressGuestRequest={no}
      coordinateHousekeeping={noop}
      coordinateMaintenance={noop}
      housekeepingAction={noop}
      maintenanceAction={noop}
      createReservation={noop}
      openWalkIn={noop}
      canMaintain={false}
      canAssignOthers={false}
      canHousekeep={false}
      canCheckIn={false}
      canVerify={false}
      canProcessRefund={false}
      canCreate={false}
      canAdvance={false}
      canCoordinate={false}
      canRequestApproval={resource === "reservations"}
      manageRooms={null}
      onScan={null}
    />,
  );
}

describe("Billing search narrows records and count", () => {
  const reservation = { id: "RSV-QA", guest_name: "QA guest", status: "cancelled", total: 10000, check_in: "2026-11-13", check_out: "2026-11-15", payment_status: "partial_refund" } as RecordItem;
  it("does not invent settlement when a reservation row has no invoice balance", () => {
    renderBilling([reservation], "", "reservations");
    expect(screen.getByRole("columnheader", { name: "Booked total" })).toBeTruthy();
    expect(screen.getByText("Open folio for balance")).toBeTruthy();
    expect(screen.queryByText("Settled")).toBeNull();
  });
  it("keeps an exception button keypress from opening the reservation row too", () => {
    const view = vi.fn(), request = vi.fn();
    renderBilling([reservation], "", "reservations", view, request);
    const button = screen.getByRole("button", { name: "Exception" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(view).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("shows only matching invoices with an honest result count", () => {
    const matching = filterStaffItems(all, "Sheniel", "invoices");
    renderBilling(matching, "Sheniel");
    expect(screen.getByText("Sheniel Cruz")).toBeTruthy();
    expect(screen.queryByText("Ava Santos")).toBeNull();
    expect(screen.queryByText("Marco Reyes")).toBeNull();
  });

  it("carries the search text in the toolbar input", () => {
    renderBilling(all, "Sheniel");
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "Sheniel");
  });
});

describe("Purchase order history", () => {
  it("keeps received orders accessible when no item needs replenishment", () => {
    renderBilling([], "", "inventory", noop, noop, {
      suggestions: [], vendors: [],
      drafts: [{ id: "PO-QA-HISTORY", status: "received", total: 200, items: [{ itemId: "ITM-QA", name: "QA Shampoo", quantity: 20, unit: "bottles" }] } as unknown as RecordItem],
    });
    expect(screen.getByRole("region", { name: "Purchase orders" }).textContent).toContain("Received — immutable");
    expect(screen.queryByRole("heading", { name: /Replenishment suggestions/ })).toBeNull();
  });
});
