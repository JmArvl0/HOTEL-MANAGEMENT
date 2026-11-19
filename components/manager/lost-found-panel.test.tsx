// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LostFoundPanel from "./lost-found-panel";
import type { FoundEvent, FoundItem } from "@/lib/operations";

const makeItem = (id: string, overrides: Partial<FoundItem> = {}): FoundItem => ({
  id,
  description: `Item ${id}`,
  found_location: "Lobby",
  found_at: "2026-11-17T02:00:00.000Z",
  storage_location: "Housekeeping locker",
  status: "secured",
  version: 1,
  custodian_id: "u1",
  custodian_name: "Ana Cruz",
  claimant_note: null,
  ...overrides,
});

const makeEvent = (id: string, itemId: string, action: string, createdAt: string, note = "Recorded."): FoundEvent => ({
  id, item_id: itemId, action, note, actor_id: "u1", actor_name: "Ana Cruz", created_at: createdAt,
});

function queueItems() {
  return [
    makeItem("umbrella", { description: "Black umbrella", found_at: "2026-11-17T04:00:00.000Z" }),
    makeItem("phone", {
      description: "Black phone", status: "claim_pending",
      claimant_note: "Verified at the desk.", found_at: "2026-11-17T03:00:00.000Z",
    }),
    ...Array.from({ length: 11 }, (_, index) => makeItem(`towel-${index + 1}`, {
      description: `Towel ${index + 1}`,
      found_at: new Date(Date.UTC(2026, 10, 16, 0, index)).toISOString(),
    })),
  ];
}

function mockFetch(items: () => FoundItem[], events: () => FoundEvent[] = () => []) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ data: null });
    return Response.json({ data: { items: items(), events: events() } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const rowButtons = () => screen.queryAllByRole("button", { name: /^Open (?!claims,)/ });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("LostFoundPanel", () => {
  it("sorts newest first, filters by search and KPI, and paginates", async () => {
    mockFetch(queueItems);
    render(<LostFoundPanel role="manager" />);

    await waitFor(() => expect(rowButtons()).toHaveLength(10));
    expect(rowButtons()[0].getAttribute("aria-label")).toBe("Open Black umbrella");
    expect(rowButtons()[1].getAttribute("aria-label")).toBe("Open Black phone");

    fireEvent.click(screen.getByRole("button", { name: "Next page of items" }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "umbrella" } });
    await waitFor(() => expect(rowButtons()).toHaveLength(1));
    expect(rowButtons()[0].getAttribute("aria-label")).toBe("Open Black umbrella");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "" } });
    await waitFor(() => expect(rowButtons().length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("button", { name: "Open claims, 1" }));
    await waitFor(() => expect(rowButtons()).toHaveLength(1));
    expect(rowButtons()[0].getAttribute("aria-label")).toBe("Open Black phone");
  });

  it("resets to page one when a filter changes", async () => {
    mockFetch(queueItems);
    render(<LostFoundPanel role="manager" />);

    await waitFor(() => expect(rowButtons()).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Next page of items" }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(screen.getByRole("option", { name: "In custody" }));
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy());
  });

  it("shows manager release decisions only for a pending claim", async () => {
    mockFetch(() => [makeItem("phone", { description: "Black phone", status: "claim_pending", claimant_note: "Verified at the desk." })]);
    render(<LostFoundPanel role="manager" />);

    const detail = await screen.findByRole("region", { name: "Item detail" });
    await within(detail).findByRole("button", { name: "Authorize release" });
    expect(within(detail).getByRole("button", { name: "Decline claim" })).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "Take custody" })).toBeTruthy();
    expect(within(detail).getByText("Verified at the desk.")).toBeTruthy();
    expect(within(detail).queryByRole("button", { name: "Release item" })).toBeNull();
  });

  it("lets front desk record a claim and release only when authorized", async () => {
    mockFetch(() => [makeItem("phone", { description: "Black phone", status: "secured" })]);
    const { unmount } = render(<LostFoundPanel role="front_desk" />);
    const securedDetail = await screen.findByRole("region", { name: "Item detail" });
    expect(await within(securedDetail).findByRole("button", { name: "Record claim" })).toBeTruthy();
    expect(within(securedDetail).queryByRole("button", { name: "Release item" })).toBeNull();
    unmount();

    cleanup();
    mockFetch(() => [makeItem("phone", { description: "Black phone", status: "release_authorized" })]);
    render(<LostFoundPanel role="front_desk" />);
    const readyDetail = await screen.findByRole("region", { name: "Item detail" });
    expect(await within(readyDetail).findByRole("button", { name: "Release item" })).toBeTruthy();
    expect(within(readyDetail).queryByRole("button", { name: "Authorize release" })).toBeNull();
  });

  it("lets housekeeping secure a found item without seeing claim notes", async () => {
    mockFetch(() => [makeItem("umbrella", {
      description: "Black umbrella", status: "found", storage_location: null, claimant_note: "Should stay hidden.",
    })]);
    render(<LostFoundPanel role="housekeeping" />);

    const detail = await screen.findByRole("region", { name: "Item detail" });
    expect(await within(detail).findByRole("button", { name: "Secure item" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record found item" })).toBeTruthy();
    expect(within(detail).queryByText("Should stay hidden.")).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Record claim" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "Should stay hidden" } });
    await waitFor(() => expect(rowButtons()).toHaveLength(0));
  });

  it("only submits a release after explicit identity confirmation", async () => {
    const fetchMock = mockFetch(() => [makeItem("phone", { status: "release_authorized", version: 4 })]);
    render(<LostFoundPanel role="front_desk" />);

    fireEvent.click(await screen.findByRole("button", { name: "Release item" }));
    const dialog = within(screen.getByRole("dialog", { name: "Release to verified claimant" }));
    fireEvent.change(dialog.getByRole("textbox", { name: /Required note/ }), { target: { value: "Claimant verified at the desk." } });
    const submit = dialog.getByRole("button", { name: "Confirm release" });
    fireEvent.submit(submit.closest("form")!);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(dialog.getByText("Confirm before continuing.")).toBeTruthy();

    fireEvent.click(dialog.getByRole("checkbox", { name: /I verified the claimant/ }));
    fireEvent.click(submit);
    await waitFor(() => {
      const write = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(write?.[1]?.body))).toEqual({
        action: "release", id: "phone", version: 4, note: "Claimant verified at the desk.", identityVerified: true,
      });
    });
  });

  it("keeps selection across reload and falls back to the first visible item", async () => {
    let items = [
      makeItem("first", { description: "First item", found_at: "2026-11-17T04:00:00.000Z" }),
      makeItem("second", { description: "Second item", found_at: "2026-11-17T03:00:00.000Z" }),
    ];
    mockFetch(() => items);
    render(<LostFoundPanel role="manager" />);

    await waitFor(() => expect(rowButtons()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Open Second item" }));
    const detail = screen.getByRole("region", { name: "Item detail" });
    expect(within(detail).getByRole("heading", { name: "Second item" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh items" }));
    await waitFor(() => expect(within(detail).getByRole("heading", { name: "Second item" })).toBeTruthy());

    items = [items[0]];
    fireEvent.click(screen.getByRole("button", { name: "Refresh items" }));
    await waitFor(() => expect(within(detail).getByRole("heading", { name: "First item" })).toBeTruthy());
  });

  it("renders the custody timeline in Manila time", async () => {
    mockFetch(
      () => [makeItem("umbrella", { description: "Black umbrella" })],
      () => [makeEvent("e1", "umbrella", "secure", "2026-11-17T02:00:00.000Z", "Locker B2.")],
    );
    render(<LostFoundPanel role="manager" />);

    const timeline = await screen.findByRole("list", { name: "Chain of custody" });
    expect(within(timeline).getByText("Item secured")).toBeTruthy();
    expect(within(timeline).getByText("Locker B2.")).toBeTruthy();
    expect(within(timeline).getByText(/Nov 17, 2026/)).toBeTruthy();
  });
});
