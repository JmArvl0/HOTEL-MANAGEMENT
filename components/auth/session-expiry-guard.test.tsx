/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  formatSessionCountdown,
  SessionExpiryGuard,
  sessionCountdownLabel,
  sessionCountdownTone,
} from "@/components/auth/session-expiry-guard";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

afterEach(() => {
  cleanup();
  signOut.mockReset();
  vi.useRealTimers();
});

describe("SessionExpiryGuard", () => {
  it("uses the compact approved formats and warning states", () => {
    expect(formatSessionCountdown(((7 * 60 + 42) * 60 + 15) * 1000)).toBe("07:42:15");
    expect(formatSessionCountdown((24 * 60 + 35) * 1000)).toBe("24:35");
    expect(sessionCountdownTone(6 * 60_000)).toBe("normal");
    expect(sessionCountdownTone(5 * 60_000)).toBe("warning");
    expect(sessionCountdownTone(60_000)).toBe("critical");
  });

  it("shows only the time while exposing a non-live accessible label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T04:00:00.000Z"));
    render(<SessionExpiryGuard expiresAt="2026-09-21T04:24:35.000Z" />);

    const timer = screen.getByLabelText("Session expires in 24 minutes and 35 seconds.");
    expect(timer.getAttribute("aria-live")).toBe("off");
    expect(timer.textContent).toBe("24:35");
    expect(screen.queryByText(/Session:|remaining|Time left/i)).toBeNull();
    expect(sessionCountdownLabel((24 * 60 + 35) * 1000)).toBe("Session expires in 24 minutes and 35 seconds.");
  });

  it("blocks the application after expiry and offers only sign-in recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T04:00:01.000Z"));
    render(<SessionExpiryGuard expiresAt="2026-09-21T04:00:00.000Z" />);

    expect(screen.getByRole("alertdialog", { name: "Session expired" })).toBeTruthy();
    const signInAgain = screen.getByRole("button", { name: "Sign in again" });
    expect(document.activeElement).toBe(signInAgain);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(signInAgain);
    fireEvent.click(signInAgain);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("shows a subtle policy-off indicator while the cookie policy is off", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T04:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { cookieEnabled: false } }) })));
    try {
      render(<SessionExpiryGuard expiresAt="2026-09-21T04:24:35.000Z" />);
      await vi.waitFor(() => expect(screen.getByLabelText("Cookie policy is disabled. Sessions do not expire.")).toBeTruthy());
      expect(screen.getByText("Policy off")).toBeTruthy();
      expect(screen.queryByRole("alertdialog", { name: "Session expired" })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps counting when the policy flag cannot be read (fail open)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T04:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    try {
      render(<SessionExpiryGuard expiresAt="2026-09-21T04:24:35.000Z" />);
      await vi.waitFor(() => expect(screen.getByLabelText("Session expires in 24 minutes and 35 seconds.")).toBeTruthy());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
