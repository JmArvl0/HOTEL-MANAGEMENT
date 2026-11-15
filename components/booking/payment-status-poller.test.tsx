// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentStatusPoller } from "./payment-status-poller";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); refresh.mockClear(); });

it("stops repeated rejected status reads with honest guidance and a read-only retry", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockRejectedValue(new TypeError("private connection details"));
  vi.stubGlobal("fetch", fetcher);
  render(<PaymentStatusPoller reservationId="stay-fixture" status="pending" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(216 * 5000); });
  expect(fetcher).toHaveBeenCalledTimes(216);
  expect(screen.getByRole("status").textContent).toContain("before paying again");
  expect(screen.getByRole("status").textContent).not.toMatch(/payment failed|private connection/i);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(fetcher).toHaveBeenCalledTimes(216);
  fireEvent.click(screen.getByRole("button", { name: "Check status again" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetcher).toHaveBeenCalledTimes(217);
  expect(fetcher.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
});
