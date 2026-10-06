// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type CommandItem } from "./command-palette";

afterEach(cleanup);

const mockItems: CommandItem[] = [
  { id: "overview", label: "Overview", category: "Navigation", hint: "Dashboard summary", onSelect: vi.fn() },
  { id: "reservations", label: "Reservations", category: "Navigation", hint: "All bookings", onSelect: vi.fn() },
  { id: "theme", label: "Switch Theme", category: "Actions", hint: "Toggle light/dark", onSelect: vi.fn() },
];

describe("CommandPalette", () => {
  it("renders when open and displays items", () => {
    render(<CommandPalette isOpen={true} onClose={() => {}} items={mockItems} />);
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeTruthy();
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Reservations")).toBeTruthy();
    expect(screen.getByText("Switch Theme")).toBeTruthy();
  });

  it("filters items by typing query", () => {
    render(<CommandPalette isOpen={true} onClose={() => {}} items={mockItems} />);
    const input = screen.getByPlaceholderText(/Type a command/i);
    fireEvent.change(input, { target: { value: "theme" } });
    expect(screen.getByText("Switch Theme")).toBeTruthy();
    expect(screen.queryByText("Overview")).toBeNull();
  });

  it("triggers item on click", () => {
    const onSelect = vi.fn();
    const items: CommandItem[] = [{ id: "test", label: "Test Action", category: "Actions", onSelect }];
    render(<CommandPalette isOpen={true} onClose={() => {}} items={items} />);
    fireEvent.click(screen.getByText("Test Action"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes when ESC is pressed", () => {
    const onClose = vi.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} items={mockItems} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
