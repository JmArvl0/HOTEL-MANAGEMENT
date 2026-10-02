// @vitest-environment jsdom
// Floating concierge widget: launcher toggles a compact chat card in place,
// Escape closes and refocuses the launcher, closing unmounts (thread resets),
// and a full-page link is offered.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConciergeFloat from "./concierge-float";

vi.mock("./guest-ai-concierge-panel", () => ({
  default: () => (
    <div>
      <p>Ask about check-in times, amenities, Wi-Fi, or nearby places.</p>
      <input aria-label="Ask the concierge" />
    </div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

afterEach(() => cleanup());

describe("ConciergeFloat", () => {
  it("opens the chat card from the launcher with an expanded state", () => {
    render(<ConciergeFloat />);
    const launcher = screen.getByRole("button", { name: "Chat with HAVEN concierge" });
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "HAVEN virtual concierge" })).toBeNull();
    fireEvent.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "HAVEN virtual concierge" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the launcher", async () => {
    render(<ConciergeFloat />);
    const launcher = screen.getByRole("button", { name: "Chat with HAVEN concierge" });
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "HAVEN virtual concierge" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "HAVEN virtual concierge" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chat with HAVEN concierge" }));
  });

  it("resets the thread on reopen with no full-page link", () => {
    render(<ConciergeFloat />);
    fireEvent.click(screen.getByRole("button", { name: "Chat with HAVEN concierge" }));
    expect(screen.queryByRole("link", { name: "Full page" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close chat panel" }));
    expect(screen.queryByRole("dialog", { name: "HAVEN virtual concierge" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chat with HAVEN concierge" }));
    expect(screen.getByRole("dialog", { name: "HAVEN virtual concierge" })).toBeTruthy();
  });
});
