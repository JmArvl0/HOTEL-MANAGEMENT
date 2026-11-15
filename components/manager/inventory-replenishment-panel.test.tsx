// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PurchaseOrderList, { type PoOrder } from "./inventory-replenishment-panel";

afterEach(cleanup);

it("accepts only outstanding whole quantities and submits only the items delivered", async () => {
  const order: PoOrder = {
    id: "po-partial", status: "partially_received", total: 150, version: 3,
    items: [
      { itemId: "towels", name: "Towels", quantity: 10, unit: "pieces" },
      { itemId: "soap", name: "Soap", quantity: 2, unit: "bars" },
      { itemId: "shampoo", name: "Shampoo", quantity: 3, unit: "bottles" },
    ],
    received_quantities: { towels: 4, soap: 2 },
  };
  const onReceive = vi.fn();
  render(<PurchaseOrderList orders={[order]} vendors={[]} onSubmit={vi.fn()} onReceive={onReceive} onCancel={vi.fn()} />);
  expect(screen.getByText(/Towels: 4 \/ 10 received/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Receive delivery" }));
  const dialog = within(await screen.findByRole("dialog"));
  const towels = dialog.getByRole<HTMLInputElement>("spinbutton", { name: /Towels.*6 pieces remaining/ });
  const confirm = dialog.getByRole("button", { name: "Confirm stock restock" });
  expect(towels.value).toBe("6");
  expect(dialog.queryByRole("spinbutton", { name: /Soap/ })).toBeNull();
  expect(dialog.getByText(/Outstanding quantities stay open for the next delivery/)).toBeTruthy();

  fireEvent.change(towels, { target: { value: "7" } });
  fireEvent.click(confirm);
  expect(await dialog.findByText("Enter a whole quantity from 0 to 6.")).toBeTruthy();
  expect(onReceive).not.toHaveBeenCalled();

  fireEvent.change(towels, { target: { value: "3" } });
  fireEvent.change(dialog.getByRole("spinbutton", { name: /Shampoo/ }), { target: { value: "0" } });
  fireEvent.click(confirm);
  await waitFor(() => expect(onReceive).toHaveBeenCalledExactlyOnceWith(order, [{ itemId: "towels", quantity: 3 }]));
});
