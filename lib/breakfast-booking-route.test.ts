import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/booking/holds/route";

const state = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), single: vi.fn(), enabled: false }));
vi.mock("next-auth", () => ({ getServerSession: state.auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  rpc: state.rpc,
  from: () => ({ select: () => ({ eq: () => ({ single: state.single }) }) }),
} }));
vi.mock("@/lib/breakfast-server", () => ({ hotelBreakfastEnabled: () => state.enabled }));
vi.mock("@/lib/inventory-request-options", () => ({
  getPreArrivalOptions: async () => ({ amenities: [], services: [] }),
  findUnavailableSelections: () => [], PRE_ARRIVAL_UNAVAILABLE_MESSAGE: "Request items changed.",
}));
vi.mock("@/lib/guest-email-delivery", () => ({ deliverGuestEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({ escapeEmailText: (value: string) => value, guestEmailHtml: () => "" }));
vi.mock("@/lib/xendit", () => ({ xenditConfigured: () => true }));

const details = {
  attemptId: "05fd8571-ff9b-4368-a3a7-1419c953842e", roomId: "room-1", roomType: "King",
  checkIn: "2026-12-01", checkOut: "2026-12-03", guests: 2,
  firstName: "Ava", lastName: "Guest", email: "ava@example.invalid", mobile: "+639171234567",
  address: "Sample address", expectedArrival: "15:00",
  breakfastOfferId: "972dd3d7-d1a0-43ce-bf72-071647fbfa0e",
};
const request = (body: object = details) => new Request("https://hotel.example.invalid/api/booking/holds", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
  state.enabled = true;
  state.auth.mockReset().mockResolvedValue({ user: { id: "guest-1", role: "guest" } });
  state.single.mockReset().mockResolvedValue({ data: { deposit_method: "xendit", hotel_timezone: "Asia/Manila" }, error: null });
  state.rpc.mockReset().mockImplementation(async (name: string) => name === "read_booking_hold_attempt"
    ? { data: null, error: null }
    : { data: { token: "held-token", expiresAt: "2026-11-15T00:15:00Z", roomType: "King", replayed: false }, error: null });
});
afterEach(() => vi.useRealTimers());

describe("breakfast through the current booking entry point", () => {
  it("routes the selected offer through the actor-bound retry-safe hold", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ token: "held-token" });
    expect(state.rpc).toHaveBeenLastCalledWith("create_booking_hold_attempt", expect.objectContaining({
      p_user: "guest-1", p_attempt: details.attemptId, p_breakfast_enabled: true,
      p_details: expect.objectContaining({ breakfastOfferId: details.breakfastOfferId }),
    }));
  });

  it("recovers a prior successful hold even after breakfast is disabled", async () => {
    state.enabled = false;
    state.rpc.mockResolvedValueOnce({ data: { token: "original-hold" }, error: null });
    const response = await POST(request());
    expect(await response.json()).toEqual({ token: "original-hold" });
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.single).not.toHaveBeenCalled();
  });

  it("rejects a new unavailable breakfast choice with actionable safe wording", async () => {
    state.enabled = false;
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "BREAKFAST_UNAVAILABLE",
      error: "Breakfast is unavailable. Review the current room offer.", outcome: "rejected" });
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["BREAKFAST_OFFER_CHANGED", 409, "The breakfast offer changed. Reload to review the current options."],
    ["BREAKFAST_EXACT_ROOM_REQUIRED", 409, "Choose an exact room to continue with this breakfast offer."],
    ["BREAKFAST_FORBIDDEN", 403, "Please sign in with a guest account to continue."],
  ])("keeps %s distinct without exposing database details", async (code, status, error) => {
    state.rpc.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: `${code} private SQL details` } });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code, error });
  });

  it("keeps an unknown database outcome uncertain and suppresses diagnostics", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "23505 private SQL details" } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.outcome).toBe("unknown");
    expect(JSON.stringify(body)).not.toMatch(/23505|private SQL/);
  });
});
