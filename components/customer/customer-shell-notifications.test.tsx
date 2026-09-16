// @vitest-environment jsdom
// Guest bell wiring: dropdown stays, View-all opens the history modal without
// navigating, Escape closes, and focus returns to the bell.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { CustomerShell } from "./customer-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
}));

const seed = [
  { id: "n1", title: "Deposit verified", detail: "Booking confirmed.", createdAt: new Date().toISOString(), href: "/my-reservations", readAt: null },
  { id: "n2", title: "Request reviewed", detail: "Batch approved.", createdAt: new Date().toISOString(), href: "/account/requests", readAt: null },
];

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
});

afterEach(async () => {
  // Flush the shell's requestAnimationFrame boot read while the jsdom globals
  // (and the localStorage stub below) are still alive.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  cleanup();
  vi.unstubAllGlobals();
});

function renderShell() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ data: seed }) }));
  return render(
    <CustomerShell user={{ name: "Guest", email: "guest@example.test" }} notifications={seed}>
      <div>Stay content</div>
    </CustomerShell>
  );
}

describe("CustomerShell notification bell", () => {
  it("shows one aggregate unread badge on the bell", () => {
    const { container } = renderShell();
    const badge = container.querySelector(".customer-bell-badge");
    expect(badge?.textContent).toBe("2");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("opens the history modal from View-all without navigating away", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    // The dropdown still opens first with its recent items.
    expect(screen.getByText("Deposit verified")).toBeTruthy();
    // View-all is a button (modal trigger), never a navigation link.
    expect(screen.queryByRole("link", { name: "View all notifications" })).toBeNull();
    const viewAll = screen.getByRole("button", { name: "View all notifications" });
    fireEvent.click(viewAll);
    // The modal opens over the same page; the underlying module stays put.
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Stay content")).toBeTruthy();
    // The dropdown closed behind the modal.
    expect(screen.queryByRole("button", { name: "View all notifications" })).toBeNull();
  });

  it("closes the modal with Escape and returns focus to the bell", async () => {
    renderShell();
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    fireEvent.click(bell);
    fireEvent.click(screen.getByRole("button", { name: "View all notifications" }));
    await screen.findByRole("dialog", { name: "Notifications" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
