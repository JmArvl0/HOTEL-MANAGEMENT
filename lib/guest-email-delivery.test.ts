import { beforeEach, expect, it, vi } from "vitest";
const { rpc, sendEmail } = vi.hoisted(() => ({ rpc: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
vi.mock("@/lib/email", () => ({ sendEmail }));
import { deliverGuestEmail } from "@/lib/guest-email-delivery";
const message = { to: "fixture@example.invalid", subject: "Reminder", html: "<p>Stay reminder</p>" };
beforeEach(() => {
  rpc.mockReset(); sendEmail.mockReset();
  rpc.mockImplementation(async name => ({ data: name === "claim_guest_email_delivery" ? 1 : null, error: null }));
});
it("records the provider receipt against the durable event and stable idempotency key", async () => {
  sendEmail.mockResolvedValue({ ok: true, providerId: "fixture-provider-receipt" });
  expect(await deliverGuestEmail("fixture:1", message)).toBe("sent");
  expect(sendEmail).toHaveBeenCalledWith({ ...message, idempotencyKey: "fixture:1" });
  expect(rpc).toHaveBeenCalledWith("finish_guest_email_delivery", expect.objectContaining({
    p_key: "fixture:1", p_state: "sent", p_provider_id: "fixture-provider-receipt",
  }));
});
it("preserves failed and unconfigured outcomes with an explicit retry choice", async () => {
  sendEmail.mockResolvedValue({ ok: false, reason: "failed" });
  expect(await deliverGuestEmail("fixture:2", message, true)).toBe("error");
  expect(rpc).toHaveBeenCalledWith("claim_guest_email_delivery", { p_key: "fixture:2", p_retry: true });
  expect(rpc).toHaveBeenCalledWith("finish_guest_email_delivery", expect.objectContaining({ p_state: "failed" }));
  sendEmail.mockResolvedValue({ ok: false, reason: "unconfigured" });
  expect(await deliverGuestEmail("fixture:3", message)).toBe("skipped");
});
it("does not dispatch without a claim and never throws into the business operation", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await deliverGuestEmail("fixture:4", message)).toBe("skipped");
  expect(sendEmail).not.toHaveBeenCalled();
  rpc.mockRejectedValue(new Error("temporary network error"));
  expect(await deliverGuestEmail("fixture:5", message)).toBe("error");
});
