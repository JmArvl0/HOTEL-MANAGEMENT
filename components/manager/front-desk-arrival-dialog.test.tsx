// @vitest-environment jsdom
// Step 3 (Room) exception flow: when the reserved room type has no eligible rooms,
// the alternative room type and physical room selects are populated exclusively from
// the server's eligible-inventory endpoint — never free text. All fetches are stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import FrontDeskArrivalDialog from "./front-desk-arrival-dialog";

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

const standardRoutes = (base: Route, extra: Route[] = []): Route[] => [
  { match: (url) => url.includes("/api/staff/reservations/res-1"), respond: () => jsonResponse(detailBody) },
  { match: (url) => url.includes("/api/manager/approvals"), respond: (_url, init) => init?.method === "POST" ? jsonResponse({ data: { id: "appr-1" } }) : jsonResponse({ data: [] }) },
  base,
  ...extra,
];

const renderDialog = () => render(
  <FrontDeskArrivalDialog reservationId="res-1" guestName="Ana Cruz" askForm={askForm} onClose={() => {}} onCheckedIn={() => {}} />
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
    fireEvent.change(screen.getByLabelText(/Why is the exception required\?/i), { target: { value: "All eligible Garden Twin rooms are currently unavailable." } });
    fireEvent.click(screen.getByRole("button", { name: /request manager approval/i }));
    expect(await screen.findByText(/Room-type exception requested/i)).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/manager/approvals");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.type).toBe("room_type_exception");
    expect(body.reservationId).toBe("res-1");
    expect(body.requestedAction).toEqual({ roomType: "Deluxe King", requestedRoomTypeId: "dk-id", requestedRoomId: "RM-205", requestedRoomNumber: "205", originalRoomTypeId: "gt-id", originalRoomType: "Garden Twin" });
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
