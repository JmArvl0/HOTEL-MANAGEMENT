// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NewReservationMenu } from "./manager-dashboard-client";

describe("NewReservationMenu", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens, closes from its trigger, and runs each existing reservation action", () => {
    const onNew = vi.fn();
    const onWalkIn = vi.fn();
    render(<NewReservationMenu onNew={onNew} onWalkIn={onWalkIn} />);
    const trigger = screen.getByRole("button", { name: /new reservation/i });

    fireEvent.click(trigger);
    let menu = screen.getByRole("menu", { name: "Create a reservation" });
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /front desk or phone booking/i }));
    expect(onNew).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /guest at the desk/i }));
    expect(onWalkIn).toHaveBeenCalledOnce();
  });

  it("supports menu-key navigation, Escape focus return, and outside dismissal", async () => {
    render(<NewReservationMenu onNew={vi.fn()} onWalkIn={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /new reservation/i });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const items = screen.getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
