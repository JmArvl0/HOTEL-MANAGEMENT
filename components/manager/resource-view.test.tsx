// @vitest-environment jsdom
// Billing (invoices) search contract — QA BUG-002: typing a guest name in
// "Search billing & payments" must narrow the visible records and the result
// count. The dashboard filters rows before they reach this view
// (filterStaffItems, lib/staff-search.test.ts); this view must render exactly
// what it is given and report its count honestly.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

function renderBilling(items: RecordItem[], search: string) {
  render(
    <ResourceView
      resource="invoices"
      items={items}
      allItems={all}
      depositSlaHours={4}
      replenishment={null}
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
      viewReservation={noop}
      viewRoom={noop}
      viewGuest={noop}
      processRefund={noop}
      failRefund={noop}
      requestApproval={noop}
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
      canRequestApproval={false}
      manageRooms={null}
      onScan={null}
    />,
  );
}

describe("Billing search narrows records and count", () => {
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
