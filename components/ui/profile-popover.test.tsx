// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilePopover } from "./ProfilePopover";

afterEach(cleanup);

const user = { name: "John Arevalo", email: "john@example.com", role: "admin" };

function Harness({
  soundEnabled = true,
  onClose = vi.fn(),
  onSoundToggle = vi.fn(),
}: {
  soundEnabled?: boolean;
  onClose?: () => void;
  onSoundToggle?: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={trigger} type="button">Avatar</button>
      <ProfilePopover
        variant="staff"
        user={user}
        roleLabel="System Administrator"
        triggerRef={trigger}
        open={open}
        onClose={() => { onClose(); setOpen(false); }}
        onSignOut={vi.fn()}
        onSettings={vi.fn()}
        soundEnabled={soundEnabled}
        onSoundToggle={onSoundToggle}
      />
    </div>
  );
}

describe("ProfilePopover", () => {
  it("renders nothing while closed", () => {
    const trigger = { current: null } as React.RefObject<HTMLElement | null>;
    render(
      <ProfilePopover user={user} triggerRef={trigger} open={false} onClose={vi.fn()} onSignOut={vi.fn()} />
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the identity header and account actions", () => {
    render(<Harness />);
    expect(screen.getByText("John Arevalo")).toBeTruthy();
    expect(screen.getByText("john@example.com")).toBeTruthy();
    expect(screen.getByText("System Administrator")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Settings/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Sign Out/ })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: /Sound On/ })).toBeTruthy();
  });

  it("focuses the first action when it opens", () => {
    render(<Harness />);
    expect(document.activeElement?.textContent).toContain("Settings");
  });

  it("moves through Settings, Sound, and Sign Out in both directions", () => {
    render(<Harness />);
    const settings = screen.getByRole("menuitem", { name: /Settings/ });
    const sound = screen.getByRole("menuitemcheckbox", { name: /Sound On/ });
    const signOut = screen.getByRole("menuitem", { name: /Sign Out/ });

    expect(document.activeElement).toBe(settings);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sound);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(signOut);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(sound);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(settings);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside press but stays open for an inside press", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires Settings and closes, but toggles sound without closing", () => {
    const onClose = vi.fn();
    const onSoundToggle = vi.fn();
    render(<Harness onClose={onClose} onSoundToggle={onSoundToggle} />);

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Sound On/ }));
    expect(onSoundToggle).toHaveBeenCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: /Settings/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks Sign Out as the danger action", () => {
    render(<Harness />);
    expect(screen.getByRole("menuitem", { name: /Sign Out/ }).className).toContain("profile-popover-item--danger");
  });
});
