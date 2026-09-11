// @vitest-environment jsdom
// The shared room-type badge: one component, one color identity per type.
// RoomSelectDialog (check-in Select Room) renders it from the color key the
// eligible-rooms endpoint stamps on each room.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomTypeBadge } from "./RoomTypeBadge";
import { RoomSelectDialog } from "./FormDialog";

afterEach(cleanup);

// jsdom ships no matchMedia; Modal reads prefers-reduced-motion on every render.
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("RoomTypeBadge", () => {
  it("renders the type name with its variant class", () => {
    render(<RoomTypeBadge name="Garden Twin" colorKey="sage" />);
    const badge = screen.getByText("Garden Twin");
    expect(badge.className).toBe("room-type rt-sage");
  });

  it("falls back to the neutral badge without a color key", () => {
    render(<RoomTypeBadge name="Legacy Type" colorKey={null} />);
    expect(screen.getByText("Legacy Type").className).toBe("room-type");
  });

  it("never colors an unknown key — neutral, not a broken class", () => {
    render(<RoomTypeBadge name="Odd Type" colorKey="neon-pink" />);
    expect(screen.getByText("Odd Type").className).toBe("room-type");
  });
});

describe("RoomSelectDialog room-type badge", () => {
  const rooms = [
    { number: "101", type: "Garden Twin", colorKey: "sage" },
    { number: "205", type: "Deluxe King", colorKey: "gold" },
    { number: "301", type: "Legacy Suite" },
  ];
  const onClose = vi.fn();
  const onSelect = vi.fn();

  it("renders each room's type as its own colored badge", () => {
    render(<RoomSelectDialog isOpen onClose={onClose} onSelect={onSelect} title="Select Room" message="Choose a room" rooms={rooms} />);
    expect(screen.getByText("Garden Twin").className).toBe("room-type rt-sage");
    expect(screen.getByText("Deluxe King").className).toBe("room-type rt-gold");
    expect(screen.getByText("Legacy Suite").className).toBe("room-type");
    cleanup();
  });

  it("selecting a room passes its number through", () => {
    render(<RoomSelectDialog isOpen onClose={onClose} onSelect={onSelect} title="Select Room" message="Choose a room" rooms={rooms} />);
    fireEvent.click(screen.getByRole("radio", { name: /205/i }));
    fireEvent.click(screen.getByRole("button", { name: "Select Room" }));
    expect(onSelect).toHaveBeenCalledWith("205");
    cleanup();
  });
});
