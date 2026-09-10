// @vitest-environment jsdom
// Pure-function tests for the grouped sidebar navigation (nav / groupedNav /
// isGroupOpen). RBAC itself lives in the access map + lib/permissions and is
// unchanged — these pin the grouping layer's presentation contracts: one
// category per module, empty categories hidden, active category forced open.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { groupedNav, isGroupOpen, ManagerSidebarNav, nav, NAV_GROUPS } from "./manager-dashboard-client";

// The dashboard file pulls in recharts via its panel imports; jsdom has no
// ResizeObserver or layout. (Same stubs as approvals-view.test.tsx.)
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.getBoundingClientRect = function () {
  return { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0 } as DOMRect;
};
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
// This jsdom setup ships no localStorage; the sidebar persists open/closed
// categories there.
if (!window.localStorage) {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
}

type NavItem = Parameters<typeof groupedNav>[0][number];
const item = (section: string, group: string): NavItem =>
  ({ label: section, section, icon: () => null, group }) as unknown as NavItem;

describe("sidebar category grouping", () => {
  it("maps every nav module to exactly one known category", () => {
    const ids = NAV_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(NAV_GROUPS.length);
    for (const entry of nav) expect(ids).toContain(entry.group);
    // No module appears twice in the sidebar.
    expect(nav.length).toBe(new Set(nav.map((entry) => entry.section)).size);
  });
  it("keeps Management restricted to manager-gated modules", () => {
    const management = nav.filter((entry) => entry.group === "management");
    expect(management.length).toBeGreaterThan(0);
    for (const entry of management) expect(entry.roles).toContain("manager");
  });
  it("groups in category order and hides categories with no visible children", () => {
    // Housekeeping's RBAC slice: no Finance or Management modules survive the filter.
    const housekeepingSections = ["overview", "rooms", "guest_requests", "housekeeping_tasks", "inventory", "approvals"];
    const visible = housekeepingSections.map((section) =>
      item(section, nav.find((entry) => entry.section === section)!.group));
    expect(groupedNav(visible).map((group) => group.id)).toEqual(["workspace", "front_office", "operations"]);
    expect(groupedNav([item("folios", "finance")]).map((group) => group.id)).toEqual(["finance"]);
  });
  it("opens the active module's category even when it was collapsed", () => {
    const operations = groupedNav(nav).find((group) => group.id === "operations")!;
    expect(isGroupOpen({}, operations, "overview")).toBe(false);
    expect(isGroupOpen({ operations: true }, operations, "overview")).toBe(true);
    expect(isGroupOpen({ operations: false }, operations, "overview")).toBe(false);
    // The active module's category can never be collapsed away.
    expect(isGroupOpen({ operations: false }, operations, "housekeeping_tasks")).toBe(true);
  });
});

describe("sidebar overflow", () => {
  it("keeps vertical navigation scrolling without exposing a horizontal scrollbar", () => {
    const theme = readFileSync(resolve(process.cwd(), "app/manager-dashboard-theme.css"), "utf8");

    expect(theme).toMatch(/\.app-shell \.sidebar nav\{[^}]*overflow-x:hidden[^}]*overflow-y:auto[^}]*\}/);
    expect(theme).toMatch(/\.app-shell \.sidebar \.nav-group-header\{[^}]*width:calc\(100% - 8px\)[^}]*\}/);
  });
});

describe("sidebar dropdown interaction", () => {
  afterEach(() => { localStorage.clear(); cleanup(); });

  it("toggles a category open on click and persists the choice", () => {
    render(<ManagerSidebarNav items={nav} section="overview" onSelect={() => {}} openTasks={0} />);
    const header = screen.getByRole("button", { name: "Operations" });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(JSON.parse(localStorage.getItem("haven-sidebar-groups") ?? "{}")).toEqual({ operations: true });
  });

  it("keeps the active module's category open even when stored collapsed", () => {
    localStorage.setItem("haven-sidebar-groups", JSON.stringify({ operations: false }));
    render(<ManagerSidebarNav items={nav} section="housekeeping_tasks" onSelect={() => {}} openTasks={2} />);
    expect(screen.getByRole("button", { name: "Operations" }).getAttribute("aria-expanded")).toBe("true");
    // The housekeeping module button carries the open-task count badge.
    expect(screen.getByTitle("Housekeeping").textContent).toContain("2");
  });
});
