// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentsFolioPanel } from "./payments-folio-panel";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/account/payments",
}));

afterEach(() => {
  cleanup();
  replace.mockClear();
});

const props = {
  filters: { stay: "all", payment: "all", query: "" } as const,
  stayCounts: { all: 12, current: 1, upcoming: 1, past: 9, cancelled: 1 },
  paymentCounts: { all: 12, pending: 0, due: 1, refund: 1, settled: 10 },
  pagination: { page: 2, pageCount: 3, start: 5, end: 8, total: 12 },
  outstanding: 4060,
  paidToDate: 10210,
  children: <article>Current folio page</article>,
};

describe("PaymentsFolioPanel", () => {
  it("is mounted after the page hero so the full hierarchy starts with the banner", () => {
    const page = readFileSync(join(process.cwd(), "app/(booking)/(customer)/account/payments/page.tsx"), "utf8");
    expect(page.indexOf('className="customer-page-title"')).toBeGreaterThan(-1);
    expect(page.indexOf('className="customer-page-title"')).toBeLessThan(page.lastIndexOf("<PaymentsFolioPanel"));
  });

  it("renders summary cards before the transparent filter toolbar and folio list", () => {
    const { container } = render(<PaymentsFolioPanel {...props} />);
    const summary = container.querySelector('[aria-label="Financial summary"]')!;
    const toolbar = container.querySelector(".haven-data-toolbar")!;
    const list = container.querySelector(".customer-financial-list")!;
    expect(summary.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.classList.contains("filters-compact")).toBe(true);
    expect(screen.getByText("12 stay records")).toBeTruthy();
    expect(screen.getByText("₱4,060")).toBeTruthy();
    expect(screen.getByText("Current folio page")).toBeTruthy();
  });

  it("changes the filter URL and resets the page", () => {
    render(<PaymentsFolioPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Stay status" }));
    fireEvent.click(screen.getByRole("option", { name: "Upcoming Stays (1)" }));
    expect(replace).toHaveBeenCalledWith("/account/payments?stay=upcoming", { scroll: false });
  });

  it("keeps filters on the next page and clears them together", () => {
    render(<PaymentsFolioPanel {...props} filters={{ stay: "past", payment: "settled", query: "QA-12" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page of folios" }));
    expect(replace).toHaveBeenLastCalledWith("/account/payments?stay=past&pay=settled&q=QA-12&page=3", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(replace).toHaveBeenLastCalledWith("/account/payments", { scroll: false });
  });
});
