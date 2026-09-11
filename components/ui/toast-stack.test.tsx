// @vitest-environment jsdom
// Behavior tests for the transient toast stack: auto-dismiss timing, the
// hover/focus pause that keeps a toast being read from vanishing, manual
// dismiss removing only the popup (never the underlying work state), action
// navigation, the max-3 stack, and the polite live region. Uses fake timers
// (wrapped in act — the dismiss callbacks set state outside fireEvent).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastStack, useToasts } from "./toast-stack";

type PushOptions = Parameters<ReturnType<typeof useToasts>["push"]>[0];

function Harness(props: { options: PushOptions[] }) {
  const controller = useToasts();
  return <>
    <button onClick={() => props.options.forEach(controller.push)}>push</button>
    <ToastStack controller={controller} />
  </>;
}

async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }

describe("toast stack", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it("auto-dismisses an informational toast after 6 seconds", async () => {
    render(<Harness options={[{ id: "t1", title: "New guest request" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(screen.getByText("New guest request")).toBeTruthy();
    await advance(5999);
    expect(screen.getByText("New guest request")).toBeTruthy();
    await advance(1);
    expect(screen.queryByText("New guest request")).toBeNull();
  });

  it("keeps a warning toast longer (8 seconds)", async () => {
    render(<Harness options={[{ id: "t1", title: "Approval waiting", tone: "warning" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    await advance(6100);
    expect(screen.getByText("Approval waiting")).toBeTruthy();
    await advance(1900);
    expect(screen.queryByText("Approval waiting")).toBeNull();
  });

  it("pauses the auto-dismiss timer on hover and resumes on leave", async () => {
    render(<Harness options={[{ id: "t1", title: "Read me slowly" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    const card = screen.getByRole("status");
    await advance(3000);
    fireEvent.mouseEnter(card);
    await advance(10000); // paused: the toast survives far past 6s
    expect(screen.getByText("Read me slowly")).toBeTruthy();
    fireEvent.mouseLeave(card);
    await advance(2999); // resumed with its remaining ~3s
    expect(screen.getByText("Read me slowly")).toBeTruthy();
    await advance(1);
    expect(screen.queryByText("Read me slowly")).toBeNull();
  });

  it("pauses the timer on focus too (keyboard users)", async () => {
    render(<Harness options={[{ id: "t1", title: "Focused toast" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    const card = screen.getByRole("status");
    fireEvent.focus(card.querySelector(".toast-dismiss")!);
    await advance(20000);
    expect(screen.getByText("Focused toast")).toBeTruthy();
  });

  it("dismiss button removes only that toast", () => {
    render(<Harness options={[{ id: "t1", title: "First" }, { id: "t2", title: "Second" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: First" }));
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("runs the action and then dismisses the toast", () => {
    const onAction = vi.fn();
    render(<Harness options={[{ id: "t1", title: "New approval", actionLabel: "View request", onAction }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "View request" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("New approval")).toBeNull();
  });

  it("shows at most 3 toasts and queues the overflow", async () => {
    render(<Harness options={[1, 2, 3, 4, 5].map((n) => ({ id: `t${n}`, title: `Toast ${n}` }))} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    for (let n = 1; n <= 3; n++) expect(screen.getByText(`Toast ${n}`)).toBeTruthy();
    expect(screen.queryByText("Toast 4")).toBeNull();
    // Dismissing one promotes the oldest queued toast (synchronous setState
    // inside fireEvent's act — no waitFor needed, which fake timers break).
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Toast 1" }));
    expect(screen.getByText("Toast 4")).toBeTruthy();
    expect(screen.queryByText("Toast 5")).toBeNull();
  });

  it("does not push a duplicate toast id", () => {
    render(<Harness options={[{ id: "alert-1", title: "Same event" }]} />);
    const push = screen.getByRole("button", { name: "push" });
    fireEvent.click(push);
    fireEvent.click(push);
    expect(screen.getAllByText("Same event")).toHaveLength(1);
  });

  it("announces politely without stealing focus", () => {
    render(<Harness options={[{ id: "t1", title: "Quiet notice" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    const region = screen.getByLabelText("Notifications");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("keeps a duration-0 toast until manually dismissed", async () => {
    render(<Harness options={[{ id: "t1", title: "Needs attention", duration: 0 }]} />);
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    await advance(60000);
    expect(screen.getByText("Needs attention")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Needs attention" }));
    expect(screen.queryByText("Needs attention")).toBeNull();
  });
});
