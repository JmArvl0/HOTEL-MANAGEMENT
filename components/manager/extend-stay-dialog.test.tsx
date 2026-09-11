// @vitest-environment jsdom
// Extend stay dialog: every figure comes from the server preview RPC, submit is
// gated on a valid preview, a refused normal extension (room conflict) offers the
// stay_extension Manager exception handoff, and departure transportation on the
// old checkout date is flagged — never rescheduled. All fetches are stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExtendStayDialog from "./extend-stay-dialog";

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

const reservation = { id: "RSV-1045", guest_name: "Ana Cruz", check_out: "2026-09-12", room_number: "302", room_type: "Executive Suite" };

const previewBody = {
  data: { currentCheckOut: "2026-09-12", requestedCheckOut: "2026-09-15", nights: 3, rate: 11600, additionalAmount: 34800, projectedTotal: 58000, balance: 0, roomConflict: false, roomNumber: "302", roomType: "Executive Suite" },
};

const routes = {
  preview: (body: unknown = previewBody, ok = true) => ({
    match: (url: string) => url.includes("/extend-preview"),
    respond: () => ({ ok, body }),
  }),
  extend: (body: unknown, ok = true) => ({
    match: (url: string) => url.includes("/extend") && !url.includes("preview"),
    respond: (_url: string, init?: RequestInit) => ({ ok, body, init }),
  }),
  approvals: (body = { data: { id: "MA-9001" } }) => ({
    match: (url: string) => url.includes("/api/manager/approvals"),
    respond: (_url: string, init?: RequestInit) => ({ ok: true, body, init }),
  }),
};

type Route = { match: (url: string) => boolean; respond: (url: string, init?: RequestInit) => { ok: boolean; body: unknown; init?: RequestInit } };

const serve = (list: Route[]) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = list.find((candidate) => candidate.match(url));
    if (!route) throw new Error(`no fetch stub for ${url}`);
    const { ok, body } = route.respond(url, init);
    return { ok, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const pickDate = async (value: string) => {
  fireEvent.change(screen.getByLabelText(/requested new checkout/i), { target: { value } });
};

const fillReason = () => {
  fireEvent.change(screen.getByLabelText(/reason for the extension/i), { target: { value: "Guest asked to stay three more nights" } });
};

describe("ExtendStayDialog", () => {
  it("renders the current stay from the reservation and previews server-calculated figures", async () => {
    const fetchMock = serve([routes.preview()]);
    render(<ExtendStayDialog reservation={reservation} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByDisplayValue("2026-09-12")).toBeTruthy();
    expect(screen.getByText(/Ana Cruz/)).toBeTruthy();
    await pickDate("2026-09-15");
    await waitFor(() => expect(screen.getByText("Room available")).toBeTruthy());
    expect(screen.getByText("3")).toBeTruthy(); // added nights from the server
    expect(fetchMock.mock.calls[0][0]).toContain("/extend-preview?checkOut=2026-09-15");
    // Nights, rate, and totals are the server's numbers repeated back.
    expect(screen.getByText(/Additional lodging/)).toBeTruthy();
  });

  it("keeps submit disabled until the server preview and a reason exist", async () => {
    serve([routes.preview()]);
    render(<ExtendStayDialog reservation={reservation} onClose={() => {}} onDone={() => {}} />);
    const submit = () => screen.getByRole("button", { name: /extend stay/i });
    await pickDate("2026-09-15");
    expect((submit() as HTMLButtonElement).disabled).toBe(true); // no reason yet
    fillReason();
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(false));
  });

  it("submits the normal extension with an idempotency key", async () => {
    const fetchMock = serve([
      routes.preview(),
      routes.extend({ data: { additional_amount: 34800 } }),
    ]);
    const onDone = vi.fn();
    render(<ExtendStayDialog reservation={reservation} onClose={() => {}} onDone={onDone} />);
    await pickDate("2026-09-15"); fillReason();
    await waitFor(() => expect((screen.getByRole("button", { name: /extend stay/i }) as HTMLButtonElement).disabled ?? true).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /extend stay/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const extendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/extend") && !String(url).includes("preview"));
    const payload = JSON.parse(String(extendCall?.[1]?.body));
    expect(payload).toMatchObject({ checkOut: "2026-09-15", reason: "Guest asked to stay three more nights" });
    expect(payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("offers the Manager exception handoff when the normal path reports a room conflict", async () => {
    const fetchMock = serve([
      routes.preview({ ...previewBody, data: { ...previewBody.data, roomConflict: true } }),
      routes.extend({ error: "The assigned room conflicts with a future stay. Coordinate a room change or choose another date." }, false),
      routes.approvals(),
    ]);
    const onDone = vi.fn();
    render(<ExtendStayDialog reservation={reservation} onClose={() => {}} onDone={onDone} />);
    await pickDate("2026-09-15"); fillReason();
    await waitFor(() => expect((screen.getByRole("button", { name: /extend stay/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /extend stay/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /request manager exception/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /request manager exception/i }));
    await waitFor(() => expect(screen.getByText(/MA-9001/)).toBeTruthy());
    const approvalCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/manager/approvals"));
    const payload = JSON.parse(String(approvalCall?.[1]?.body));
    expect(payload).toMatchObject({ type: "stay_extension", reservationId: "RSV-1045", requestedAction: { requestedCheckOut: "2026-09-15" } });
  });

  it("shows a preview error instead of derived figures when the server refuses", async () => {
    serve([routes.preview({ error: "The new checkout must be later than the current checkout." }, false)]);
    render(<ExtendStayDialog reservation={reservation} onClose={() => {}} onDone={() => {}} />);
    await pickDate("2026-09-13");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/Additional lodging/)).toBeNull();
  });

  it("flags departure transportation on the old checkout date without touching it", async () => {
    serve([routes.preview()]);
    const transportation = [{ id: "TR-1", service_type: "hotel_transfer", pickup_date: "2026-09-12", pickup_location: "Hotel", dropoff_location: "Airport" }];
    render(<ExtendStayDialog reservation={reservation} transportation={transportation} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByText(/not rescheduled automatically/i)).toBeTruthy();
    expect(screen.getByText(/Hotel.*Airport/)).toBeTruthy();
  });
});
