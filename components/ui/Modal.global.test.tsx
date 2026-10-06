// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { Modal, ConfirmDialog, resetModalScrollLockForTesting } from "./Modal";

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
      }) as MediaQueryList;
  }
});

afterEach(() => {
  cleanup();
  resetModalScrollLockForTesting();
});

describe("Global Root Modal Architecture", () => {
  it("renders at document.body root via portal by default, not inside parent container", () => {
    const { container } = render(
      <div className="customer-content">
        <Modal isOpen onClose={() => {}} title="Root Test Modal">
          <p>Modal content</p>
        </Modal>
      </div>
    );

    // Should NOT be inside .customer-content
    expect(container.querySelector(".dialog-backdrop")).toBeNull();
    expect(container.querySelector(".dialog")).toBeNull();

    // Must be directly portaled into document.body
    const portal = document.body.querySelector(".haven-modal-portal");
    expect(portal).toBeTruthy();
    expect(document.body.querySelector(".dialog-backdrop")).toBeTruthy();
    expect(document.body.querySelector(".dialog")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Root Test Modal" })).toBeTruthy();
  });

  it("locks both body and html scrolling on open and restores on close", async () => {
    function ToggleModal() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Scroll Lock Modal">
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </Modal>
        </div>
      );
    }

    render(<ToggleModal />);

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.classList.contains("haven-modal-open")).toBe(false);

    fireEvent.click(screen.getByText("Open"));
    await act(async () => {});

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.classList.contains("haven-modal-open")).toBe(true);
    expect(document.documentElement.classList.contains("haven-modal-open")).toBe(true);

    fireEvent.click(screen.getByText("Close"));
    await act(async () => {});

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.classList.contains("haven-modal-open")).toBe(false);
    expect(document.documentElement.classList.contains("haven-modal-open")).toBe(false);
  });

  it("handles reference-counted scroll locking across nested/stacked modals", async () => {
    function StackedModals() {
      const [modalOne, setModalOne] = useState(true);
      const [modalTwo, setModalTwo] = useState(false);
      return (
        <div>
          <Modal isOpen={modalOne} onClose={() => setModalOne(false)} title="Modal 1">
            <button type="button" onClick={() => setModalTwo(true)}>Open Modal 2</button>
          </Modal>
          <ConfirmDialog
            isOpen={modalTwo}
            onClose={() => setModalTwo(false)}
            onConfirm={() => setModalTwo(false)}
            title="Confirm"
            message="Confirm action?"
          />
        </div>
      );
    }

    render(<StackedModals />);
    await act(async () => {});

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    // Open second modal
    fireEvent.click(screen.getByText("Open Modal 2"));
    await act(async () => {});
    expect(document.body.style.overflow).toBe("hidden");

    // Close second modal while first is still open
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});

    // Scroll should STILL be locked because Modal 1 is still open!
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.classList.contains("haven-modal-open")).toBe(true);

    // Close first modal
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await act(async () => {});

    // Now scroll lock should be released
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("traps focus inside the modal with Tab and Shift+Tab wrap-around", async () => {
    render(
      <Modal isOpen onClose={() => {}} title="Focus Trap Modal">
        <input id="input-1" placeholder="First input" />
        <input id="input-2" placeholder="Second input" />
        <button type="button" id="btn-save">Save</button>
      </Modal>
    );

    await act(async () => {});

    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    const saveBtn = screen.getByRole("button", { name: "Save" });

    // Focus starts inside dialog
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    // Shift+Tab from close button (first focusable) wraps to save button (last focusable)
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(saveBtn);

    // Tab from save button (last focusable) wraps to close button (first focusable)
    saveBtn.focus();
    expect(document.activeElement).toBe(saveBtn);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("closes on backdrop click and on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Dismissable Modal">
        <p>Dismissable body</p>
      </Modal>
    );

    const backdrop = document.body.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("detects and cascades customer-shell or app-shell classes to portal wrapper", async () => {
    render(
      <div className="customer-shell">
        <div className="customer-content">
          <Modal isOpen onClose={() => {}} title="Customer Scoped Modal">
            <p>Customer scoped</p>
          </Modal>
        </div>
      </div>
    );

    await act(async () => {});

    const portal = document.body.querySelector(".haven-modal-portal");
    expect(portal).toBeTruthy();
    expect(portal?.classList.contains("customer-shell")).toBe(true);
  });
});
