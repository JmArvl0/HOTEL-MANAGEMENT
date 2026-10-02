import { describe, expect, it } from "vitest";
import { filterStaffItems } from "./staff-search";
import type { RecordItem } from "@/lib/types";

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

describe("filterStaffItems", () => {
  it("returns every row when the query is blank", () => {
    const items = [invoice(), invoice({ id: "inv-2" })];
    expect(filterStaffItems(items, "  ", "invoices")).toBe(items);
  });

  it("filters Billing invoices by guest name and narrows the count", () => {
    // Regression (QA BUG-002): typing "Sheniel" must leave only matching
    // billing records — the visible rows and their count derive from this.
    const items = [invoice(), invoice({ id: "inv-2", guest_name: "Sheniel Cruz" }), invoice({ id: "inv-3", guest_name: "Marco Reyes" })];
    const matching = filterStaffItems(items, "Sheniel", "invoices");
    expect(matching.map((item) => item.id)).toEqual(["inv-2"]);
  });

  it("matches deposit verification rows by guest, reservation, or reference", () => {
    const rows = [
      { id: "p1", reservation: { guest_name: "Ava Santos", confirmation_number: "HVN-1" }, reservation_id: "RSV-1", reference: "REF-1" },
      { id: "p2", reservation: { guest_name: "Sheniel Cruz", confirmation_number: "HVN-2" }, reservation_id: "RSV-2", reference: "REF-2" },
    ] as unknown as RecordItem[];
    expect(filterStaffItems(rows, "sheniel", "payments").map((item) => item.id)).toEqual(["p2"]);
    expect(filterStaffItems(rows, "hvn-1", "payments").map((item) => item.id)).toEqual(["p1"]);
  });
});
