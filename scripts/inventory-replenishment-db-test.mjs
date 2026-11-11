// Real purchase-order receipt behavior on an owned, disposable local clone.
import assert from "node:assert/strict";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
try {
  const f = await hotelFixture(db, 1);
  const item = (await db.query("insert into inventory(name,category,quantity,reorder_point,unit,status,unit_cost) values('Receipt test','Housekeeping',1,20,'bottles','low',10) returning id")).rows[0].id;
  const items = [{ itemId: item, name: "Receipt test", quantity: 20, unit: "bottles", unitCost: 10 }];
  const order = (await db.query("insert into purchase_orders(status,total,items,ordered_by) values('draft',200,$1,$2) returning id", [JSON.stringify(items), f.users.manager])).rows[0].id;
  await rpc(db, "submit_purchase_order", { p_po_id: order, p_staff_user_id: f.users.manager, p_expected_version: 1 });
  const receipt = { p_po_id: order, p_staff_user_id: f.users.manager, p_items_received_json: [{ itemId: item, quantity: 5 }], p_expected_version: 2 };
  const first = await rpc(db, "inventory_receive_purchase_order", receipt);
  assert.equal(first[0].inventory_receive_purchase_order.status, "partially_received");
  assert.deepEqual(await rpc(db, "inventory_receive_purchase_order", receipt), first);
  const balance = await rpc(db, "inventory_receive_purchase_order", { ...receipt, p_expected_version: 3, p_items_received_json: [{ itemId: item, quantity: 15 }] });
  assert.equal(balance[0].inventory_receive_purchase_order.status, "received");
  const stock = (await db.query("select quantity,status from inventory where id=$1", [item])).rows[0];
  assert.equal(Number(stock.quantity), 21, "receipt increments the stock quantity");
  assert.equal(stock.status, "healthy", "stock above its reorder point must stop reporting low after receipt");
  assert.equal(Number((await db.query("select quantity from inventory where id=$1", [item])).rows[0].quantity), 21, "a repeated receipt cannot restock twice");
  assert.equal(Number((await db.query("select count(*) n from inventory_movements where source_type='purchase_order' and source_id=$1", [order])).rows[0].n), 2, "each delivery creates one movement");
  console.log(JSON.stringify({ checksPassed: 7, scope: "Local PostgreSQL partial receipt, stock status and replay checks" }));
} finally {
  await suite.close();
}
