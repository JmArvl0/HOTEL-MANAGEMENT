// @vitest-environment jsdom
// Guest Details — Expected arrival is a native <input type="time">, the same control as
// Pickup time under Transportation. No radial clock, no wheel sheet, no shared state between
// the two times, and no change to what the hold receives. Booking, transportation and
// early-check-in rules are untouched (asserted by source contract).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuestDetailsForm } from "./guest-details-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const formSource = readFileSync("components/booking/guest-details-form.tsx", "utf8");
const bookingCss = readFileSync("app/guest-booking.css", "utf8");

const base = { roomType: "King", checkIn: "2026-09-20", checkOut: "2026-09-22", guests: 2, checkInFrom: "2:00 PM", defaults: {} as Record<string, string> };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ token: "hold-token" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Renders the form, optionally turning on the transportation block so Pickup time exists. */
function renderForm(props: Partial<Parameters<typeof GuestDetailsForm>[0]> = {}, withRide = false) {
  const view = render(<GuestDetailsForm {...base} {...props}/>);
  if (withRide) {
    fireEvent.click(screen.getByRole("radio", { name: "Arrange transportation" }));
  }
  return view;
}

const submitForm = (container: HTMLElement) => fireEvent.submit(container.querySelector("form")!);
const payloadOf = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
const arrival = () => screen.getByLabelText(/Expected arrival/) as HTMLInputElement;
const pickup = () => screen.getByLabelText("Pickup time") as HTMLInputElement;

describe("expected arrival — simple time input", () => {
  it("renders a native time input with an explicit label association", () => {
    const { container } = renderForm();
    const input = arrival();
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("time");
    expect(input.getAttribute("name")).toBe("expectedArrival");
    const label = container.querySelector('label[for="expected-arrival"]')!;
    expect(label.textContent).toBe("Expected arrival");
    expect(label.getAttribute("for")).toBe(input.id);
    // The long note stays outside the label, so it never becomes the accessible name.
    expect(screen.getByText(/Front Desk can confirm an earlier arrival/).tagName).toBe("SMALL");
  });

  it("has no radial clock, wheel or popover left in the DOM", () => {
    const { container } = renderForm();
    expect(screen.queryByRole("button", { name: /arrival/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".arrival-clock,.arrival-trigger,.arrival-popover,.arrival-wheels,.arrival-face,.arrival-wheel")).toBeNull();
    // The grid cell survives, but holds exactly the label, the input and the note.
    const cell = container.querySelector(".arrival-field")!;
    expect(cell.querySelectorAll('input[type="time"]').length).toBe(1);
    expect(cell.querySelectorAll("svg").length).toBe(0);
  });

  it("uses the same primitive as Pickup time, in the same grid", () => {
    const { container } = renderForm({}, true);
    for (const input of [arrival(), pickup()]) {
      expect(input.getAttribute("type")).toBe("time");
      expect(input.closest(".booking-form-grid")).not.toBeNull();
    }
    expect(container.querySelectorAll('.booking-form-grid input[type="time"]').length).toBe(2);
  });

  it("keeps the two times independent in both directions", () => {
    renderForm({}, true);
    fireEvent.change(arrival(), { target: { value: "13:00" } });
    expect(arrival().value).toBe("13:00");
    expect(pickup().value).toBe("");

    fireEvent.change(pickup(), { target: { value: "13:30" } });
    expect(pickup().value).toBe("13:30");
    expect(arrival().value).toBe("13:00");

    fireEvent.change(arrival(), { target: { value: "09:15" } });
    expect(arrival().value).toBe("09:15");
    expect(pickup().value).toBe("13:30");
  });

  it("posts each value under its own key, with no cross-contamination", async () => {
    const { container } = renderForm({}, true);
    fireEvent.change(arrival(), { target: { value: "13:00" } });
    fireEvent.change(pickup(), { target: { value: "13:30" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Vehicle preference/ }), { target: { value: "4" } });
    const luggage = screen.getByRole("checkbox", { name: "Help with luggage" });
    fireEvent.click(luggage);
    expect((screen.getByLabelText("Number of bags") as HTMLInputElement).required).toBe(true);
    fireEvent.click(luggage);
    expect(screen.queryByLabelText("Number of bags")).toBeNull();
    fireEvent.click(luggage);
    fireEvent.change(screen.getByLabelText("Number of bags"), { target: { value: "2" } });
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const payload = payloadOf();
    expect(payload.expectedArrival).toBe("13:00");
    expect(payload.transportationPreferences.pickupTime).toBe("13:30");
    expect(payload.transportationPreferences.fleetOptions.vehicleSeats).toBe("4");
    expect(payload.transportationPreferences.fleetOptions.luggageCount).toBe(2);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/booking/review/hold-token"));
  });

  it("prefills from the hold, and survives a submit round-trip", async () => {
    const { container } = renderForm({ initialArrival: "13:00" }, true);
    expect(arrival().value).toBe("13:00");
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(payloadOf().expectedArrival).toBe("13:00");
  });

  it("shows an inline arrival error, focuses the field and sends no booking request", async () => {
    const { container } = renderForm();
    submitForm(container);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Please check the highlighted details.");
    expect(screen.getByText("Choose an arrival time or select that you do not know it yet.")).toBeTruthy();
    expect(arrival().getAttribute("aria-invalid")).toBe("true");
    expect(arrival().required).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(arrival()));
    fireEvent.change(arrival(), { target: { value: "15:00" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("commits from the keyboard alone", () => {
    renderForm();
    const input = arrival();
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "18:45" } });
    fireEvent.blur(input);
    expect(input.value).toBe("18:45");
  });
});

describe("guest details — untouched contracts", () => {
  it("keeps the early check-in disclosure and policy wording verbatim", () => {
    expect(formSource).toContain("Standard check-in starts at {checkInFrom}. Front Desk can confirm an earlier arrival when the room is ready.");
    expect(formSource).toContain("checkInFrom");
    // No auto-approval of early check-in was introduced anywhere in the form.
    expect(formSource.toLowerCase()).not.toContain("earlycheckin");
    expect(formSource.toLowerCase()).not.toContain("early_check_in");
  });

  it("keeps the transportation preference payload shape", () => {
    expect(formSource).toContain("...(needRide ? { transportationPreferences: {");
    expect(formSource).toContain("SERVICE_OPTIONS.map((option)");
    expect(formSource).toContain('name="pickupTime"');
  });

  it("skips incomplete ride details when the guest chooses No thanks", async () => {
    const { container } = renderForm({ initialArrival: "15:00" }, true);
    fireEvent.click(screen.getByRole("radio", { name: "No thanks" }));
    expect((pickup().closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(payloadOf()).not.toHaveProperty("transportationPreferences");
  });

  it("no longer imports or renders the old picker", () => {
    expect(formSource).not.toContain("expected-arrival-picker");
    expect(formSource).not.toContain("ExpectedArrivalPicker");
  });

  it("drops the radial clock CSS and keeps the note rule", () => {
    for (const dead of ["arrival-popover", "arrival-clock", "arrival-trigger", "arrival-wheels", "arrival-segment", "arrival-period"]) {
      expect(bookingCss).not.toContain(dead);
    }
    expect(bookingCss).toContain(".booking-form-grid .arrival-note");
    // The time input carries no bespoke width — it inherits the shared grid rule.
    expect(bookingCss).not.toMatch(/\.arrival-field\s+input\s*\{/);
  });
});

it("keeps one attempt identity when a booking response is lost", async () => {
  const {container} = renderForm({initialArrival:"15:00"});
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  submitForm(container);
  await screen.findByText("We couldn't confirm your room hold. Try again with the same details to check this booking attempt.");
  const first = payloadOf().attemptId;
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  submitForm(container);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).attemptId).toBe(first);
});

it("lets the guest explicitly leave the arrival time unknown", async () => {
  const {container} = renderForm();
  fireEvent.click(screen.getByRole("checkbox", {name:/know my arrival time/}));
  expect(arrival().required).toBe(false);
  submitForm(container);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(payloadOf().expectedArrival).toBe("");
});

describe("breakfast selection with booking recovery", () => {
  const breakfast = {
    id: "972dd3d7-d1a0-43ce-bf72-071647fbfa0e", mode: "optional" as const,
    guests: 2, mornings: 2, venue: "Hotel dining", start: "06:30", end: "10:00",
    price: 1800, total: 2000, deposit: 600, balance: 1400,
    roomTotal: 200, roomDeposit: 60, roomBalance: 140,
  };

  it("leaves optional breakfast unselected and omits it from a room-only booking", async () => {
    const { container } = renderForm({ breakfast, initialArrival: "15:00" });
    expect((screen.getByRole("radio", { name: "Room only" }) as HTMLInputElement).checked).toBe(true);
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(payloadOf()).not.toHaveProperty("breakfastOfferId");
  });

  it("preserves the selected offer and attempt identity after a lost booking response", async () => {
    const { container } = renderForm({ breakfast, initialArrival: "15:00" });
    fireEvent.click(screen.getByRole("radio", { name: /Room with breakfast/ }));
    fetchMock.mockRejectedValueOnce(new Error("connection lost"));
    submitForm(container);
    await screen.findByText("We couldn't confirm your room hold. Try again with the same details to check this booking attempt.");
    const first = payloadOf();
    expect(first.breakfastOfferId).toBe(breakfast.id);
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual(first);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/booking/review/hold-token"));
  });

  it("includes the published included offer without requiring a paid option", async () => {
    const { container } = renderForm({ breakfast: { ...breakfast, mode: "included", price: 0 }, initialArrival: "15:00" });
    expect(screen.queryByRole("radio", { name: /room( only| with breakfast)/i })).toBeNull();
    submitForm(container);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(payloadOf().breakfastOfferId).toBe(breakfast.id);
  });
});
