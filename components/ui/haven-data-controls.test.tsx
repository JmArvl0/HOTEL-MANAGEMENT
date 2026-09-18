// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
