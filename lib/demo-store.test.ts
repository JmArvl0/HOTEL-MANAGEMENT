import { expect, it } from "vitest";
import { demoStore } from "@/lib/demo-store";

it("seeds a Billing folio for every demo booking", () => {
  const invoiceReservations = new Set(demoStore.invoices.map(invoice => String(invoice.reservation_id)));
  expect(demoStore.reservations.filter(reservation => !invoiceReservations.has(String(reservation.id))).map(reservation => reservation.id)).toEqual([]);
});
