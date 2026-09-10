// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookingSearchForm } from "./booking-search-form";

afterEach(cleanup);
describe("Booking search", () => {
  it("moves checkout to the next calendar day when check-in moves forward", () => {
    render(<BookingSearchForm initial={{ checkIn: "2099-09-06", checkOut: "2099-09-08" }}/>);
    fireEvent.change(screen.getByLabelText("Check in"), { target: { value: "2099-09-30" } });
    const checkout = screen.getByLabelText("Check out") as HTMLInputElement;
    expect(checkout.value).toBe("2099-10-01");
    expect(checkout.min).toBe("2099-10-01");
  });
  it("rejects checkout on the arrival date with native form validation", () => {
    render(<BookingSearchForm initial={{ checkIn: "2099-09-06", checkOut: "2099-09-06" }}/>);
    expect((screen.getByLabelText("Check out") as HTMLInputElement).validity.rangeUnderflow).toBe(true);
    expect((screen.getByRole("form") as HTMLFormElement).noValidate).toBe(false);
  });
  it("keeps repeated search forms uniquely labelled and preserves the selected room", () => {
    render(<><BookingSearchForm initial={{ roomType: "Ocean Suite" }}/><BookingSearchForm compact/></>);
    const inputs = screen.getAllByLabelText("Check in");
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(document.querySelector<HTMLInputElement>('input[name="roomType"]')?.value).toBe("Ocean Suite");
    expect(screen.getAllByRole("button", { name: "Check availability" })).toHaveLength(2);
  });
  it("starts empty on the landing hero and reports intent once dates are picked", () => {
    const intents: Array<{ checkIn: string; checkOut: string; guests: number }> = [];
    render(<BookingSearchForm emptyDates onIntentChange={(value) => intents.push(value)} />);
    expect((screen.getByLabelText("Check in") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Check out") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Check in"), { target: { value: "2099-09-06" } });
    expect((screen.getByLabelText("Check out") as HTMLInputElement).value).toBe("2099-09-07");
    expect(intents.at(-1)).toEqual({ checkIn: "2099-09-06", checkOut: "2099-09-07", guests: 2 });
  });
});
