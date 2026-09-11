// @vitest-environment jsdom
// Step 3 (Room) exception flow: when the reserved room type has no eligible rooms,
// the alternative room type and physical room selects are populated exclusively from
// the server's eligible-inventory endpoint — never free text. All fetches are stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import FrontDeskArrivalDialog, { type ArrivalProgress } from "./front-desk-arrival-dialog";

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

const askForm = vi.fn(async () => null);

const detailBody = {
  data: {
    reservation: {
      id: "res-1", guest_name: "Ana Cruz", confirmation_number: "HV-1001", status: "confirmed",
      source: "front_desk", room_type: "Garden Twin", check_in: "2026-09-08", check_out: "2026-09-10",
      identity_status: "verified", deposit_required: 0, deposit: 0, payment_status: "paid", total: 5000,
    },
    invoice: { amount: 5000, paid: 5000, balance: 0 },
  },
};

const reservedRoom = (number: string) => ({ id: `RM-${number}`, number, floor: 1, type: "Garden Twin", roomTypeId: "gt-id" });

const alternatives = [
  { roomTypeId: "dk-id", roomTypeName: "Deluxe King", eligibleRoomCount: 3 },
  { roomTypeId: "os-id", roomTypeName: "Ocean Suite", eligibleRoomCount: 1 },
];

const deluxeRooms = [
  { id: "RM-201", number: "201", floor: 2, type: "Deluxe King", roomTypeId: "dk-id" },
  { id: "RM-205", number: "205", floor: 2, type: "Deluxe King", roomTypeId: "dk-id" },
  { id: "RM-208", number: "208", floor: 2, type: "Deluxe King", roomTypeId: "dk-id" },
];

type Responder = { ok: boolean; body: unknown };
type Route = { match: (url: string) => boolean; respond: (url: string, init?: RequestInit) => Responder };

// URL-routed fetch stub. Routes are matched in order; unmatched URLs fail loudly.
const serve = (routes: Route[]) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) throw new Error(`no fetch stub for ${url}`);
    const { ok, body } = route.respond(url, init);
    return { ok, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const jsonResponse = (body: unknown, ok = true) => ({ ok, body });

// Base eligible-rooms response (no roomTypeId/exceptionType query): call-counted so a
// refresh can return different inventory.
const baseRoute = (respond: (call: number) => Responder): Route => {
  let calls = 0;
  return {
    match: (url) => url.includes("/eligible-rooms") && !url.includes("roomTypeId=") && !url.includes("exceptionType="),
    respond: () => respond(++calls),
  };
};

const roomTypeRoute = (responder: Responder): Route => ({
  match: (url) => url.includes("roomTypeId=dk-id"),
  respond: () => responder,
});

// Eligible-rooms fetch for an approved exception (?exceptionType=…) — the callout CTA's target.
const exceptionRoute = (responder: Responder): Route => ({
  match: (url) => url.includes("exceptionType="),
  respond: () => responder,
});

// Latest room_type_exception approval row, already approved and awaiting execution.
const approvedExceptionRow = {
  reservation_id: "res-1", request_type: "room_type_exception", status: "approved",
  execution_status: "awaiting_execution", requested_at: "2026-09-11T09:00:00Z",
  requested_action: { roomType: "Deluxe King" },
};

const standardRoutes = (base: Route, extra: Route[] = [], approvals: Responder = jsonResponse({ data: [] })): Route[] => [
  { match: (url) => url.includes("/api/staff/reservations/res-1"), respond: () => jsonResponse(detailBody) },
  { match: (url) => url.includes("/api/manager/approvals"), respond: (_url, init) => init?.method === "POST" ? jsonResponse({ data: { id: "appr-1" } }) : approvals },
  base,
  ...extra,
];

const renderDialog = (props: { resume?: ArrivalProgress | null; onProgress?: (p: ArrivalProgress) => void } = {}) => render(
  <FrontDeskArrivalDialog reservationId="res-1" guestName="Ana Cruz" askForm={askForm} onClose={() => {}} onCheckedIn={() => {}} {...props} />
);

// Identity (verified) and financial (zero balance) are ready, so two Continues reach Step 3.
const advanceToRoomStep = async () => {
  await screen.findByText("Guest identity");
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText("Financial readiness");
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText("Choose the physical room");
};

const select = (label: string | RegExp) => screen.getByLabelText(label) as HTMLSelectElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("FrontDeskArrivalDialog — Step 3 room assignment", () => {
  it("shows the normal radio-card flow and no exception UI when the reserved type has rooms", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [reservedRoom("101"), reservedRoom("104")], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    renderDialog();
    await advanceToRoomStep();
    const group = await screen.findByRole("radiogroup", { name: "Eligible rooms" });
    expect(within(group).getByText("Room 101")).toBeTruthy();
    expect(screen.queryByText("Alternative room assignment")).toBeNull();
    expect(screen.queryByText(/no eligible rooms of the reserved type/i)).toBeNull();
  });

  it("lists only alternative room types with eligible rooms — never the reserved type", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives }))));
    renderDialog();
    await advanceToRoomStep();
    expect(await screen.findByText(/No eligible rooms of the reserved type Garden Twin are available right now\./i)).toBeTruthy();
    const typeSelect = select("Target room type");
    expect(within(typeSelect).getByRole("option", { name: "Deluxe King — 3 rooms available" })).toBeTruthy();
    expect(within(typeSelect).getByRole("option", { name: "Ocean Suite — 1 room available" })).toBeTruthy();
    expect(within(typeSelect).queryByRole("option", { name: /Garden Twin/i })).toBeNull();
    expect(within(typeSelect).queryByRole("option", { name: /Executive Suite/i })).toBeNull();
    // Present but disabled until type + room + reason are all chosen.
    expect((screen.getByRole("button", { name: /request manager approval/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loads only eligible physical rooms of the selected target type", async () => {
    const fetchMock = serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [roomTypeRoute(jsonResponse({ data: deluxeRooms, selectedRoomType: { roomTypeId: "dk-id", roomTypeName: "Deluxe King", eligibleRoomCount: 3 } }))]
    ));
    renderDialog();
    await advanceToRoomStep();
    fireEvent.change(await screen.findByLabelText("Target room type"), { target: { value: "dk-id" } });
    const roomSelect = await screen.findByLabelText("Physical room");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("roomTypeId=dk-id"))).toBe(true);
    for (const number of ["201", "205", "208"]) expect(within(roomSelect).getByRole("option", { name: new RegExp(`Room ${number}`) })).toBeTruthy();
    expect(within(roomSelect).queryByRole("option", { name: /Garden Twin/i })).toBeNull();
  });

  it("submits the exception with structured IDs from the server-fed selections", async () => {
    const fetchMock = serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [roomTypeRoute(jsonResponse({ data: deluxeRooms }))]
    ));
    renderDialog();
    await advanceToRoomStep();
    fireEvent.change(await screen.findByLabelText("Target room type"), { target: { value: "dk-id" } });
    fireEvent.change(await screen.findByLabelText("Physical room"), { target: { value: "RM-205" } });
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "hotel_type_unavailable" } });
    fireEvent.change(screen.getByLabelText(/Why is the exception required\?/i), { target: { value: "All eligible Garden Twin rooms are currently unavailable." } });
    fireEvent.click(screen.getByRole("button", { name: /request manager approval/i }));
    expect(await screen.findByText(/Room-type exception requested/i)).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/manager/approvals");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.type).toBe("room_type_exception");
    expect(body.reservationId).toBe("res-1");
    expect(body.requestedAction).toEqual({ reasonCode: "hotel_type_unavailable", roomType: "Deluxe King", requestedRoomTypeId: "dk-id", requestedRoomId: "RM-205", requestedRoomNumber: "205", originalRoomTypeId: "gt-id", originalRoomType: "Garden Twin" });
  });

  it("shows an explicit empty state and no approval request when no alternative type has rooms", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    renderDialog();
    await advanceToRoomStep();
    expect(await screen.findByText(/No alternative room types currently have eligible rooms\./i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /request manager approval/i })).toBeNull();
    expect(screen.queryByLabelText("Target room type")).toBeNull();
    expect(screen.getByRole("button", { name: /refresh eligible rooms/i })).toBeTruthy();
  });

  it("refresh reloads both lists and returns the normal flow once the reserved type has rooms", async () => {
    serve(standardRoutes(baseRoute((call) => call === 1
      ? jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })
      : jsonResponse({ data: [reservedRoom("101")], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    renderDialog();
    await advanceToRoomStep();
    expect(await screen.findByText("Alternative room assignment")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /refresh eligible rooms/i }));
    const group = await screen.findByRole("radiogroup", { name: "Eligible rooms" });
    expect(within(group).getByText("Room 101")).toBeTruthy();
    expect(screen.queryByText("Alternative room assignment")).toBeNull();
  });

  it("recovers from an inventory change (409) while loading an alternative type's rooms", async () => {
    serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [roomTypeRoute(jsonResponse({ error: "Room inventory changed. No eligible rooms remain for that room type." }, false))]
    ));
    renderDialog();
    await advanceToRoomStep();
    fireEvent.change(await screen.findByLabelText("Target room type"), { target: { value: "dk-id" } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Room inventory changed/i);
    await waitFor(() => expect(select("Target room type").value).toBe(""));
  });
});

describe("FrontDeskArrivalDialog — approved exception callout", () => {
  it("presents an approved exception as a prominent status callout with a primary load button", async () => {
    serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [],
      jsonResponse({ data: [approvedExceptionRow] })
    ));
    renderDialog();
    await advanceToRoomStep();
    // Status lives in a role="status" block, the room type is its own element,
    // and the next action is a real accent button — not an inline text link.
    const title = await screen.findByText("Room-type exception approved");
    expect(title.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByText("Deluxe King", { selector: ".arrival-approval-detail b" })).toBeTruthy();
    const cta = screen.getByRole("button", { name: "Load Deluxe King rooms" });
    expect(cta.className).toContain("btn-accent");
  });

  it("loads only the approved type's rooms from the callout CTA and shows the active summary", async () => {
    const fetchMock = serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [exceptionRoute(jsonResponse({ data: deluxeRooms, reservedRoomTypeId: "gt-id", alternativeRoomTypes: [], exceptionApproved: true, typeRate: 3200 }))],
      jsonResponse({ data: [approvedExceptionRow] })
    ));
    renderDialog();
    await advanceToRoomStep();
    fireEvent.click(await screen.findByRole("button", { name: "Load Deluxe King rooms" }));
    // The staff member still chooses the physical room — the CTA only loads the list.
    const group = await screen.findByRole("radiogroup", { name: "Eligible rooms" });
    expect(within(group).getByText("Room 201")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => decodeURIComponent(String(url)).includes("exceptionType=Deluxe King"))).toBe(true);
    expect(await screen.findByText(/Approved exception active/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /use reserved-type rooms instead/i })).toBeTruthy();
  });

  it("keeps the request form for different types only — the approved type is never a duplicate option", async () => {
    serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [],
      jsonResponse({ data: [approvedExceptionRow] })
    ));
    renderDialog();
    await advanceToRoomStep();
    expect(await screen.findByText(/Need a different room type than the approved Deluxe King\?/i)).toBeTruthy();
    const typeSelect = select("Target room type");
    expect(within(typeSelect).queryByRole("option", { name: /Deluxe King/i })).toBeNull();
    expect(within(typeSelect).getByRole("option", { name: "Ocean Suite — 1 room available" })).toBeTruthy();
  });

  it("hides the request form entirely when the approved type is the only alternative with rooms", async () => {
    serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [alternatives[0]] })),
      [],
      jsonResponse({ data: [approvedExceptionRow] })
    ));
    renderDialog();
    await advanceToRoomStep();
    expect(await screen.findByRole("button", { name: "Load Deluxe King rooms" })).toBeTruthy();
    expect(screen.queryByLabelText("Target room type")).toBeNull();
    expect(screen.queryByRole("button", { name: /request manager approval/i })).toBeNull();
    expect(screen.queryByText(/No alternative room types currently have eligible rooms/i)).toBeNull();
  });
});

describe("FrontDeskArrivalDialog — resume across close/reopen", () => {
  it("resumes at the Room step with the saved room selected", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [reservedRoom("101"), reservedRoom("104")], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    renderDialog({ resume: { step: 2, selected: "101", exceptionMode: null } });
    // No Continue clicks: the wizard reopens directly on the Room step.
    expect(await screen.findByText("Choose the physical room")).toBeTruthy();
    expect(screen.queryByText("Guest identity")).toBeNull();
    const group = await screen.findByRole("radiogroup", { name: "Eligible rooms" });
    const radio = within(group).getByRole("radio", { name: /Room 101/ }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("resumes at the Review step and reports progress", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [reservedRoom("101")], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    const onProgress = vi.fn();
    renderDialog({ resume: { step: 3, selected: "101", exceptionMode: null }, onProgress });
    expect(await screen.findByText("Review and check in")).toBeTruthy();
    expect(await screen.findByText("Room 101")).toBeTruthy();
    await waitFor(() => expect(onProgress).toHaveBeenCalledWith({ step: 3, selected: "101", exceptionMode: null }));
  });

  it("clamps to the Room step when the saved room is no longer eligible", async () => {
    serve(standardRoutes(baseRoute(() => jsonResponse({ data: [reservedRoom("101")], reservedRoomTypeId: "gt-id", alternativeRoomTypes: [] }))));
    renderDialog({ resume: { step: 3, selected: "999", exceptionMode: null } });
    expect(await screen.findByText("Choose the physical room")).toBeTruthy();
    expect(screen.queryByText("Review and check in")).toBeNull();
  });

  it("resumes an active exception mode with its room selected", async () => {
    serve(standardRoutes(
      baseRoute(() => jsonResponse({ data: [], reservedRoomTypeId: "gt-id", alternativeRoomTypes: alternatives })),
      [exceptionRoute(jsonResponse({ data: deluxeRooms, reservedRoomTypeId: "gt-id", alternativeRoomTypes: [], exceptionApproved: true }))],
    ));
    renderDialog({ resume: { step: 2, selected: "201", exceptionMode: "Deluxe King" } });
    expect(await screen.findByText(/Approved exception active/i)).toBeTruthy();
    const group = await screen.findByRole("radiogroup", { name: "Eligible rooms" });
    const radio = within(group).getByRole("radio", { name: /Room 201/ }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});