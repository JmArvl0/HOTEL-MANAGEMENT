// @vitest-environment jsdom
// Guest concierge thread: footer stays pinned outside the scroll region,
// new turns stamp a client-local time, and the thread scrolls to the newest
// message. API payloads are untouched (timestamps never leave the client).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GuestAiConciergePanel from "./guest-ai-concierge-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockReply(replyText: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { replyText } }) })
  );
}

describe("GuestAiConciergePanel thread", () => {
  it("keeps chips and the form outside the scrolling thread", () => {
    render(<GuestAiConciergePanel />);
    const thread = document.querySelector(".concierge-thread")!;
    const foot = document.querySelector(".concierge-foot")!;
    expect(thread).toBeTruthy();
    expect(foot).toBeTruthy();
    expect(foot.querySelector(".concierge-form")).toBeTruthy();
    expect(foot.querySelector(".concierge-chips")).toBeTruthy();
    expect(thread.querySelector(".concierge-form")).toBeNull();
  });

  it("stamps each turn with a client-local time and scrolls to newest", async () => {
    mockReply("Checkout is at noon.");
    render(<GuestAiConciergePanel />);
    fireEvent.change(screen.getByLabelText("Ask the concierge"), { target: { value: "What time is check-out?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const thread = document.querySelector(".concierge-thread") as HTMLElement;
    await waitFor(() => expect(document.querySelectorAll(".concierge-msg").length).toBe(2));
    const times = document.querySelectorAll(".concierge-msg time");
    expect(times.length).toBe(2);
    expect(times[0].textContent).toMatch(/\d/);
    expect(thread.scrollTop).toBe(thread.scrollHeight);
    const bodies = Array.from(document.querySelectorAll(".concierge-msg")).map((el) => (el as HTMLElement).innerText ?? el.textContent);
    expect(JSON.stringify(bodies)).toContain("Checkout is at noon.");
    // No timestamp ever enters the request payload.
    const body = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(JSON.stringify(body)).not.toContain(" at");
    expect(body.history[0]).toEqual({ role: "user", text: "What time is check-out?" });
  });

  it("marks assistant turns with an avatar", async () => {
    mockReply("Hello there.");
    render(<GuestAiConciergePanel />);
    fireEvent.change(screen.getByLabelText("Ask the concierge"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(document.querySelectorAll(".concierge-msg").length).toBe(2));
    expect(document.querySelector(".concierge-assistant .concierge-avatar")).toBeTruthy();
    expect(document.querySelector(".concierge-user .concierge-avatar")).toBeNull();
  });
});
