// @vitest-environment jsdom
// Behavior + contract tests for the shared room-photo lightbox: card and
// gallery triggers, fullscreen viewer layering above the details modal,
// looping navigation, zoom/pan inspection, keyboard + focus behavior, and the
// CSS/token contracts (contain fit, z-index, reduced motion, print hiding).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RoomPhotoLightbox } from "./room-photo-lightbox";
import { RoomResults } from "./room-results";
import { RoomDetailsButton } from "./room-details";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const PHOTOS = [
  "https://images.unsplash.com/photo-a?q=80&w=1600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-b?q=80&w=1600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-c?q=80&w=1600&auto=format&fit=crop",
];

const room = {
  id: "deluxe-king",
  name: "Deluxe King",
  description: "King bed, clean contemporary finishes.",
  maxGuests: 2,
  beds: "1 king bed",
  sizeSqm: 32,
  amenities: ["Free Wi-Fi", "Air conditioning", "Mini fridge", "Work desk"],
  photos: PHOTOS,
  nightlyRate: 6400,
  availableUnits: 3,
  nights: 2,
  subtotal: 12800,
};

function openDetails() {
  render(<RoomDetailsButton room={room} bookHref="/booking/details?roomType=Deluxe%20King" />);
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByRole("dialog", { name: "Deluxe King" })).toBeTruthy();
}

function ControlledViewer({ start = 0 }: { start?: number }) {
  const [index, setIndex] = useState<number | null>(start);
  return <RoomPhotoLightbox photos={PHOTOS} roomName="Deluxe King" index={index} onClose={() => setIndex(null)} onIndexChange={setIndex} />;
}

afterEach(() => { cleanup(); document.body.style.overflow = ""; });

// Modal reads matchMedia during render; jsdom does not provide it.
beforeEach(() => {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  }
});

describe("card photo trigger", () => {
  it("renders a button (never a booking link) over the card photo", () => {
    render(<RoomResults rooms={[room]} hrefFor={() => "#book-form"} />);
    const trigger = screen.getByRole("button", { name: "Open Deluxe King photo gallery" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.closest("a")).toBeNull();
  });

  it("opens the fullscreen viewer with the cover photo first", () => {
    render(<RoomResults rooms={[room]} hrefFor={() => "#book-form"} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo gallery" }));
    const dialog = screen.getByRole("dialog", { name: "Deluxe King photo gallery" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const img = screen.getByAltText("Deluxe King room photo 1");
    expect(img.getAttribute("src")).toBe(PHOTOS[0]);
    expect(screen.getByText("Deluxe King · Photo 1 of 3")).toBeTruthy();
  });

  it("falls back to stock photography when the room has no DB photos", () => {
    render(<RoomResults rooms={[{ ...room, photos: [] }]} hrefFor={() => "#book-form"} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo gallery" }));
    expect(screen.getByText("Deluxe King · Photo 1 of 3")).toBeTruthy();
  });
});

describe("details gallery triggers", () => {
  it("opens the viewer from the main photo without closing View Details", () => {
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo 1 fullscreen" }));
    expect(screen.getByRole("dialog", { name: "Deluxe King photo gallery" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Deluxe King" })).toBeTruthy();
  });

  it("opens the viewer at the tapped thumbnail index", () => {
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "View photo 3 of Deluxe King" }));
    expect(screen.getByText("Deluxe King · Photo 3 of 3")).toBeTruthy();
  });

  it("closing the viewer leaves the details modal exactly as it was", () => {
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo 1 fullscreen" }));
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog", { name: "Deluxe King photo gallery" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Deluxe King" })).toBeTruthy();
    expect(screen.getByText("What this room includes")).toBeTruthy();
  });
});

describe("navigation and counter", () => {
  it("steps next/previous and loops first ↔ last", () => {
    let index: number | null = 0;
    const { rerender } = render(<RoomPhotoLightbox photos={PHOTOS} roomName="Deluxe King" index={index} onClose={() => { index = null; }} onIndexChange={(next) => { index = next; }} />);
    const sync = () => rerender(<RoomPhotoLightbox photos={PHOTOS} roomName="Deluxe King" index={index} onClose={() => { index = null; }} onIndexChange={(next) => { index = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Next photo" })); sync();
    expect(screen.getByText("Deluxe King · Photo 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" })); sync();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" })); sync();
    expect(screen.getByText("Deluxe King · Photo 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" })); sync();
    expect(screen.getByText("Deluxe King · Photo 3 of 3")).toBeTruthy();
  });

  it("supports Left/Right arrow keys", () => {
    let index: number | null = 0;
    const props = () => ({ photos: PHOTOS, roomName: "Deluxe King", index, onClose: () => { index = null; }, onIndexChange: (next: number) => { index = next; } });
    const { rerender } = render(<RoomPhotoLightbox {...props()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    rerender(<RoomPhotoLightbox {...props()} />);
    expect(screen.getByText("Deluxe King · Photo 2 of 3")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    rerender(<RoomPhotoLightbox {...props()} />);
    expect(screen.getByText("Deluxe King · Photo 1 of 3")).toBeTruthy();
  });

  it("preserves the given photo order", () => {
    const reversed = [...PHOTOS].reverse();
    render(<RoomPhotoLightbox photos={reversed} roomName="Deluxe King" index={0} onClose={() => {}} />);
    expect(screen.getByAltText("Deluxe King room photo 1").getAttribute("src")).toBe(reversed[0]);
  });
});

describe("zoom and pan", () => {
  function openViewer() {
    render(<RoomPhotoLightbox photos={PHOTOS} roomName="Deluxe King" index={0} onClose={() => {}} />);
  }

  it("zooms in and out through labeled levels", () => {
    openViewer();
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("150%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("125%");
  });

  it("resets zoom when the photo changes", () => {
    let index: number | null = 0;
    const props = () => ({ photos: PHOTOS, roomName: "Deluxe King", index, onClose: () => {}, onIndexChange: (next: number) => { index = next; } });
    const { rerender } = render(<RoomPhotoLightbox {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("150%");
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    rerender(<RoomPhotoLightbox {...props()} />);
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("100%");
  });

  it("double-click toggles between 100% and full zoom", () => {
    openViewer();
    const stage = screen.getByAltText("Deluxe King room photo 1").parentElement!;
    fireEvent.doubleClick(stage);
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("200%");
    fireEvent.doubleClick(stage);
    expect(screen.getByRole("button", { name: "Reset zoom" }).textContent).toBe("100%");
  });

  it("drags the photo while zoomed without losing it", () => {
    openViewer();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const img = screen.getByAltText("Deluxe King room photo 1");
    const stage = img.parentElement!;
    fireEvent.pointerDown(stage, { pointerType: "mouse", button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 200 });
    fireEvent.pointerUp(window);
    expect(img.style.transform).toContain("translate(60px");
    expect(img.style.transform).toContain("scale(2)");
  });

  it("ignores drag at 100% zoom", () => {
    openViewer();
    const img = screen.getByAltText("Deluxe King room photo 1");
    fireEvent.pointerDown(img.parentElement!, { pointerType: "mouse", button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });
    expect(img.style.transform).toContain("translate(0px");
  });
});

describe("close, focus, and background", () => {
  it("Escape closes the viewer but keeps View Details open", () => {
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo 1 fullscreen" }));
    const dialog = screen.getByRole("dialog", { name: "Deluxe King photo gallery" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Deluxe King photo gallery" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Deluxe King" })).toBeTruthy();
  });

  it("backdrop click closes the viewer", () => {
    render(<ControlledViewer />);
    const dialog = screen.getByRole("dialog", { name: "Deluxe King photo gallery" });
    fireEvent.click(dialog.firstElementChild!);
    expect(screen.queryByRole("dialog", { name: "Deluxe King photo gallery" })).toBeNull();
  });

  it("moves focus into the viewer and returns it to the trigger", () => {
    render(<RoomResults rooms={[room]} hrefFor={() => "#book-form"} />);
    const trigger = screen.getByRole("button", { name: "Open Deluxe King photo gallery" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close photo viewer");
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("locks body scroll while open and restores it on close", () => {
    const { unmount } = render(<RoomPhotoLightbox photos={PHOTOS} roomName="Deluxe King" index={0} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps Tab inside the viewer so the page behind stays unreachable", () => {
    render(<ControlledViewer />);
    const close = screen.getByRole("button", { name: "Close photo viewer" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    zoomIn.focus();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Deluxe King photo gallery" }), { key: "Tab" });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Deluxe King photo gallery" }), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(zoomIn);
  });

  it("keeps the details modal scroll lock when the viewer closes above it", () => {
    openDetails();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo 1 fullscreen" }));
    expect(screen.getByRole("dialog", { name: "Deluxe King photo gallery" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog", { name: "Deluxe King" })).toBeTruthy();
  });

  it("renders nothing for an empty gallery instead of a blank viewer", () => {
    render(<RoomPhotoLightbox photos={[]} roomName="Deluxe King" index={0} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a fallback for a failed photo and keeps navigation working", () => {
    render(<ControlledViewer />);
    fireEvent.error(screen.getByAltText("Deluxe King room photo 1"));
    expect(screen.getByText("This photo couldn't be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByAltText("Deluxe King room photo 2")).toBeTruthy();
  });
});

describe("lightbox presentation contracts", () => {
  it("layers above every modal via the shared z-index token", () => {
    const tokens = read("app/design-tokens.css");
    const css = read("components/booking/room-details.css");
    expect(tokens).toContain("--z-index-lightbox: 1400;");
    expect(css).toContain("z-index: var(--z-index-lightbox, 1400);");
  });

  it("preserves aspect ratio, stays in-viewport, and respects reduced motion", () => {
    const css = read("components/booking/room-details.css");
    expect(css).toContain("object-fit: contain;");
    expect(css).toContain("overflow: clip;");
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("prefers-reduced-motion");
    expect(read("app/design-tokens.css")).toContain(".room-lightbox,");
  });
});

describe("card hover overlay regression", () => {
  it("never styles the trigger hint with an opaque light block", () => {
    const portal = read("app/guest-booking.css");
    expect(portal).not.toMatch(/\.available-room-image span\{[^}]*background:#fff/);
    // The availability chip keeps its explicit scoped rule.
    expect(portal).toContain(".available-room-image .room-availability-chip{");
  });

  it("keeps the full-photo trigger transparent with a subtle dark hover tint", () => {
    const css = read("components/booking/room-details.css");
    expect(css).toContain("inset: 0;");
    expect(css).toContain("background: transparent; cursor: zoom-in;");
    expect(css).toContain("rgba(0, 0, 0, 0.14)");
    expect(css).not.toMatch(/\.room-photo-open[^{]*\{[^}]*background:\s*#fff/);
  });

  it("shows a compact dark View-photo cue that fades in without covering the photo", () => {
    const css = read("components/booking/room-details.css");
    expect(css).toContain("background: rgba(0, 0, 0, 0.55);");
    expect(css).toContain("translateY(3px)");
    expect(css).toContain("transform 0.18s ease");
  });

  it("scales the card photo barely and kills the motion under reduced motion", () => {
    const css = read("components/booking/room-details.css");
    expect(css).toContain("transform: scale(1.02);");
    expect(css).toContain(".room-photo-open, .room-photo-open-hint, .available-room-image img { transition: none; }");
  });

  it("keeps the whole card photo clickable into the existing viewer", () => {
    render(<RoomResults rooms={[room]} hrefFor={() => "#book-form"} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Deluxe King photo gallery" }));
    expect(screen.getByRole("dialog", { name: "Deluxe King photo gallery" })).toBeTruthy();
    expect(screen.getByAltText("Deluxe King room photo 1").getAttribute("src")).toBe(PHOTOS[0]);
  });
});
