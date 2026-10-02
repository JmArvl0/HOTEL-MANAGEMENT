// @vitest-environment jsdom
// The folio redemption block. The RPC credits least(points, invoice total) but
// debits every point sent, so the widget's cap (min of points and the floored
// balance) is the only thing stopping a guest burning points for no credit —
// these cases pin that cap along with the two input paths and the POST body.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoyaltyRedemptionSelector from "./loyalty-redemption-selector";

const UUID = "11111111-1111-4111-8111-111111111111";
const reload = vi.fn();
const originalLocation = window.location;

type Call = { url: string; init?: RequestInit };

function recordFetch(points: number) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url) === "/api/account/loyalty") return { ok: true, json: async () => ({ data: { points } }) };
    return { ok: true, json: async () => ({ data: { ok: true } }) };
  }));
  return calls;
}

beforeEach(() => {
  reload.mockReset();
  // jsdom's reload() is "Not implemented"; the widget reloads the server-rendered
  // page on success.
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: { reload } });
  vi.stubGlobal("crypto", { randomUUID: () => UUID });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
});

describe("LoyaltyRedemptionSelector", () => {
  it("caps the offer at the folio balance, not the raw points balance", async () => {
    recordFetch(2450);
    render(<LoyaltyRedemptionSelector reservationId="res-1" folioBalance={1800.55} />);

    expect((await screen.findByText("2,450 pts")).textContent).toBe("2,450 pts");
    expect(screen.getByText("1,800 pts").textContent).toBe("1,800 pts");
    expect(screen.getByText("1 point = ₱1 off this folio.").textContent).toBe("1 point = ₱1 off this folio.");
    // Neither input may offer more than the cap.
    expect((screen.getByLabelText("Points to apply") as HTMLInputElement).max).toBe("1800");
    expect((screen.getByLabelText("Points to apply — exact amount") as HTMLInputElement).max).toBe("1800");
  });

  it("Use max fills both inputs, previews the credit, and then switches itself off", async () => {
    recordFetch(2450);
    render(<LoyaltyRedemptionSelector reservationId="res-1" folioBalance={1800.55} />);

    fireEvent.click(await screen.findByRole("button", { name: "Use max" }));

    const number = screen.getByLabelText("Points to apply — exact amount") as HTMLInputElement;
    expect(number.value).toBe("1800");
    expect((screen.getByLabelText("Points to apply") as HTMLInputElement).value).toBe("1800");
    expect(screen.getByRole("button", { name: "Apply 1,800 pts" })).toBeTruthy();
    expect(screen.getByText(/Removes/).textContent).toContain("1,800");
    expect((screen.getByRole("button", { name: "Use max" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("applying posts the chosen points with a fresh idempotency key", async () => {
    const calls = recordFetch(2450);
    render(<LoyaltyRedemptionSelector reservationId="res-42" folioBalance={1800.55} />);

    fireEvent.click(await screen.findByRole("button", { name: "Use max" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 1,800 pts" }));

    await waitFor(() => expect(calls.filter((call) => call.url !== "/api/account/loyalty")).toHaveLength(1));
    const post = calls.find((call) => call.url === "/api/account/loyalty/redeem")!;
    expect(post.init?.method).toBe("POST");
    expect(JSON.parse(String(post.init?.body))).toEqual({ reservationId: "res-42", points: 1800, idempotencyKey: UUID });
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("stays hidden when the guest has no points or nothing left to pay", async () => {
    const { container } = render(<LoyaltyRedemptionSelector reservationId="res-1" folioBalance={0} />);
    await waitFor(() => expect(container.querySelector(".loyalty-redeem")).toBeNull());

    cleanup();
    recordFetch(0);
    const second = render(<LoyaltyRedemptionSelector reservationId="res-1" folioBalance={500} />);
    await waitFor(() => expect(second.container.querySelector(".loyalty-redeem")).toBeNull());
  });

  it("surfaces the server refusal through the alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url) === "/api/account/loyalty") return { ok: true, json: async () => ({ data: { points: 2450 } }) };
      return { ok: false, json: async () => ({ error: "Not enough points for this folio." }) };
    }));
    render(<LoyaltyRedemptionSelector reservationId="res-1" folioBalance={1800} />);

    fireEvent.click(await screen.findByRole("button", { name: "Use max" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 1,800 pts" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Not enough points for this folio.");
    expect(reload).not.toHaveBeenCalled();
  });
});
