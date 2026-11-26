// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AiDrawerEntry from "./ai-drawer-entry";
import HavenAiDrawer from "./haven-ai-drawer";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the right-edge drawer in a normal staff module and only reads on open", async () => {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (!url.startsWith("/api/ai/placement?") || options?.method === "POST") throw new Error("Unexpected request");
    return Response.json({ data: {
    module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.",
    facts: [], state: "absent", recommendation: null,
    } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<><main data-testid="module">Existing booking table</main><HavenAiDrawer role="front_desk" module="Bookings" /></>);
  const toggle = await screen.findByRole("button", { name: "Open HAVEN AI" });
  expect(screen.getByTestId("module")).toHaveTextContent("Existing booking table");
  fireEvent.click(toggle);
  expect(screen.getByRole("dialog", { name: "HAVEN AI" })).toHaveTextContent("Booking process guide");
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0][0]).toContain("/api/ai/placement?module=Bookings");
  expect(fetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
});

it("keeps manual Gemini Ask behind a deliberate click", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST"
    ? Response.json({ data: { answer: "Review the reservation and room readiness in HAVEN.", facts: [], model: "gemini-test" } })
    : Response.json({ data: { module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.", facts: [], state: "absent", recommendation: null } }));
  vi.stubGlobal("fetch", fetch);
  render(<HavenAiDrawer role="front_desk" module="Bookings" />);
  fireEvent.click(await screen.findByRole("button", { name: "Open HAVEN AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask HAVEN AI" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Question about this module" }), { target: { value: "How should I prepare this arrival?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Review the reservation"));
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("uses the staff shell as its layout column and reports controlled open changes", async () => {
  const fetch = vi.fn(async () => Response.json({ data: {
    module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.",
    facts: [], state: "absent", recommendation: null,
  } }));
  vi.stubGlobal("fetch", fetch);
  const onOpenChange = vi.fn();
  const shell = (open: boolean) => <div className="app-shell">
    <aside className="sidebar">Navigation</aside>
    <main className="workspace">Existing booking table</main>
    <HavenAiDrawer role="front_desk" module="Bookings" open={open} onOpenChange={onOpenChange} />
  </div>;
  const { rerender, container } = render(shell(false));
  fireEvent.click(await screen.findByRole("button", { name: "Open HAVEN AI" }));
  expect(onOpenChange).toHaveBeenCalledWith(true);
  rerender(shell(true));
  const panel = screen.getByRole("dialog", { name: "HAVEN AI" });
  expect(container.querySelector(".app-shell > .haven-ai-placement-preview")).toContainElement(panel);
  fireEvent.click(within(panel).getByRole("button", { name: "Close HAVEN AI" }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it("does not nest a drawer in the dedicated Manager HAVEN AI page", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<HavenAiDrawer role="manager" module="HAVEN AI" />);
  expect(screen.queryByRole("button", { name: "Open HAVEN AI" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("clears an open drawer when Manager enters the dedicated HAVEN AI page", async () => {
  const onOpenChange = vi.fn();
  render(<AiDrawerEntry role="manager" module="HAVEN AI" open onOpenChange={onOpenChange} />);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(screen.queryByRole("dialog", { name: "HAVEN AI" })).not.toBeInTheDocument();
});

it("drags the AI toggle only vertically between the header and visible footer without opening it", async () => {
  vi.stubGlobal("innerHeight", 800);
  const fetch = vi.fn(async () => Response.json({ data: { module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.", facts: [], state: "absent", recommendation: null } }));
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<div className="app-shell"><main className="workspace"><header className="app-header">Header</header><footer className="app-footer">Footer</footer></main><HavenAiDrawer role="front_desk" module="Bookings" /></div>);
  const header = container.querySelector<HTMLElement>(".app-header")!;
  const footer = container.querySelector<HTMLElement>(".app-footer")!;
  const toggle = await screen.findByRole("button", { name: "Open HAVEN AI" });
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 70 } as DOMRect);
  vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({ top: 650, bottom: 800 } as DOMRect);
  vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue({ top: 170, height: 58 } as DOMRect);

  fireEvent.pointerDown(toggle, { pointerId: 1, button: 0, clientY: 200 });
  fireEvent.pointerMove(toggle, { pointerId: 1, clientY: -200 });
  expect(container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top")).toBe("82px");
  fireEvent.pointerMove(toggle, { pointerId: 1, clientY: 900 });
  expect(container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top")).toBe("580px");
  fireEvent.pointerUp(toggle, { pointerId: 1, clientY: 900 });
  fireEvent.click(toggle);
  expect(screen.queryByRole("dialog", { name: "HAVEN AI" })).not.toBeInTheDocument();
  expect(window.localStorage.getItem("haven-ai-toggle-top")).toBe("580");
  fireEvent.click(toggle);
  expect(screen.getByRole("dialog", { name: "HAVEN AI" })).toBeInTheDocument();

  vi.stubGlobal("innerHeight", 400);
  fireEvent.resize(window);
  expect(container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top")).toBe("330px");
  fireEvent.keyDown(toggle, { key: "Home" });
  expect(container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top")).toBe("82px");
  fireEvent.keyDown(toggle, { key: "End" });
  expect(window.localStorage.getItem("haven-ai-toggle-top")).toBe("330");
});

it("keeps a horizontal swipe from moving or activating the AI toggle", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.", facts: [], state: "absent", recommendation: null } })));
  const { container } = render(<HavenAiDrawer role="front_desk" module="Bookings" />);
  const toggle = await screen.findByRole("button", { name: "Open HAVEN AI" });
  vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue({ top: 170, height: 58 } as DOMRect);
  const before = container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top");
  fireEvent.pointerDown(toggle, { pointerId: 1, button: 0, clientX: 100, clientY: 200 });
  fireEvent.pointerMove(toggle, { pointerId: 1, clientX: 300, clientY: 200 });
  fireEvent.pointerUp(toggle, { pointerId: 1, clientX: 300, clientY: 200 });
  fireEvent.click(toggle);
  expect(container.querySelector<HTMLElement>(".haven-ai-placement-preview")?.style.getPropertyValue("--haven-ai-toggle-top")).toBe(before);
  expect(screen.queryByRole("dialog", { name: "HAVEN AI" })).not.toBeInTheDocument();
});

it("restores the saved toggle position and clamps it after the viewport shrinks", async () => {
  window.localStorage.setItem("haven-ai-toggle-top", "300");
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.", facts: [], state: "absent", recommendation: null } })));
  const { container } = render(<HavenAiDrawer role="front_desk" module="Bookings" />);
  const root = container.querySelector<HTMLElement>(".haven-ai-placement-preview")!;
  await waitFor(() => expect(root.style.getPropertyValue("--haven-ai-toggle-top")).toBe("300px"));
  vi.stubGlobal("innerHeight", 200);
  fireEvent.resize(window);
  expect(root.style.getPropertyValue("--haven-ai-toggle-top")).toBe("130px");
  vi.stubGlobal("innerHeight", 800);
  fireEvent.resize(window);
  expect(root.style.getPropertyValue("--haven-ai-toggle-top")).toBe("300px");
});
