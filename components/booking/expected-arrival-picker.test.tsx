// @vitest-environment jsdom
// Interaction tests for the ExpectedArrivalPicker: desktop clock popover (fine pointer)
// and the coarse-pointer wheel sheet. matchMedia is stubbed; scroll-snap/momentum is
// not observable in jsdom, so the tap + keyboard paths stand in for the swipe contract.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExpectedArrivalPicker } from "./expected-arrival-picker";

let coarsePointer = false;
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      get matches() { return query.includes("pointer: coarse") ? coarsePointer : false; },
      media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => { coarsePointer = false; });
afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("");
  return <div><ExpectedArrivalPicker value={value} onChange={setValue}/><output data-testid="committed">{value}</output></div>;
}
const committed = () => screen.getByTestId("committed").textContent;
const trigger = () => screen.getByRole("button", { name: "Expected arrival time" });
const clock = () => screen.getByRole("group", { name: /clock face/i });

describe("ExpectedArrivalPicker — desktop clock", () => {
  it("shows a placeholder trigger until a value is applied", () => {
    render(<Harness/>);
    expect(trigger().textContent).toContain("Select arrival time");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on hour mode at the policy check-in default, without committing it", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const popover = screen.getByRole("dialog", { name: "Select arrival time" });
    expect(within(popover).getByRole("button", { name: "Hour 3 selected" })).toBeTruthy();
    expect(within(popover).getByRole("button", { name: /PM/ }).getAttribute("aria-pressed")).toBe("true");
    expect(committed()).toBe("");
  });

  it("clicks an hour, auto-advances to minutes, arrows to an exact minute, and applies", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    fireEvent.click(within(clock()).getByRole("button", { name: "1" }));
    expect(screen.getByRole("group", { name: /minute selection/i })).toBeTruthy();
    for (let index = 0; index < 17; index++) fireEvent.keyDown(clock(), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Minute 17 selected" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(committed()).toBe("13:17");
    expect(trigger().textContent).toContain("1:17 PM");
  });

  it("reopens initialized from the committed value", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    fireEvent.click(within(clock()).getByRole("button", { name: "1" }));
    for (let index = 0; index < 17; index++) fireEvent.keyDown(clock(), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(trigger());
    expect(screen.getByRole("button", { name: "Hour 1 selected" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minute 17 selected" })).toBeTruthy();
  });

  it("rolls the minute over into the next hour in both directions", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    // 3:00 PM → hour 1 → 1:00 PM → back one minute = 12:59 PM
    fireEvent.click(within(clock()).getByRole("button", { name: "1" }));
    fireEvent.keyDown(clock(), { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Hour 12 selected" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minute 59 selected" })).toBeTruthy();
    // forward again crosses back to 1:00 PM
    fireEvent.keyDown(clock(), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Hour 1 selected" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minute 0 selected" })).toBeTruthy();
  });

  it("Enter applies from minute mode", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    fireEvent.click(within(clock()).getByRole("button", { name: "7" }));
    fireEvent.keyDown(clock(), { key: "Enter" });
    expect(committed()).toBe("19:00");
  });

  it("Cancel and Escape discard the draft without touching the form", () => {
    render(<Harness/>);
    fireEvent.click(trigger());
    fireEvent.click(within(clock()).getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(committed()).toBe("");
    fireEvent.click(trigger());
    fireEvent.click(within(clock()).getByRole("button", { name: "7" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(committed()).toBe("");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ExpectedArrivalPicker — touch wheel", () => {
  it("renders snap columns with every minute 00–59 and commits an exact tapped minute", () => {
    coarsePointer = true;
    render(<Harness/>);
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    const minuteList = within(dialog).getByRole("listbox", { name: "Minute" });
    const options = within(minuteList).getAllByRole("option");
    expect(options).toHaveLength(60);
    expect(options[43].textContent).toBe("43");
    fireEvent.click(options[43]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(committed()).toBe("15:43"); // default 3:00 PM + minute 43
    expect(trigger().textContent).toContain("3:43 PM");
  });

  it("moves the hour and period by keyboard from the wheel listboxes", () => {
    coarsePointer = true;
    render(<Harness/>);
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("listbox", { name: "Hour" }), { key: "ArrowDown" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(committed()).toBe("16:00"); // 3:00 PM → 4:00 PM
  });
});
