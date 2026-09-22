// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentsFolioPanel, type PaymentsFolioItem } from "./payments-folio-panel";

afterEach(cleanup);

const items: PaymentsFolioItem[] = [
  { id: "current", stayState: "current", paymentState: "settled", balance: 0, paid: 5800, searchText: "HVN-260921 Garden Twin", content: <article>Current folio</article> },
  { id: "upcoming", stayState: "upcoming", paymentState: "due", balance: 4060, paid: 1740, searchText: "HVN-260930 Ocean Suite", content: <article>Upcoming folio</article> },
  { id: "cancelled", stayState: "cancelled", paymentState: "refund", balance: 0, paid: 2670, searchText: "HVN-260901 Deluxe King", content: <article>Cancelled folio</article> },
];

describe("PaymentsFolioPanel", () => {
  it("is mounted after the page hero so the full hierarchy starts with the banner", () => {
    const page = readFileSync(join(process.cwd(), "app/(booking)/(customer)/account/payments/page.tsx"), "utf8");
    expect(page.indexOf('className="customer-page-title"')).toBeGreaterThan(-1);
    expect(page.indexOf('className="customer-page-title"')).toBeLessThan(page.lastIndexOf("<PaymentsFolioPanel"));
  });

  it("renders summary cards before the transparent filter toolbar and folio list", () => {
    const { container } = render(<PaymentsFolioPanel items={items} />);
    const summary = container.querySelector(".folio-kpi-grid")!;
    const toolbar = container.querySelector(".haven-data-toolbar")!;
    const list = container.querySelector(".customer-financial-list")!;
    expect(summary.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.classList.contains("filters-compact")).toBe(true);
    expect(screen.getByText("3 stay records")).toBeTruthy();
  });

  it("filters locally from the keyboard-accessible selects and updates totals", () => {
    render(<PaymentsFolioPanel items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Stay status" }));
    fireEvent.click(screen.getByRole("option", { name: "Upcoming Stays (1)" }));
    expect(screen.getByText("Upcoming folio")).toBeTruthy();
    expect(screen.queryByText("Current folio")).toBeNull();
    expect(screen.getByText("1 stay record")).toBeTruthy();
    expect(screen.getByText("₱4,060")).toBeTruthy();
  });

  it("searches booking references without navigation and can clear the result", async () => {
    render(<PaymentsFolioPanel items={items} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search folios" }), { target: { value: "260901" } });
    expect(await screen.findByText("Cancelled folio")).toBeTruthy();
    expect(screen.queryByText("Upcoming folio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search folios" }));
    expect(await screen.findByText("Upcoming folio")).toBeTruthy();
  });
});
