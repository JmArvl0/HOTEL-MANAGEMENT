// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoyaltyCardPanel from "./loyalty-card-panel";

const response = {
  data: {
    points: 150,
    tier: "silver",
    tierLabel: "Silver",
    lifetimeSpend: 10000,
    nextTier: "gold",
    nextTierLabel: "Gold",
    spendToNext: 10000,
    progress: 0.5,
    ledger: [
      { id: "txn-1", points: 150, transaction_type: "earned", notes: "Completed stay", reservation_id: "HVN-260921", created_at: "2026-09-22T08:00:00.000Z" },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoyaltyCardPanel", () => {
  it("renders stable loading geometry before the rewards response arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = render(<LoyaltyCardPanel />);
    expect(container.querySelectorAll(".loyalty-skeleton-kpi")).toHaveLength(3);
    expect(screen.getByLabelText("Loading loyalty rewards").getAttribute("aria-busy")).toBe("true");
  });

  it("renders live KPI math, accessible progress, tiers, and ledger data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    render(<LoyaltyCardPanel />);

    expect((await screen.findByLabelText("Rewards summary")).textContent).toContain("150 points");
    expect(screen.getByText("₱150.00")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Progress to Gold" }).getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("HVN-260921")).toBeTruthy();
    expect(screen.getByText("+150").classList.contains("points-positive")).toBe(true);
  });

  it("supports keyboard activation when comparing tiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    render(<LoyaltyCardPanel />);
    const gold = await screen.findByRole("button", { name: /Gold/ });
    gold.focus();
    fireEvent.click(gold);
    expect(document.activeElement).toBe(gold);
    expect(gold.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Gold privileges:/)).toBeTruthy();
  });

  it("renders a guided empty state when no point activity exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...response.data, ledger: [] } }),
    }));
    render(<LoyaltyCardPanel />);

    expect(await screen.findByText("Your points story starts after checkout")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry action after an API failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Service unavailable." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoyaltyCardPanel />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((await screen.findByLabelText("Rewards summary")).textContent).toContain("150 points");
  });
});
