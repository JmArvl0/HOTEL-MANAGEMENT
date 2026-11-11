// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StaffHeaderClock from "./staff-header-clock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows Manila time and updates the hotel date at midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T15:59:59.000Z"));
  render(<StaffHeaderClock />);

  act(() => vi.advanceTimersByTime(0));
  expect(screen.getByText("Mon, Nov 9, 2026")).toBeTruthy();
  expect(screen.getByText("11:59 PM")).toBeTruthy();

  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.getByText("Tue, Nov 10, 2026")).toBeTruthy();
  expect(screen.getByText("12:00 AM")).toBeTruthy();
  expect(screen.getByRole("time").getAttribute("datetime")).toBe("2026-11-09T16:00:00.000Z");
});
