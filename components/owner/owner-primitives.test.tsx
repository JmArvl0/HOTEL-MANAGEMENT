// @vitest-environment jsdom
// Owner command-center primitives: universal toolbar order (search ABOVE
// filters, DOM order included), policy formatting (days are never currency),
// and the shared empty/tabs/collapse contracts.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OwnerCollapse,
  OwnerEmpty,
  OwnerTabs,
  OwnerToolbar,
  formatOwnerDate,
  formatPolicyValue,
  summarizePolicyChanges,
  useOwnerSearch,
} from "./owner-primitives";
import { Search } from "lucide-react";

afterEach(() => cleanup());

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function ToolbarHarness() {
  const noop = () => {};
  return (
    <OwnerToolbar
      search=""
      setSearch={noop}
      searchLabel="Search accounts"
      searchPlaceholder="Search by name or email…"
      filters={[
        { label: "Role", value: "all", onChange: noop, options: [{ value: "all", label: "All roles" }] },
        { label: "Status", value: "active", onChange: noop, options: [{ value: "active", label: "Active" }] },
      ]}
      resultCount={3}
      resultNoun="accounts"
      onClear={noop}
    />
  );
}

describe("OwnerToolbar universal order", () => {
  it("renders search above the filter row in DOM order", () => {
    const { container } = render(<ToolbarHarness />);
    const search = screen.getByRole("searchbox", { name: "Search accounts" });
    const firstFilter = container.querySelector(".haven-toolbar-advanced")!;
    expect(search.compareDocumentPosition(firstFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the result count and Clear only while filters are active", () => {
    render(<ToolbarHarness />);
    expect(screen.getByText(/Showing 3 accounts/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clear filters/ })).toBeTruthy();
  });

  it("hides Clear when nothing is active", () => {
    const noop = () => {};
    render(
      <OwnerToolbar
        search=""
        setSearch={noop}
        searchLabel="Search accounts"
        searchPlaceholder="Search…"
        filters={[{ label: "Role", value: "all", onChange: noop, options: [{ value: "all", label: "All roles" }] }]}
        onClear={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /Clear filters/ })).toBeNull();
  });
});

describe("formatPolicyValue (presentation only, stored values untouched)", () => {
  it("never renders day counts as currency", () => {
    expect(formatPolicyValue("cancellation_full_refund_days", 14)).toBe("14 days");
    expect(formatPolicyValue("cancellation_partial_refund_days", 7)).toBe("7 days");
    expect(formatPolicyValue("minimum_booking_age", 1)).toBe("1 year");
  });

  it("renders hours, minutes, basis points, booleans, and times", () => {
    expect(formatPolicyValue("deposit_sla_hours", 4)).toBe("4 hours");
    expect(formatPolicyValue("housekeeping_turnover_overdue_minutes", 180)).toBe("180 min");
    expect(formatPolicyValue("vat_rate_bp", 1200)).toBe("12%");
    expect(formatPolicyValue("cancellation_partial_refund_basis_points", 3000)).toBe("30%");
    expect(formatPolicyValue("early_check_in_allowed", true)).toBe("Yes");
    expect(formatPolicyValue("check_in_time", "14:00:00")).toBe("14:00");
  });

  it("keeps money formatting for genuine financial keys", () => {
    expect(formatPolicyValue("outstandingBalance", 5800)).toBe("₱5,800");
  });
});

describe("formatOwnerDate", () => {
  it("renders a user-friendly hotel-time timestamp", () => {
    expect(formatOwnerDate("2026-09-18T06:00:00.000Z", "Asia/Manila")).toContain("2026");
  });

  it("falls back to the raw value when missing or invalid", () => {
    expect(formatOwnerDate(null)).toBe("—");
  });
});

describe("useOwnerSearch", () => {
  it("filters loaded rows by substring without refetching", () => {
    const rows = [
      { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
      { id: "2", name: "Grace Hopper", email: "grace@example.com" },
    ];
    function Harness({ query }: { query: string }) {
      const visible = useOwnerSearch(rows, query);
      return <ul>{visible.map((row) => <li key={row.id}>{row.name}</li>)}</ul>;
    }
    const { rerender } = render(<Harness query="" />);
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    rerender(<Harness query="grace" />);
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
  });
});

describe("OwnerEmpty / OwnerTabs / OwnerCollapse", () => {
  it("renders the shared empty state with an optional action", () => {
    const action = vi.fn();
    render(
      <OwnerEmpty
        icon={<Search size={22} />}
        title="No Owner-level exceptions"
        body="No Manager escalation currently requires Owner authorization."
        action={
          <button type="button" onClick={action}>
            Clear filters
          </button>
        }
      />,
    );
    expect(screen.getByText("No Owner-level exceptions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("switches tabs client-side with counts", () => {
    const onChange = vi.fn();
    render(
      <OwnerTabs
        tabs={[
          { key: "a", label: "Blocked rooms", count: 2 },
          { key: "b", label: "Critical maintenance", count: 0 },
        ]}
        active="a"
        onChange={onChange}
        label="Operational issue queues"
      />,
    );
    const active = screen.getByRole("tab", { selected: true });
    expect(active.textContent).toContain("Blocked rooms");
    fireEvent.click(screen.getByRole("tab", { name: /Critical maintenance/ }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("collapses attention groups with counts", () => {
    render(
      <OwnerCollapse title="Blocked rooms" count={3}>
        <p>detail</p>
      </OwnerCollapse>,
    );
    expect(screen.getByText("Blocked rooms")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
});

describe("owner redesign consolidation contracts", () => {
  const dashboard = read("components/owner/owner-dashboard-client.tsx");

  it("wires every redesigned module through the shared primitives", () => {
    for (const token of [
      "OwnerToolbar",
      "OwnerEmpty",
      "OwnerTabs",
      "OwnerCollapse",
      "useOwnerSearch",
      "AccessibleChart",
    ]) {
      expect(dashboard).toContain(token);
    }
  });

  it("keeps the pinned Owner layout classes and data flow", () => {
    for (const token of [
      "metric-grid owner-metric-grid",
      "dashboard-grid owner-insight-grid",
      "dashboard-grid owner-dual-grid",
      'className="owner-risk-stack"',
      "/api/owner/data?section=",
    ]) {
      expect(dashboard).toContain(token);
    }
  });

  it("retires the raw policy matrix for grouped sections", () => {
    expect(dashboard).not.toContain("admin-policy-grid");
    expect(dashboard).toContain("POLICY_GROUPS");
    expect(dashboard).toContain("Additional settings");
  });

  it("summarizes policy-change audit entries without the reason or version", () => {
    const lines = summarizePolicyChanges({
      hotelTimezone: "Asia/Manila",
      checkInTime: "14:00:00",
      cancellationPartialRefundBasisPoints: 3000,
      selfServiceModificationDays: 2,
      minimumBookingAge: 18,
      depositSlaHours: 4,
      validIdRequired: true,
      mysteryField: "x",
      reason: "Board decision.",
      version: 4,
    });
    expect(lines).toContain("Hotel timezone: Asia/Manila");
    expect(lines).toContain("Check-in time: 14:00");
    expect(lines).toContain("Partial refund rate: 30%");
    expect(lines).toContain("Self-service modification window: 2 days");
    expect(lines).toContain("Minimum booking age: 18 years");
    expect(lines).toContain("Deposit verification SLA: 4 hours");
    expect(lines).toContain("Valid ID required: Yes");
    expect(lines).toContain("Mystery Field: x");
    expect(lines.some((line) => line.startsWith("Reason:") || line.startsWith("Version:"))).toBe(false);
  });

  it("serves the policy change log from audited entries with actor names", () => {
    const route = read("app/api/owner/data/route.ts");
    expect(route).toContain('eq("entity_type", "hotel_operational_policy")');
    expect(route).toContain("actorName");
    expect(dashboard).toContain("Policy change history");
    expect(dashboard).toContain("summarizePolicyChanges");
    expect(dashboard).toContain("owner-change-line");
  });

  it("gives RPC-covered policy cards a scoped edit with reason and full-payload merge", () => {
    expect(dashboard).toContain("POLICY_EDITABLE_GROUPS");
    expect(dashboard).toContain("owner-policy-field-icon");
    expect(dashboard).toContain("Save changes");
    expect(dashboard).toContain("Reason for this critical policy change");
    // Scoped submit merges card values with live item values (full RPC payload).
    expect(dashboard).toContain("minimumBookingAge: Number(data.minimumBookingAge)");
    expect(dashboard).toContain("validIdRequired: Boolean(item.valid_id_required)");
    // Non-covered cards (transport, destination, extras) carry no Edit.
    const editable = dashboard.match(/POLICY_EDITABLE_GROUPS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(editable).toContain("Financial documents");
    expect(editable).not.toContain("Transportation");
    expect(editable).not.toContain("Payment destination");
    expect(editable).not.toContain("Additional settings");
  });

  it("leaves the three accepted modules wired and untouched", () => {
    for (const token of [
      "RoomCatalogPanel role=\"owner\"",
      "TransportServicesPanel",
      "TransportationPanel role=\"owner\"",
    ]) {
      expect(dashboard).toContain(token);
    }
  });

  it("adds no new data fetching beyond the existing section loader", () => {
    const fetches = dashboard.match(/fetch\(/g) ?? [];
    expect(fetches.length).toBeLessThanOrEqual(5);
  });
});
