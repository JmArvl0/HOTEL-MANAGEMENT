// Real purchase-order receipt behavior on an owned, disposable local clone.
import assert from "node:assert/strict";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
try {
  const f = await hotelFixture(db, 1);
  const item = (await db.query("insert into inventory(name,category,quantity,reorder_point,unit,status,unit_cost) values('Receipt test','Housekeeping',1,20,'bottles','low',10) returning id")).rows[0].id;
  const other = (await db.query("insert into inventory(name,category,quantity,reorder_point,unit,status,unit_cost) values('Undelivered item','Housekeeping',1,20,'bottles','low',10) returning id")).rows[0].id;
  const items = [
    { itemId: item, name: "Receipt test", quantity: 20, unit: "bottles", unitCost: 10 },
    { itemId: other, name: "Undelivered item", quantity: 5, unit: "bottles", unitCost: 10 },
  ];
  const order = (await db.query("insert into purchase_orders(status,total,items,ordered_by) values('draft',250,$1,$2) returning id", [JSON.stringify(items), f.users.manager])).rows[0].id;
  await rpc(db, "submit_purchase_order", { p_po_id: order, p_staff_user_id: f.users.manager, p_expected_version: 1 });
  const receipt = { p_po_id: order, p_staff_user_id: f.users.manager, p_items_received_json: [{ itemId: item, quantity: 4 }], p_expected_version: 2 };
  const receive = async (args) => (await rpc(db, "inventory_receive_purchase_order", args))[0].inventory_receive_purchase_order;
  const partial = await receive(receipt);
  assert.deepEqual(partial, { status: "partially_received", version: 3, receivedQuantities: { [item]: 4 } });
  assert.equal(Number((await db.query("select quantity from inventory where id=$1", [other])).rows[0].quantity), 1);
  assert.deepEqual(await receive(receipt), partial);
  await assert.rejects(receive({ ...receipt, p_items_received_json: [{ itemId: item, quantity: 5 }] }), /PO_STALE/);
  const second = { ...receipt, p_expected_version: 3 };
  await assert.rejects(receive({ ...second, p_items_received_json: [{ itemId: other, quantity: 5 }, { itemId: item, quantity: 17 }] }), /PO_INVALID_RECEIVED_QTY/);
  assert.equal(Number((await db.query("select quantity from inventory where id=$1", [other])).rows[0].quantity), 1, "over-receipt rolls back earlier lines");
  const complete = await receive({ ...second, p_items_received_json: [{ itemId: item, quantity: 16 }, { itemId: other, quantity: 5 }] });
  assert.deepEqual(complete, { status: "received", version: 4, receivedQuantities: { [item]: 20, [other]: 5 } });
  const stock = (await db.query("select quantity,status from inventory where id=$1", [item])).rows[0];
  assert.equal(Number(stock.quantity), 21, "receipt increments the stock quantity");
  assert.equal(stock.status, "healthy", "stock above its reorder point must stop reporting low after receipt");
  assert.deepEqual(await receive(receipt), partial, "exact replay returns its original result after completion");
  assert.equal(Number((await db.query("select quantity from inventory where id=$1", [item])).rows[0].quantity), 21, "a repeated receipt cannot restock twice");
  assert.equal(Number((await db.query("select count(*) n from inventory_movements where source_type='purchase_order' and source_id=$1", [order])).rows[0].n), 3, "each accepted delivery line creates one movement");
  assert.equal(Number((await db.query("select count(*) n from purchase_order_receipts where po_id=$1", [order])).rows[0].n), 2, "only accepted deliveries create receipt history");
  console.log("PASS partial and final receipts, omitted lines, atomic over-receipt rejection, exact replay, and stock status");
} finally {
  await suite.close();
}
