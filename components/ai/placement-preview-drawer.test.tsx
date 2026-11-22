// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlacementPreviewDrawer, { AI_PLACEMENT_PREVIEW_KEY } from "./placement-preview-drawer";

const fetchMock = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ front_desk: [
    { name: "Bookings", purpose: "Booking process guide", description: "Review the next booking step." },
    { name: "Lost & Found", purpose: "Claim readiness check", description: "Review custody before release." },
  ] }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlacementPreviewDrawer", () => {
  it("is absent from the normal local module page", async () => {
    render(<PlacementPreviewDrawer role="front_desk" module="Bookings" />);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(screen.queryByRole("button", { name: /HAVEN AI placement preview/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("overlays current module content without changing it or requesting AI", async () => {
    window.sessionStorage.setItem(AI_PLACEMENT_PREVIEW_KEY, "1");
    const { rerender } = render(<><main data-testid="actual-module">Existing booking table</main><PlacementPreviewDrawer role="front_desk" module="Bookings" /></>);
    const toggle = await screen.findByRole("button", { name: "Open HAVEN AI placement preview" });
    expect(screen.getByTestId("actual-module")).toHaveTextContent("Existing booking table");
    fireEvent.click(toggle);
    expect(screen.getByRole("dialog", { name: "HAVEN AI" })).toHaveTextContent("Front Desk · Bookings");
    await waitFor(() => expect(screen.getByText("Booking process guide")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/prototypes/haven-ai-system-preview-data.json");

    rerender(<><main data-testid="actual-module">Existing booking table</main><PlacementPreviewDrawer role="front_desk" module="Lost & Found" /></>);
    expect(screen.getByRole("dialog", { name: "HAVEN AI" })).toHaveTextContent("Front Desk · Lost & Found");
    expect(screen.getByText("Claim readiness check")).toBeInTheDocument();
    expect(screen.getByTestId("actual-module")).toHaveTextContent("Existing booking table");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "HAVEN AI" })).not.toBeInTheDocument();
  });

  it("dismisses only the guidance label until the module is opened again", async () => {
    window.sessionStorage.setItem(AI_PLACEMENT_PREVIEW_KEY, "1");
    const { rerender } = render(<PlacementPreviewDrawer role="front_desk" module="Bookings" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Booking process guide"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss HAVEN AI summary for this module" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open HAVEN AI placement preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Close HAVEN AI placement preview" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<PlacementPreviewDrawer role="front_desk" module="Lost & Found" />);
    expect(screen.getByRole("status")).toHaveTextContent("Claim readiness check");
    rerender(<PlacementPreviewDrawer role="front_desk" module="Bookings" />);
    expect(screen.getByRole("status")).toHaveTextContent("Booking process guide");
    expect(screen.getByRole("button", { name: "Open HAVEN AI placement preview" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps manual Ask scoped to hotel work and can exit preview", async () => {
    window.sessionStorage.setItem(AI_PLACEMENT_PREVIEW_KEY, "1");
    render(<PlacementPreviewDrawer role="front_desk" module="Bookings" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open HAVEN AI placement preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask HAVEN AI" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Question about this module" }), { target: { value: "Write code for me" } });
    fireEvent.click(screen.getByRole("button", { name: "Show sample answer" }));
    expect(screen.getByRole("status")).toHaveTextContent("outside that scope");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Exit AI placement preview" }));
    expect(window.sessionStorage.getItem(AI_PLACEMENT_PREVIEW_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: /HAVEN AI placement preview/ })).not.toBeInTheDocument();
  });
});
