// @vitest-environment jsdom
// Render-layer tests for the Staff & Duty panel: KPI summary + filtering,
// the staff table, error ≠ "no staff", filtered-empty recovery, and the
// detail modal. fetch is stubbed — no server calls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StaffDutyPanel from "./staff-duty-panel";
import { STAFF_DUTY_BASIS_NOTE, type StaffDutySnapshot } from "@/lib/staff-duty";

// jsdom ships no matchMedia; Modal reads prefers-reduced-motion on every render.
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

const snapshot: StaffDutySnapshot = {
  today: "2026-09-08", generatedAt: "2026-09-08T08:00:00Z", databaseMode: "demo",
  basisNote: STAFF_DUTY_BASIS_NOTE,
  summary: { working: 1, assigned: 1, noActiveWork: 1, departments: 3 },
  departments: [
    { name: "Housekeeping", working: 1, assigned: 0, noActiveWork: 0, total: 1, activity: { Cleaning: 1, "Work order": 0, "Cash handling": 0 } },
    { name: "Maintenance", working: 0, assigned: 1, noActiveWork: 0, total: 1, activity: { Cleaning: 0, "Work order": 0, "Cash handling": 0 } },
    { name: "Front Desk", working: 0, assigned: 0, noActiveWork: 1, total: 1, activity: { Cleaning: 0, "Work order": 0, "Cash handling": 0 } }
  ],
  staff: [
    { id: "ana", name: "Ana Cruz", role: "housekeeping", department: "Housekeeping", dutyStatus: "working", currentAssignment: "Room 102 · Checkout clean", assignmentKind: "housekeeping", cashShiftOpen: false,
      workload: { inProgress: 1, assigned: 0, completedToday: 2 },
      activeWork: [{ id: "HKT-1", source: "housekeeping", label: "Room 102 · Checkout clean", status: "in_progress", priority: "normal" }] },
    { id: "carlo", name: "Carlo Diaz", role: "maintenance", department: "Maintenance", dutyStatus: "assigned", currentAssignment: "Room 305 · AC not cooling", assignmentKind: "maintenance", cashShiftOpen: false,
      workload: { inProgress: 0, assigned: 1, completedToday: 0 },
      activeWork: [{ id: "MWO-1", source: "maintenance", label: "Room 305 · AC not cooling", status: "assigned", priority: "high" }] },
    { id: "mia", name: "Mia Reyes", role: "front_desk", department: "Front Desk", dutyStatus: "no_active_work", currentAssignment: null, assignmentKind: null, cashShiftOpen: false,
      workload: { inProgress: 0, assigned: 0, completedToday: 0 }, activeWork: [] }
  ]
};

const serve = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The table and its CSS-gated mobile card twin both render in jsdom (display
// switching never applies), so row assertions are scoped to the table.
const table = () => screen.getByRole("table");

describe("StaffDutyPanel", () => {
  it("renders the KPI summary, department coverage, and every staff row", async () => {
    vi.stubGlobal("fetch", serve({ data: snapshot }));
    render(<StaffDutyPanel />);
    const working = await screen.findByRole("button", { name: /working now/i });
    expect(within(working).getByText("1")).toBeTruthy();
    expect(within(table()).getByText("Room 102 · Checkout clean")).toBeTruthy(); // Ana's live assignment
    const housekeeping = screen.getByRole("button", { name: /housekeeping/i });
    expect(within(housekeeping).getByText((_, element) => element?.textContent === "1 of 1 on duty")).toBeTruthy();
    for (const name of ["Ana Cruz", "Carlo Diaz", "Mia Reyes"]) expect(within(table()).getByText(name)).toBeTruthy();
  });

  it("filters the table when a duty KPI is pressed, and restores on second press", async () => {
    vi.stubGlobal("fetch", serve({ data: snapshot }));
    render(<StaffDutyPanel />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /working now/i }));
    expect(within(table()).getByText("Ana Cruz")).toBeTruthy();
    expect(within(table()).queryByText("Carlo Diaz")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /working now/i }));
    expect(within(table()).getByText("Carlo Diaz")).toBeTruthy();
  });

  it("renders an explicit error state on backend failure — never 'no staff'", async () => {
    vi.stubGlobal("fetch", serve({ error: "Unable to load staff duty." }, false));
    render(<StaffDutyPanel />);
    expect(await screen.findByText("Staff duty unavailable")).toBeTruthy();
    expect(screen.getByText(/unable to load staff duty/i)).toBeTruthy();
    expect(screen.queryByText(/no staff on record/i)).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("shows a filtered-empty state with Clear filters, and clearing restores the rows", async () => {
    vi.stubGlobal("fetch", serve({ data: snapshot }));
    render(<StaffDutyPanel />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByPlaceholderText(/search staff/i), { target: { value: "zzz" } });
    expect(await screen.findByText("No matching staff")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    await waitFor(() => expect(within(table()).getByText("Ana Cruz")).toBeTruthy());
  });

  it("opens the detail modal with duty, assignment, workload, and the derivation note", async () => {
    vi.stubGlobal("fetch", serve({ data: snapshot }));
    render(<StaffDutyPanel />);
    fireEvent.click(within(await screen.findByRole("table")).getAllByText("View")[0]);
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Ana Cruz")).toBeTruthy();
    expect(within(modal).getByText("Working now")).toBeTruthy();
    expect(within(modal).getAllByText("Room 102 · Checkout clean").length).toBe(2); // hero + active work list
    expect(within(modal).getByText("2")).toBeTruthy(); // completed today
    expect(within(modal).getByText(STAFF_DUTY_BASIS_NOTE)).toBeTruthy();
  });
});
