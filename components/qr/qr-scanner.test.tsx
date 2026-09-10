// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QrScannerModal } from "./qr-scanner";

// jsdom has no matchMedia; Modal reads it on every render for reduced motion.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockGetUserMedia() {
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return getUserMedia;
}

function renderModal(onClose = vi.fn()) {
  const view = render(<QrScannerModal onClose={onClose} onCta={vi.fn()} />);
  return { onClose, ...view };
}

describe("QrScannerModal", () => {
  it("renders a dialog with an accessible name from the title", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Scan a HAVEN QR code" })).toBeTruthy();
  });

  it("closes on Escape through the shared modal's key handler", () => {
    const onClose = renderModal().onClose;
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Check code disabled until a token is typed, then submits it trimmed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "authorized", message: "Verified." }) });
    vi.stubGlobal("fetch", fetchMock);
    mockGetUserMedia();
    renderModal();

    const check = screen.getByRole("button", { name: /Check code/ }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("QR / Check-in code"), { target: { value: "  ABC-123  " } });
    expect(check.disabled).toBe(false);
    await act(async () => { fireEvent.click(check); });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/qr/resolve",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "ABC-123" }) })
    ));
  });

  it("shows a blocked-camera state with Try again and keeps manual entry available", async () => {
    const getUserMedia = mockGetUserMedia();
    getUserMedia.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    renderModal();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start camera/ })); });

    await waitFor(() => expect(screen.getByText("Camera access is blocked")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
    expect(screen.getByLabelText("QR / Check-in code")).toBeTruthy();
  });

  it("stops the camera stream tracks on unmount", async () => {
    const getUserMedia = mockGetUserMedia();
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });
    // jsdom has no rAF/2D-canvas pipeline — the tick loop can't run there.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { unmount } = renderModal();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start camera/ })); });
    unmount();

    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
