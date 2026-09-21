// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CalendarDays } from "lucide-react";
import { HavenDataToolbar, HavenEmptyState, HavenFilterBadges, HavenSearchInput } from "./haven-data-controls";
import { StatusBadge } from "./StatusBadge";
import { HavenButton } from "./haven-button";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HavenSearchInput", () => {
  it("updates automatically after the standard debounce without an Apply action", () => {
    vi.useFakeTimers();
    const onValueChange = vi.fn();
    render(<HavenSearchInput value="" onValueChange={onValueChange} label="Search reservations" placeholder="Search…" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Garden" } });
    expect(onValueChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(349);
    expect(onValueChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onValueChange).toHaveBeenCalledWith("Garden");
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
  });

  it("clears immediately and preserves a keyboard-accessible clear control", () => {
    const onValueChange = vi.fn();
    render(<HavenSearchInput value="Garden" onValueChange={onValueChange} label="Search reservations" placeholder="Search…" />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search reservations" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});

describe("HavenFilterBadges", () => {
  it("always places All first, marks it selected by default, and applies immediately", () => {
    const onChange = vi.fn();
    render(
      <HavenFilterBadges
        value="all"
        onChange={onChange}
        label="Reservation status"
        options={[
          { value: "upcoming", label: "Upcoming", count: 2 },
          { value: "all", label: "All", count: 4 },
          { value: "cancelled", label: "Cancelled", count: 1 },
        ]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toContain("All");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Upcoming/ }));
    expect(onChange).toHaveBeenCalledWith("upcoming");
    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

describe("HavenDataToolbar", () => {
  it("keeps search before quick and advanced filters in DOM order", () => {
    const { container } = render(
      <HavenDataToolbar
        search={<HavenSearchInput value="" onValueChange={() => {}} label="Search" placeholder="Search…" />}
        quickFilters={<HavenFilterBadges value="all" onChange={() => {}} label="Quick filters" options={[{ value: "all", label: "All" }]} />}
        advancedFilters={<button type="button">Advanced control</button>}
        resultCount={0}
      />,
    );
    const search = container.querySelector(".haven-toolbar-search")!;
    const quick = container.querySelector(".haven-toolbar-quick")!;
    const advanced = container.querySelector(".haven-toolbar-advanced")!;
    expect(search.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quick.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a transparent wrapper — controls keep their surfaces, the card does not", () => {
    const css = readFileSync(join(process.cwd(), "components/ui/haven-data-controls.css"), "utf8");
    const block = css.match(/\.haven-data-toolbar\s*\{[^}]*\}/)![0];
    // The wrapper contributes no surface at all: no fill, border, radius, shadow or padding.
    expect(block).toMatch(/background:\s*transparent/);
    expect(block).toMatch(/border:\s*0/);
    expect(block).toMatch(/border-radius:\s*0/);
    expect(block).toMatch(/box-shadow:\s*none/);
    expect(block).toMatch(/padding:\s*0/);
    // ...while the search input keeps its own surface, border and radius.
    const input = css.match(/\.haven-search-input input\s*\{[^}]*\}/)![0];
    expect(input).toMatch(/border:\s*1px solid/);
    expect(input).toMatch(/background:/);
    expect(input).toMatch(/border-radius:/);
  });

  it("gives the light staff search input a solid surface distinct from the page floor", () => {
    const css = readFileSync(join(process.cwd(), "components/ui/haven-data-controls.css"), "utf8");
    // Canonical staff mapping is the only place staff search tokens are set.
    const staff = css.match(/\.theme-light \.app-shell\s*\{[^}]*--hc-surface[^}]*\}/)![0];
    expect(staff).toMatch(/--hc-surface/);
    expect(staff).toMatch(/--hc-line/);
    // The input itself paints the solid surface (not the soft wash that
    // blended into the Cool Paper floor) with a visible focus ring.
    const input = css.match(/\.haven-search-input input\s*\{[^}]*\}/)![0];
    expect(input).toMatch(/background:\s*var\(--hc-surface/);
    expect(input).toMatch(/border-radius:\s*12px/);
    expect(css).toMatch(/\.haven-search-input input:hover\s*\{[^}]*border-color/);
    expect(css).toMatch(/\.haven-search-input input:focus-visible\s*\{[^}]*box-shadow/);
  });

  // The standard only holds if no other stylesheet re-draws the card around the
  // toolbar. These selectors all select a wrapper element itself (the wrapper class
  // is the last part of the selector, so child rules like `.reservation-filters button`
  // are excluded), which means a surface or padding declaration on one would silently
  // reintroduce the outer card. This caught the light-theme and customer-portal rules.
  it("no stylesheet gives a toolbar wrapper a background, border, shadow or padding", () => {
    const wrapper = /\.(haven-data-toolbar|reservation-filters|owner-toolbar|tp-toolbar|hk-toolbar|sd-toolbar|approval-toolbar|table-tools)([.:][\w-]+)?$/;
    const surfaceProps = new Set(["background", "border", "border-color", "border-width", "box-shadow", "padding"]);
    const inert = /^(0|none|transparent|0 0)$/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        if (entry.isDirectory()) { walk(`${dir}/${entry.name}`); continue; }
        if (!entry.name.endsWith(".css")) continue;
        const file = `${dir}/${entry.name}`;
        const css = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
          if (!selector.split(",").some((part) => wrapper.test(part.trim()))) continue;
          const drawn = body.split(";").some((declaration) => {
            const [prop, ...rest] = declaration.split(":");
            const value = rest.join(":").trim();
            return surfaceProps.has(prop.trim()) && !!value && !inert.test(value);
          });
          if (drawn) offenders.push(`${file}: ${selector.trim()}`);
        }
      }
    };
    walk("app");
    walk("components");
    expect(offenders).toEqual([]);
  });
});

describe("shared state primitives", () => {
  it("renders a structured empty state with an optional real action", () => {
    render(<HavenEmptyState icon={<CalendarDays />} title="No reservations found" body="Try changing your search." action={<button>Clear filters</button>} />);
    expect(screen.getByRole("heading", { name: "No reservations found" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("renders status as a non-interactive semantic badge", () => {
    render(<StatusBadge status="paid" />);
    const badge = screen.getByText("Paid").closest(".haven-status");
    expect(badge?.className).toContain("haven-status--success");
    expect(badge?.tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders explicit semantic button variants", () => {
    render(<HavenButton variant="danger">Reject request</HavenButton>);
    const button = screen.getByRole("button", { name: "Reject request" });
    expect(button.className).toContain("haven-button--danger");
    expect(button.className).toContain("haven-button--internal");
  });
});
