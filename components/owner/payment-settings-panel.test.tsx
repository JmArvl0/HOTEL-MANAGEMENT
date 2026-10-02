// @vitest-environment jsdom
// Regression: the Owner Payment Settings wizard has ONE primary save, and it
// must commit the deposit method as well as the destination. Previously
// "Save changes" called only /api/owner/payment-destination, so switching
// PayMongo -> Manual GCash reported success while deposit_method stayed
// 'paymongo' and the radio snapped back on refresh.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const askPrompt = vi.fn();
vi.mock("@/components/ui/action-dialogs", () => ({
  useActionDialogs: () => ({ askPrompt, view: null }),
}));

import PaymentSettingsPanel from "./payment-settings-panel";

const QR = "gcash/11111111-1111-4111-8111-111111111111.png";

function payload(depositMethod: "paymongo" | "manual" | "off", version = 7) {
  return {
    destination: {
      accountName: "HAVEN Hotel",
      mobileNumber: "09171234567",
      qrStoragePath: QR,
      enabled: depositMethod !== "off",
      depositMethod,
      version,
    },
    qrDataUrl: null,
    qrHealthy: true,
    lastUpdated: null,
    lastUpdatedBy: null,
    trail: [],
  };
}

function recordPatches(methodVersion: number) {
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patches.push({ url: String(url), body: JSON.parse(String(init.body)) });
      if (url === "/api/admin/deposit-method") {
        return { ok: true, json: async () => ({ data: { version: methodVersion, depositMethod: "manual" } }) };
      }
      return { ok: true, json: async () => ({ data: { version: methodVersion + 1 } }) };
    }
    return { ok: true, json: async () => ({ data: payload("paymongo") }) };
  }));
  return patches;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  askPrompt.mockResolvedValue("Board decision.");
});

describe("Owner payment settings — one save commits the method", () => {
  it("switches the method first, then saves the destination with the returned version", async () => {
    const patches = recordPatches(8);
    render(<PaymentSettingsPanel notify={() => {}} />);

    fireEvent.click(await screen.findByRole("radio", { name: /Manual GCash verification/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches.map((call) => call.url)).toEqual([
      "/api/admin/deposit-method",
      "/api/owner/payment-destination",
    ]);
    expect(patches[0].body).toMatchObject({ depositMethod: "manual", reason: "Board decision.", version: 7 });
    // The destination save must carry the version the method switch produced,
    // not the stale one — they share hotel_operational_policies.version.
    expect(patches[1].body).toMatchObject({ version: 8, accountName: "HAVEN Hotel" });
  });

  it("saves only the destination when the method is unchanged", async () => {
    const patches = recordPatches(8);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return { ok: true, json: async () => ({ data: { version: 8 } }) };
      }
      return { ok: true, json: async () => ({ data: payload("manual") }) };
    }));
    render(<PaymentSettingsPanel notify={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe("/api/owner/payment-destination");
    expect(patches[0].body).toMatchObject({ version: 7 });
  });
});
