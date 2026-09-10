// Event-sourced notifications + guest email — the side-channel contract.
//
// The rule under test: a notification or email failure can NEVER surface as an
// error to the business action that triggered it, and no email content ever
// leaks the API key or recipient errors into responses.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db as FakeDb) };
});
const fetchMock = vi.hoisted(() => vi.fn());

const { recordNotification, getCustomerNotifications, countUnreadNotifications, notifyWithOptionalEmail } = await import("@/lib/notifications");
const { sendEmail, emailConfigured, guestEmailHtml } = await import("@/lib/email");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const resetDb = () => {
  for (const key of Object.keys(fake.db)) delete fake.db[key];
};

const cleanEnv = () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
};

describe("recordNotification", () => {
  beforeEach(() => {
    resetDb();
    cleanEnv();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("inserts one row per guest-facing event", async () => {
    await recordNotification({ userId: A, type: "reservation_confirmed", title: "Reservation confirmed", detail: "Deluxe King — HVN-1", href: "/my-reservations/1" });
    expect(fake.db.notifications).toHaveLength(1);
    expect(fake.db.notifications[0]).toMatchObject({ user_id: A, type: "reservation_confirmed", title: "Reservation confirmed" });
  });

  it("never throws when the insert fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.db.notifications = Object.create(null); // poisoned table
    await expect(
      recordNotification({ userId: A, type: "payment_link", title: "t" })
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it("scopes reads to the requesting user, newest first", async () => {
    await recordNotification({ userId: A, type: "payment_link", title: "first" });
    fake.db.notifications[0].created_at = "2026-09-01T00:00:00Z";
    await recordNotification({ userId: B, type: "payment_link", title: "bravo" });
    await recordNotification({ userId: A, type: "reservation_confirmed", title: "second" });
    fake.db.notifications[2].created_at = "2026-09-02T00:00:00Z";
    const rows = await getCustomerNotifications(A);
    expect(rows.map((row) => row.title)).toEqual(["second", "first"]);
    expect(JSON.stringify(rows)).not.toContain("bravo");
  });

  it("counts unread as rows without read_at", async () => {
    await recordNotification({ userId: A, type: "payment_link", title: "a" });
    await recordNotification({ userId: A, type: "payment_link", title: "b" });
    fake.db.notifications[0].read_at = "2026-09-01T00:00:00Z";
    expect(await countUnreadNotifications(A)).toBe(1);
    expect(await countUnreadNotifications(B)).toBe(0);
  });
});

describe("notifyWithOptionalEmail", () => {
  beforeEach(() => {
    resetDb();
    cleanEnv();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("records the notification but sends no email when unconfigured", async () => {
    await notifyWithOptionalEmail({ userId: A, type: "deposit_verified", title: "t" }, "guest@example.test", { subject: "s", heading: "h", bodyHtml: "<p>b</p>" });
    expect(fake.db.notifications).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the email copy when configured, and skips silently without an address", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue({ ok: true });
    await notifyWithOptionalEmail({ userId: A, type: "deposit_rejected", title: "t" }, "guest@example.test", { subject: "s", heading: "h", bodyHtml: "<p>b</p>" });
    expect(fake.db.notifications).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("guest@example.test");
    expect(body.subject).toBe("s");
    await notifyWithOptionalEmail({ userId: A, type: "deposit_rejected", title: "t2" }, null, { subject: "s", heading: "h", bodyHtml: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no address, no call
  });

  it("never throws when the provider call fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyWithOptionalEmail({ userId: A, type: "stay_payment_verified", title: "t" }, "guest@example.test", { subject: "s", heading: "h", bodyHtml: "" })
    ).resolves.toBeUndefined();
    expect(fake.db.notifications).toHaveLength(1); // in-app row still recorded
    error.mockRestore();
  });
});

describe("sendEmail (lib/email)", () => {
  beforeEach(() => {
    cleanEnv();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("is unconfigured without a key and makes no network call", async () => {
    expect(emailConfigured()).toBe(false);
    const result = await sendEmail({ to: "x@example.test", subject: "s", html: "" });
    expect(result).toMatchObject({ ok: false, reason: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a blank recipient without calling the provider", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const result = await sendEmail({ to: "  ", subject: "s", html: "" });
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to the configured sender and never leaks the key in the response", async () => {
    process.env.RESEND_API_KEY = "re_secret_key";
    process.env.RESEND_FROM = "Haven <noreply@haven.example>";
    fetchMock.mockResolvedValue({ ok: true });
    const result = await sendEmail({ to: "x@example.test", subject: "s", html: "" });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_secret_key");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Haven <noreply@haven.example>");
    expect(JSON.stringify(result)).not.toContain("re_secret_key");
  });

  it("degrades on provider errors and network failure", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await sendEmail({ to: "x@example.test", subject: "s", html: "" })).toMatchObject({ ok: false, reason: "failed" });
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await sendEmail({ to: "x@example.test", subject: "s", html: "" })).toMatchObject({ ok: false, reason: "failed" });
  });

  it("escapes nothing by itself but wraps the body in the branded envelope", () => {
    const html = guestEmailHtml("Heading", "<p>Body</p>");
    expect(html).toContain("HAVEN HOTEL");
    expect(html).toContain("<p>Body</p>");
  });
});
