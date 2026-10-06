// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { HavenAccountModal } from "./haven-account-modal";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

afterEach(cleanup);

describe("HavenAccountModal", () => {
  const defaultUser = {
    name: "Carl Garcia",
    email: "leovinoarevalo0@gmail.com",
    role: "customer",
  };

  it("does not render dialog contents when open is false", () => {
    render(
      <HavenAccountModal
        open={false}
        onClose={vi.fn()}
        user={defaultUser}
        onSignOut={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a proper modal with dimmed backdrop and hero identity card", async () => {
    const handleClose = vi.fn();
    render(
      <HavenAccountModal
        open={true}
        onClose={handleClose}
        user={defaultUser}
        roleLabel="Guest Customer"
        avatarInitials="CG"
        onSignOut={vi.fn()}
      />
    );
    await act(async () => {});

    // Modal dialog role and accessibility
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Backdrop exists for background dimming
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();

    // Hero identity information
    expect(screen.getByText("Carl Garcia")).toBeTruthy();
    expect(screen.getByText("leovinoarevalo0@gmail.com")).toBeTruthy();
    expect(screen.getByText("Guest Customer")).toBeTruthy();
    expect(screen.getByText("CG")).toBeTruthy();
  });

  it("renders backwards-compatible popover classes on modal content", async () => {
    render(
      <HavenAccountModal
        open={true}
        onClose={vi.fn()}
        user={defaultUser}
        onSignOut={vi.fn()}
      />
    );
    await act(async () => {});

    const inner = document.querySelector(".customer-account-popover.profile-popover");
    expect(inner).toBeTruthy();
  });

  it("renders navigation and action rows with exact accessible names and triggers callbacks", async () => {
    const handleClose = vi.fn();
    const handleSecurity = vi.fn();
    const handleSettings = vi.fn();
    const handleSignOut = vi.fn();

    render(
      <HavenAccountModal
        open={true}
        onClose={handleClose}
        user={defaultUser}
        profileHref="/account/profile"
        onOpenSecurity={handleSecurity}
        onOpenSettings={handleSettings}
        showSoundToggle={true}
        onSignOut={handleSignOut}
      />
    );
    await act(async () => {});

    // My Profile link
    const profileLink = screen.getByRole("link", { name: "My Profile" });
    expect(profileLink.getAttribute("href")).toBe("/account/profile");
    fireEvent.click(profileLink);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Account security button
    const securityBtn = screen.getByRole("button", { name: "Account security" });
    fireEvent.click(securityBtn);
    expect(handleSecurity).toHaveBeenCalledTimes(1);

    // Settings button
    const settingsBtn = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settingsBtn);
    expect(handleSettings).toHaveBeenCalledTimes(1);

    // Notification sound switch toggle
    const soundSwitch = screen.getByRole("switch", { name: /Notification sound/ });
    expect(soundSwitch).toBeTruthy();
    fireEvent.click(soundSwitch);

    // Sign Out button
    const signOutBtn = screen.getByRole("button", { name: "Sign Out" });
    fireEvent.click(signOutBtn);
    expect(handleSignOut).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key press", async () => {
    const handleClose = vi.fn();
    render(
      <HavenAccountModal
        open={true}
        onClose={handleClose}
        user={defaultUser}
        onSignOut={vi.fn()}
      />
    );
    await act(async () => {});

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
  });
});
