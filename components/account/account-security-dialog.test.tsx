// @vitest-environment jsdom
// Account security opened in place. The menu used to navigate to
// /account/settings, which dropped whatever the guest was doing; the dialog keeps
// the page underneath. These cases pin the two blocks it carries (sound switch +
// password form), that it closes without navigating, and that the My Profile
// trigger opens the same instance via the provider.
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn(), useSession: () => ({ update: vi.fn() }) }));

import { AccountSecurityButton, AccountSecurityDialog, AccountSecurityProvider } from "./account-security-dialog";

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <AccountSecurityProvider isOpen={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
      <AccountSecurityButton className="btn btn-soft" />
    </AccountSecurityProvider>
  );
}

describe("AccountSecurityDialog", () => {
  it("renders nothing at all while closed", () => {
    const { container } = render(<AccountSecurityDialog isOpen={false} onClose={() => {}} />);
    expect(container.querySelector(".dialog")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("carries the notification-sound switch and the password form", () => {
    render(<AccountSecurityDialog isOpen onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Account security" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Notification sound on" })).toBeTruthy();
    for (const label of ["Current password", "New password", "Confirm new password"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe("password");
    }
    expect(screen.getByRole("button", { name: /Change password/ })).toBeTruthy();
  });

  it("persists the sound preference without closing the dialog", () => {
    window.localStorage.clear();
    render(<AccountSecurityDialog isOpen onClose={() => {}} />);

    fireEvent.click(screen.getByRole("switch", { name: "Notification sound on" }));

    const off = screen.getByRole("switch", { name: "Notification sound off" });
    expect(off.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("haven-sound-muted")).toBe("1");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes on Escape and on an overlay click, and does not navigate", () => {
    const onClose = vi.fn();
    const { container } = render(<AccountSecurityDialog isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".dialog-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Nothing inside the dialog is a link to the settings page any more.
    expect(container.querySelector('a[href="/account/settings"]')).toBeNull();
  });
});

describe("AccountSecurityProvider", () => {
  it("opens the dialog from an in-shell trigger", () => {
    render(<Harness />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Account security" }));

    expect(screen.getByRole("dialog", { name: "Account security" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the settings page link outside a provider", () => {
    render(<AccountSecurityButton className="btn btn-soft" />);
    expect(screen.getByRole("link", { name: "Account security" }).getAttribute("href")).toBe("/account/settings");
  });
});
