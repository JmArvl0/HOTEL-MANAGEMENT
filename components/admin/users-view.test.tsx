// @vitest-environment jsdom
// Users & Staff module: the filter toolbar narrows the already-loaded account
// rows client-side — role, status, recovery, department, and search all agree
// with the visible table and the footer count, and Clear filters restores
// everything. Pure render; no fetches.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UsersView } from "./admin-dashboard-client";
import type { RecordItem } from "@/lib/types";

// The dashboard module imports panels that read layout/motion APIs jsdom lacks.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const account = (overrides: Partial<RecordItem>) => ({
  account_status: "active",
  recovery_required: false,
  auth_version: 1,
  ...overrides,
} as RecordItem);

const rows = [
  account({ id: "u1", name: "Ana Reyes", email: "ana@haven.test", role: "front_desk", department: "front desk", employee_reference: "FD-001" }),
  account({ id: "u2", name: "Ben Lim", email: "ben@haven.test", role: "housekeeping", department: "housekeeping" }),
  account({ id: "u3", name: "Carla Cruz", email: "carla@mail.test", role: "guest", department: null }),
  account({ id: "u4", name: "Dino Tan", email: "dino@haven.test", role: "manager", department: "operations", account_status: "suspended", recovery_required: true }),
];

const renderView = () => {
  const action = vi.fn();
  render(<UsersView rows={rows} create={() => {}} action={action} />);
  return action;
};

const tableRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));
const select = (name: string) => screen.getByLabelText(name, { selector: "select" });

afterEach(cleanup);

describe("UsersView filters", () => {
  it("renders every account and derives the role/department options from the data", () => {
    renderView();
    expect(tableRows()).toHaveLength(4);
    const roleSelect = select("Role");
    expect(Array.from(roleSelect.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      ["All roles", "front desk", "housekeeping", "guest", "manager"],
    );
    const departmentSelect = select("Department");
    expect(Array.from(departmentSelect.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      ["All departments", "front desk", "housekeeping", "operations"],
    );
    // Departments without a value (guests) never appear.
    expect(within(departmentSelect).queryByText("—")).toBeNull();
  });

  it("narrows by role", () => {
    renderView();
    fireEvent.change(select("Role"), { target: { value: "front_desk" } });
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("Ana Reyes")).toBeTruthy();
    expect(screen.getByText("Showing 1 of 4 accounts")).toBeTruthy();
  });

  it("narrows by status and by recovery requirement", () => {
    renderView();
    fireEvent.change(select("Status"), { target: { value: "suspended" } });
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("Dino Tan")).toBeTruthy();

    fireEvent.change(select("Status"), { target: { value: "all" } });
    fireEvent.change(select("Recovery"), { target: { value: "required" } });
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("Dino Tan")).toBeTruthy();
  });

  it("searches name, email, and employee reference case-insensitively", () => {
    renderView();
    const search = screen.getByLabelText("Search accounts");
    fireEvent.change(search, { target: { value: "ana" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: "CARLA@MAIL" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: "FD-001" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: "no such person" } });
    expect(tableRows()).toHaveLength(0);
  });

  it("renders summary cards that match the filter counts and drive the filters", () => {
    renderView();
    const summary = screen.getByRole("group", { name: "Accounts summary" });
    // Counts derive from the same predicates as the selects: 3 active, 1
    // suspended, 1 recovery-required, 3 staff among the 4 accounts.
    expect(within(summary).getByText("Accounts on record").nextElementSibling?.textContent).toBe("4");
    expect(within(summary).getByRole("button", { name: /Active/ }).querySelector("b")?.textContent).toBe("3");
    const suspendedCard = within(summary).getByRole("button", { name: /Suspended/ });
    expect(suspendedCard.querySelector("b")?.textContent).toBe("1");
    expect(within(summary).getByRole("button", { name: /Recovery required/ }).querySelector("b")?.textContent).toBe("1");
    expect(within(summary).getByText("Staff accounts").nextElementSibling?.textContent).toBe("3");
    // Card == filter: clicking Suspended applies the status filter.
    fireEvent.click(suspendedCard);
    expect(suspendedCard.getAttribute("aria-pressed")).toBe("true");
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("Dino Tan")).toBeTruthy();
    expect(screen.getByText("Showing 1 of 4 accounts")).toBeTruthy();
  });

  it("shows the clear-filters empty state and restores every row", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Search accounts"), { target: { value: "no such person" } });
    expect(screen.getByText("No accounts match these filters")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(tableRows()).toHaveLength(4);
    expect(screen.getByText("Showing 4 of 4 accounts")).toBeTruthy();
  });
});
