// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PurchaseOrderList, { type PoOrder } from "./inventory-replenishment-panel";

afterEach(cleanup);

const order = (id: string, status: string): PoOrder => ({
  id, status, total: 100, version: 3,
  items: [{ itemId: "towels", name: "Towels", quantity: 10, unit: "pieces" }],
});
const orders = [
  order("po-draft", "draft"), order("po-ready", "approved"),
  { ...order("po-part1", "partially_received"), received_quantities: { towels: 4 } },
  order("po-done1", "received"), order("po-await", "pending_approval"),
  order("po-stop1", "cancelled"),
];

function renderOrders(receivingOnly = false) {
  const handlers = { onSubmit: vi.fn(), onReceive: vi.fn(), onCancel: vi.fn() };
  render(<PurchaseOrderList orders={orders} vendors={[]} receivingOnly={receivingOnly} {...handlers} />);
  return { ...handlers, panel: within(screen.getByRole("region", { name: "Purchase orders" })) };
}

describe("purchase-order workspace lifecycle", () => {
  it("filters orders and routes submit, confirmed delivery and cancel to the selected order", async () => {
    const { panel, onSubmit, onReceive, onCancel } = renderOrders();
    fireEvent.click(panel.getByRole("button", { name: /^approved/ }));
    expect(panel.getByText("PO po-ready")).toBeTruthy();
    expect(panel.queryByText("PO po-draft")).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "Receive delivery" }));
    const delivery = within(await screen.findByRole("dialog"));
    expect(onReceive).not.toHaveBeenCalled();
    fireEvent.click(delivery.getByRole("button", { name: "Confirm stock restock" }));
    await waitFor(() => expect(onReceive).toHaveBeenCalledExactlyOnceWith(orders[1], [{ itemId: "towels", quantity: 10 }]));
    fireEvent.click(panel.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith(orders[1]);

    fireEvent.click(panel.getByRole("button", { name: /^draft/ }));
    fireEvent.click(panel.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(orders[0]);

    fireEvent.click(panel.getByRole("button", { name: /^partially received/ }));
    expect(panel.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "Receive delivery" }));
    const remainder = within(await screen.findByRole("dialog"));
    expect(remainder.getByRole<HTMLInputElement>("spinbutton", { name: /Towels.*6 pieces remaining/ }).value).toBe("6");
    fireEvent.click(remainder.getByRole("button", { name: "Confirm stock restock" }));
    await waitFor(() => expect(onReceive).toHaveBeenCalledTimes(2));
    expect(onReceive).toHaveBeenLastCalledWith(orders[2], [{ itemId: "towels", quantity: 6 }]);
  });

  it("keeps completed and cancelled orders immutable and pending approval gated", () => {
    const { panel, onSubmit, onReceive, onCancel } = renderOrders();
    for (const [filter, id] of [[/^received/, "po-done1"], [/^cancelled/, "po-stop1"]] as const) {
      fireEvent.click(panel.getByRole("button", { name: filter }));
      expect(panel.getByText(`PO ${id}`)).toBeTruthy();
      expect(panel.queryByRole("button", { name: "Submit" })).toBeNull();
      expect(panel.queryByRole("button", { name: "Receive delivery" })).toBeNull();
      expect(panel.queryByRole("button", { name: "Cancel" })).toBeNull();
    }
    fireEvent.click(panel.getByRole("button", { name: /^pending approval/ }));
    expect(panel.getByText("Awaiting Owner/Admin approval")).toBeTruthy();
    expect(panel.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(panel.queryByRole("button", { name: "Receive delivery" })).toBeNull();
    expect(panel.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReceive).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("limits the receiving-only workspace to delivery actions and honours dialog cancellation", async () => {
    const { panel, onSubmit, onReceive, onCancel } = renderOrders(true);
    expect(panel.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(panel.queryByRole("button", { name: "Cancel" })).toBeNull();
    const receiveButtons = panel.getAllByRole("button", { name: "Receive delivery" });
    expect(receiveButtons).toHaveLength(2);
    fireEvent.click(receiveButtons[0]);
    const delivery = within(await screen.findByRole("dialog"));
    fireEvent.click(delivery.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReceive).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
