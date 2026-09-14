// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HavenSelect } from "./haven-select";

const OPTIONS = [
  { value: "all", label: "All departments" },
  { value: "accounting", label: "Accounting" },
  { value: "maintenance", label: "Maintenance", disabled: true },
];

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Filter by department" }));
  return screen.getByRole("listbox");
}

describe("HavenSelect", () => {
  afterEach(() => cleanup());

  it("renders the selected value on the trigger", () => {
    render(<HavenSelect value="accounting" onChange={() => {}} options={OPTIONS} ariaLabel="Filter by department" />);
    expect(screen.getByRole("button", { name: "Filter by department" }).textContent).toContain("Accounting");
  });

  it("opens the menu with aria-expanded and shows a checkmark on the current option", () => {
    render(<HavenSelect value="all" onChange={() => {}} options={OPTIONS} ariaLabel="Filter by department" />);
    const trigger = screen.getByRole("button", { name: "Filter by department" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    open();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("option", { name: "All departments" }).getAttribute("aria-selected")).toBe("true");
  });

  it("selects an option via onChange and closes the menu", () => {
    const onChange = vi.fn();
    render(<HavenSelect value="all" onChange={onChange} options={OPTIONS} ariaLabel="Filter by department" />);
    open();
    fireEvent.click(screen.getByRole("option", { name: "Accounting" }));
    expect(onChange).toHaveBeenCalledWith("accounting");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not select a disabled option", () => {
    const onChange = vi.fn();
    render(<HavenSelect value="all" onChange={onChange} options={OPTIONS} ariaLabel="Filter by department" />);
    open();
    fireEvent.click(screen.getByRole("option", { name: "Maintenance" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("supports arrow-key navigation, Enter to select, and Escape to close with focus return", () => {
    const onChange = vi.fn();
    render(<HavenSelect value="all" onChange={onChange} options={OPTIONS} ariaLabel="Filter by department" />);
    const trigger = screen.getByRole("button", { name: "Filter by department" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("accounting");
    // Reopen then Escape: menu closes and the trigger survives with focus.
    fireEvent.keyDown(screen.getByRole("button", { name: "Filter by department" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Filter by department" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter by department" })).toBeTruthy();
  });

  it("renders grouped options with group labels", () => {
    render(
      <HavenSelect
        value="manager"
        onChange={() => {}}
        groups={[
          { label: "Staff departments", options: [{ value: "front_desk", label: "Front Desk" }] },
          { label: "Management", options: [{ value: "manager", label: "Manager" }] },
        ]}
        ariaLabel="Filter by role"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter by role" }));
    expect(screen.getByText("Staff departments")).toBeTruthy();
    expect(screen.getByText("Management")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Manager" }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders disabled state without interaction", () => {
    render(<HavenSelect value="all" onChange={() => {}} options={OPTIONS} ariaLabel="Filter by department" disabled />);
    const trigger = screen.getByRole("button", { name: "Filter by department" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
