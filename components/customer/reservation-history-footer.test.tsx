// @vitest-environment jsdom
// Section footer for reservation history: count left, pagination right,
// Clear-filters only when filters are active. Pagination navigates via the
// page URL param while preserving the active filters.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReservationHistoryFooter } from "./reservation-history-footer";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/my-reservations",
}));

afterEach(() => {
  cleanup();
  replace.mockClear();
});

const base = {
  query: "",
  status: "all",
  sort: "recommended",
  page: 1,
  pageCount: 1,
  start: 1,
  end: 3,
  total: 3,
  hasActiveFilters: false,
};

describe("ReservationHistoryFooter", () => {
  it("shows the range count and hides controls on a single page", () => {
    render(<ReservationHistoryFooter {...base} />);
    expect(screen.getByText("Showing 1–3 of 3 reservations")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Reservations pagination" })).toBeNull();
    expect(screen.queryByText("Clear filters")).toBeNull();
  });

  it("shows clear filters only when filters are active", () => {
    render(<ReservationHistoryFooter {...base} query="reyes" hasActiveFilters />);
    fireEvent.click(screen.getByText("Clear filters"));
    expect(replace).toHaveBeenCalledWith("/my-reservations", { scroll: false });
  });

  it("pages forward preserving filters and drops page=1 from the URL", () => {
    const { rerender } = render(
      <ReservationHistoryFooter
        {...base}
        query="reyes"
        status="upcoming"
        page={1}
        pageCount={3}
        start={1}
        end={6}
        total={15}
        hasActiveFilters
      />
    );
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page of reservations" }));
    expect(replace).toHaveBeenCalledWith("/my-reservations?q=reyes&status=upcoming&page=2", { scroll: false });
    rerender(
      <ReservationHistoryFooter
        {...base}
        query="reyes"
        status="upcoming"
        page={2}
        pageCount={3}
        start={7}
        end={12}
        total={15}
        hasActiveFilters
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous page of reservations" }));
    expect(replace).toHaveBeenCalledWith("/my-reservations?q=reyes&status=upcoming", { scroll: false });
  });

  it("disables previous on the first page and next on the last page", () => {
    const { rerender } = render(<ReservationHistoryFooter {...base} page={1} pageCount={2} total={9} end={6} />);
    expect(screen.getByRole("button", { name: "Previous page of reservations" }).hasAttribute("disabled")).toBe(true);
    rerender(<ReservationHistoryFooter {...base} page={2} pageCount={2} total={9} start={7} end={9} />);
    expect(screen.getByRole("button", { name: "Next page of reservations" }).hasAttribute("disabled")).toBe(true);
  });
});
