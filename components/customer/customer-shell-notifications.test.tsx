// @vitest-environment jsdom
// Guest bell wiring: click-to-open dropdown (hover never opens it), unread-first
// preview groups, preview cap, mark-one/mark-all read, aggregate badge (99+),
// View-all opens the history modal without navigating, Escape/focus behavior.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { CustomerShell } from "./customer-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
}));

type SeedItem = { id: string; title: string; detail: string; createdAt: string; href: string; readAt: string | null; type?: string };
const unreadA: SeedItem = { id: "n1", title: "Deposit verified", detail: "Booking confirmed.", createdAt: new Date(Date.now() - 3_600_000).toISOString(), href: "/my-reservations", readAt: null, type: "deposit_verified" };
const unreadB: SeedItem = { id: "n2", title: "Request reviewed", detail: "Batch approved.", createdAt: new Date(Date.now() - 7_200_000).toISOString(), href: "/account/requests", readAt: null, type: "request_batch_reviewed" };
const readA: SeedItem = { id: "n3", title: "Reservation confirmed", detail: "Garden Twin.", createdAt: new Date(Date.now() - 86_400_000).toISOString(), href: "/my-reservations", readAt: new Date().toISOString(), type: "reservation_confirmed" };
const seed: SeedItem[] = [unreadA, unreadB, readA];
const capSeed = Array.from({ length: 9 }, (_, index) => ({
  id: `c${index}`,
  title: `Notification ${index}`,
  detail: "Cap test.",
  createdAt: new Date(Date.now() - index * 3_600_000).toISOString(),
  href: "/my-reservations",
  readAt: index < 2 ? null : new Date().toISOString(),
}));

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

function renderShell(items: typeof seed = seed, fetchResult: unknown = { data: items }) {
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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => fetchResult }));
  return render(
    <CustomerShell user={{ name: "Guest", email: "guest@example.test" }} notifications={items}>
      <div>Stay content</div>
    </CustomerShell>
  );
}

function openBell() {
  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
}

describe("CustomerShell notification bell", () => {
  it("shows one aggregate unread badge on the bell", () => {
    const { container } = renderShell();
    const badge = container.querySelector(".customer-bell-badge");
    expect(badge?.textContent).toBe("2");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("hides the badge at zero unread", () => {
    const { container } = renderShell(seed.map((item) => ({ ...item, readAt: new Date().toISOString() })));
    expect(container.querySelector(".customer-bell-badge")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("caps the badge at 99+ past one hundred unread", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => ({
      id: `h${index}`,
      title: `Item ${index}`,
      detail: "",
      createdAt: new Date().toISOString(),
      href: "",
      readAt: null,
    }));
    const { container } = renderShell(hundred);
    const badge = container.querySelector(".customer-bell-badge");
    expect(badge?.textContent).toBe("99+");
  });

  it("does not open the dropdown on hover (tooltip only)", () => {
    renderShell();
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    fireEvent.mouseEnter(bell.closest(".customer-notifications") as Element);
    expect(screen.queryByText("View all notifications")).toBeNull();
    expect(bell.getAttribute("title")).toBe("Notifications");
  });

  it("opens on click with unread first, then Earlier, capped at 7", () => {
    renderShell(capSeed);
    openBell();
    const popover = document.querySelector(".haven-notification-popover") as HTMLElement;
    expect(popover).toBeTruthy();
    // Preview cap: 2 unread + 5 read, never the whole history.
    expect(popover.querySelectorAll(".cnr").length).toBe(7);
    const unreadGroup = popover.querySelector('section[aria-label="Unread notifications"]') as HTMLElement;
    const earlierGroup = popover.querySelector('section[aria-label="Earlier notifications"]') as HTMLElement;
    expect(unreadGroup).toBeTruthy();
    expect(earlierGroup).toBeTruthy();
    // Unread group precedes the Earlier group.
    expect(unreadGroup.compareDocumentPosition(earlierGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Newest unread first inside the group.
    const unreadTitles = within(unreadGroup).getAllByText(/Notification 0|Notification 1/).map((el) => el.textContent);
    expect(unreadTitles).toEqual(["Notification 0", "Notification 1"]);
    // Unread rows carry the accessible dot; read rows do not.
    expect(unreadGroup.querySelectorAll(".cnr.is-unread").length).toBe(2);
    expect(earlierGroup.querySelectorAll(".cnr.is-unread").length).toBe(0);
  });

  it("marks one notification read on click and updates the badge", async () => {
    const fetchMock = vi.fn();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/api/account/notifications/read") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: seed }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CustomerShell user={{ name: "Guest", email: "guest@example.test" }} notifications={seed}>
        <div>Stay content</div>
      </CustomerShell>
    );
    openBell();
    const unreadGroup = document.querySelector('section[aria-label="Unread notifications"]') as HTMLElement;
    fireEvent.click(within(unreadGroup).getAllByRole("link")[0]);
    await waitFor(() => {
      const badge = document.querySelector(".customer-bell-badge");
      expect(badge?.textContent).toBe("1");
    });
    const readCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/account/notifications/read"));
    expect(readCall).toBeTruthy();
    expect(JSON.parse(String(readCall?.[1]?.body)).ids).toEqual(["n1"]);
  });

  it("marks all authorized unread notifications as read from the dropdown header", async () => {
    const fetchMock = vi.fn();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/api/account/notifications/read") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: seed }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CustomerShell user={{ name: "Guest", email: "guest@example.test" }} notifications={seed}>
        <div>Stay content</div>
      </CustomerShell>
    );
    openBell();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(document.querySelector(".customer-bell-badge")).toBeNull());
    const readCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/account/notifications/read"));
    expect(JSON.parse(String(readCall?.[1]?.body))).toEqual({ all: true });
  });

  it("opens the history modal from View-all without navigating away", async () => {
    renderShell();
    openBell();
    // The dropdown still opens first with its recent items.
    expect(screen.getByText("Deposit verified")).toBeTruthy();
    // View-all is a button (modal trigger), never a navigation link.
    expect(screen.queryByRole("link", { name: "View all notifications" })).toBeNull();
    const viewAll = screen.getByRole("button", { name: "View all notifications" });
    fireEvent.click(viewAll);
    // The modal opens over the same page; the underlying module stays put.
    const dialog = await screen.findByRole("dialog", { name: "All notifications" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Stay content")).toBeTruthy();
    // The dropdown closed behind the modal.
    expect(screen.queryByRole("button", { name: "View all notifications" })).toBeNull();
  });

  it("shows the empty state when there are no notifications", async () => {
    renderShell([], { data: [] });
    openBell();
    // Skeleton first, then the empty state once the fetch resolves.
    expect(document.querySelector(".customer-notif-skeleton")).toBeTruthy();
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText("No new notifications right now.")).toBeTruthy();
  });

  it("shows the error state with retry when the history fetch fails", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(
      <CustomerShell user={{ name: "Guest", email: "guest@example.test" }} notifications={[]}>
        <div>Stay content</div>
      </CustomerShell>
    );
    openBell();
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText(/couldn't load your notifications/)).toBeTruthy();
    expect(retry).toBeTruthy();
  });

  it("closes the modal with Escape and returns focus to the bell", async () => {
    renderShell();
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    openBell();
    fireEvent.click(screen.getByRole("button", { name: "View all notifications" }));
    await screen.findByRole("dialog", { name: "All notifications" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "All notifications" })).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
