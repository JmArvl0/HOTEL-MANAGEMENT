// Real PostgreSQL acceptance tests. Run only against the dedicated local scratch
// database created from the migrations (see docs/ROLE-IMPROVEMENT-IMPLEMENTATION.md).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = process.env.ROLE_TEST_DB_NAME || "role_improvements_test";
assert.ok(["role_improvements_test", "role_improvements_fresh_test"].includes(database), "Use a dedicated local test database.");
const config = { host: "127.0.0.1", port: 55439, user: process.env.ROLE_TEST_DB_USER || "CodexSandboxOffline", database };
const c = new pg.Client(config);
await c.connect();
assert.equal((await c.query("select current_database() db")).rows[0].db, database);
let passed = 0;
const q = (sql, args) => c.query(sql, args);
async function expectError(sql, args, expected) {
  await q("savepoint expected_error");
  try { await q(sql, args); throw new Error(`Expected ${expected}`); }
  catch (e) { assert.ok(e.message.includes(expected), `${expected}: ${e.message}`); }
  finally { await q("rollback to savepoint expected_error"); await q("release savepoint expected_error"); }
}
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const ids = Object.fromEntries(["manager", "front_desk", "accounting", "housekeeping", "maintenance", "guest", "admin", "owner"].map(r => [r, randomUUID()]));
const token = randomUUID().slice(0, 8);
try {
  await q("begin");
  for (const [role, id] of Object.entries(ids)) await q("insert into user_accounts(id,email,name,role,password_hash) values($1,$2,$3,$4,'invalid-test-only')", [id, `${role}-${token}@example.invalid`, `Test ${role}`, role]);
  const reservation = `TEST-R-${token}`;
  await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Test guest','Test type',current_date,current_date+1,'confirmed',1000)", [reservation, ids.guest]);
  const invoice = `TEST-I-${token}`;
  await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Test guest',1000,1000,'unpaid')", [invoice, reservation]);

  let shift;
  await test("shared drawer opens, accepts another cashier, closes and starts a new shift", async () => {
    const result = await q("select accounting_open_cash_shift($1,'Test drawer',100) value", [ids.front_desk]); shift = result.rows[0].value.shiftId;
    await expectError("select accounting_open_cash_shift($1,'Second drawer',0)", [ids.accounting], "CASH_SHIFT_ALREADY_OPEN");
    await expectError("select accounting_open_cash_shift($1,'Wrong role',0)", [ids.manager], "CASH_SHIFT_FORBIDDEN");
    const key = randomUUID(); const args = [reservation, 200, "cash", null, key, ids.accounting];
    const first = (await q("select * from record_staff_payment($1,$2,$3,$4,$5,$6,false,false)", args)).rows[0];
    const again = (await q("select * from record_staff_payment($1,$2,$3,$4,$5,$6,false,false)", args)).rows[0];
    assert.equal(first.payment_id, again.payment_id);
    await expectError("select * from record_staff_payment($1,201,$2,null,$3,$4,false,false)", [reservation, "cash", key, ids.accounting], "IDEMPOTENCY_CONFLICT");
    const closeKey = randomUUID();
    const closed = (await q("select accounting_close_cash_shift($1,300,'Count checked',$2,$3) value", [shift, closeKey, ids.front_desk])).rows[0].value;
    assert.equal(closed.expectedCash, 300); assert.equal(closed.variance, 0);
    await q("select accounting_close_cash_shift($1,300,'Count checked',$2,$3)", [shift, closeKey, ids.front_desk]);
    await expectError("select * from record_staff_payment($1,1,'cash',null,$2,$3,false,true)", [reservation, randomUUID(), ids.front_desk], "CASH_SHIFT_REQUIRED");
    await q("select * from record_staff_payment($1,1,'card','test-ref',$2,$3,false,false)", [reservation, randomUUID(), ids.front_desk]);
    shift = (await q("select accounting_open_cash_shift($1,'Next drawer',0) value", [ids.accounting])).rows[0].value.shiftId;
  });

  const item = `TEST-STOCK-${token}`, po = randomUUID();
  await q("insert into inventory(id,name,category,quantity,reorder_point,unit) values($1,'Test towels','Amenities',0,1,'pieces')", [item]);
  await q("insert into purchase_orders(id,status,total,items) values($1,'approved',10,$2)", [po, JSON.stringify([{ itemId: item, name: "Test towels", quantity: 10, unit: "pieces" }])]);
  await test("partial deliveries maintain outstanding quantities and retries never double stock", async () => {
    const args = [po, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 6 }]), 1];
    const r = (await q("select inventory_receive_purchase_order($1,$2,$3,$4) value", args)).rows[0].value;
    assert.equal(r.status, "partially_received");
    await q("select inventory_receive_purchase_order($1,$2,$3,$4)", args);
    assert.equal(Number((await q("select quantity from inventory where id=$1", [item])).rows[0].quantity), 6);
    await expectError("select inventory_receive_purchase_order($1,$2,$3,2)", [po, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 5 }])], "PO_INVALID_RECEIVED_QTY");
    await expectError("select inventory_receive_purchase_order($1,$2,$3,2)", [po, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 0.5 }])], "PO_INVALID_RECEIVED_QTY");
    await expectError("select inventory_receive_purchase_order($1,$2,'[]',2)", [po, ids.housekeeping], "PO_INVALID_RECEIVED_QTY");
    await expectError("select inventory_receive_purchase_order($1,$2,$3,2)", [po, ids.front_desk, JSON.stringify([{ itemId: item, quantity: 4 }])], "PO_RECEIVE_FORBIDDEN");
    const finished = (await q("select inventory_receive_purchase_order($1,$2,$3,2) value", [po, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 4 }])])).rows[0].value;
    assert.equal(finished.status, "received");
    assert.equal(Number((await q("select quantity from inventory where id=$1", [item])).rows[0].quantity), 10);
    assert.equal((await q("select count(*)::int n from purchase_order_receipts where po_id=$1", [po])).rows[0].n, 2);
  });

  await test("a guest withdraws one owned pending line without approving or withdrawing its sibling", async () => {
    const batch = randomUUID(), request = randomUUID(), sibling = randomUUID();
    await q("insert into guest_requests(id,reservation_id,request,department,batch_id) values($1,$3,'Test request','front_desk',$4),($2,$3,'Sibling','front_desk',$4)", [request, sibling, reservation, batch]);
    await expectError("select customer_withdraw_guest_request($1,$2,2)", [ids.guest, request], "REQUEST_STALE");
    await expectError("select customer_withdraw_guest_request($1,$2,1)", [ids.manager, request], "CUSTOMER_ACCESS_REQUIRED");
    await q("select customer_withdraw_guest_request($1,$2,1)", [ids.guest, request]);
    await q("select customer_withdraw_guest_request($1,$2,1)", [ids.guest, request]);
    await expectError("insert into housekeeping_tasks(room_number,task,source_type,source_id) values('Test','Withdrawn work','guest_request',$1)", [request], "REQUEST_WITHDRAWN");
    assert.equal((await q("select approval_status from guest_requests where id=$1", [request])).rows[0].approval_status, "withdrawn");
    assert.equal((await q("select approval_status from guest_requests where id=$1", [sibling])).rows[0].approval_status, "pending");
    await q("select front_desk_review_guest_request_batch($1,$2,'approve',null)", [ids.front_desk, batch]);
    assert.equal((await q("select approval_status from guest_requests where id=$1", [request])).rows[0].approval_status, "withdrawn");
    await expectError("select customer_withdraw_guest_request($1,$2,2)", [ids.guest, sibling], "WITHDRAWAL_NOT_PERMITTED");
  });

  await test("overnight roster blocks overlap; handovers require acknowledgement before resolution", async () => {
    const roster = randomUUID(), start = "2030-01-01T22:00:00+08:00", end = "2030-01-02T06:00:00+08:00";
    await q("select save_roster_assignment($1,$2,$3,$4,'Night coverage',$5)", [ids.manager, ids.front_desk, start, end, roster]);
    await expectError("select save_roster_assignment($1,$2,$3,$4,'Overlap',$5)", [ids.manager, ids.front_desk, start, end, randomUUID()], "ROSTER_OVERLAP");
    await expectError("select save_roster_assignment($1,$2,$3,$4,'Wrong role',$5)", [ids.admin, ids.front_desk, start, end, randomUUID()], "ROSTER_FORBIDDEN");
    const h = randomUUID();
    await q("select submit_shift_handover($1,$2,'Follow up arrival','reservation',$3,$1)", [ids.front_desk, h, reservation]);
    await expectError("select act_shift_handover($1,$2,1,'resolve','Done')", [ids.front_desk, h], "INVALID_HANDOVER_TRANSITION");
    await q("select act_shift_handover($1,$2,1,'acknowledge',null)", [ids.front_desk, h]);
    await q("select act_shift_handover($1,$2,2,'resolve','Guest contacted')", [ids.front_desk, h]);
    assert.ok((await q("select resolved_at from shift_handovers where id=$1", [h])).rows[0].resolved_at);
  });

  await test("linked preventive work advances service once and only after completion", async () => {
    const asset = randomUUID();
    await q("insert into maintenance_assets(id,name,category,service_interval_days) values($1,'Test pump','Equipment',30)", [asset]);
    const order = (await q("select create_asset_work($1,$2,$3) id", [ids.manager, asset, ids.maintenance])).rows[0].id;
    assert.equal((await q("select create_asset_work($1,$2,$3) id", [ids.manager, asset, ids.maintenance])).rows[0].id, order);
    await expectError("select record_linked_asset_service($1,$2,current_date,'Test')", [ids.maintenance, order], "SERVICE_WORK_NOT_COMPLETED");
    await q("select maintenance_start_work_order($1,$2)", [order, ids.maintenance]);
    await q("update maintenance_orders set diagnosis='Preventive inspection' where id=$1", [order]);
    await q("select maintenance_resolve_work_order($1,'Service complete',false,$2)", [order, ids.maintenance]);
    await q("select maintenance_close_work_order($1,$2)", [order, ids.maintenance]);
    await q("select record_linked_asset_service($1,$2,(now() at time zone 'Asia/Manila')::date,'Inspected and cleaned')", [ids.maintenance, order]);
    await q("select record_linked_asset_service($1,$2,(now() at time zone 'Asia/Manila')::date,'Retry')", [ids.maintenance, order]);
    assert.equal((await q("select count(*)::int n from maintenance_asset_work where order_id=$1 and serviced_at is not null", [order])).rows[0].n, 1);
  });

  await test("Lost & Found preserves custody and requires Manager authorization before verified release", async () => {
    const id = randomUUID();
    await q("select record_found_item($1,$2,'Test blue bag','Lobby',now())", [ids.housekeeping, id]);
    await q("select act_found_item($1,$2,1,'secure','Locker A',false)", [ids.housekeeping, id]);
    await expectError("select act_found_item($1,$2,2,'release','Unapproved release',true)", [ids.front_desk, id], "INVALID_FOUND_TRANSITION");
    await q("select act_found_item($1,$2,2,'claim','Claim reference 123',false)", [ids.front_desk, id]);
    await q("select act_found_item($1,$2,3,'authorize_release','Claim checked',false)", [ids.manager, id]);
    await expectError("select act_found_item($1,$2,4,'release','No verification',false)", [ids.front_desk, id], "INVALID_FOUND_TRANSITION");
    await q("select act_found_item($1,$2,4,'release','Claimant verified',true)", [ids.front_desk, id]);
    assert.equal((await q("select status from lost_found_items where id=$1", [id])).rows[0].status, "released");
    assert.equal((await q("select count(*)::int n from lost_found_events where item_id=$1", [id])).rows[0].n, 5);
  });
  await test("non-operational roles cannot execute roster, receiving, handover or custody actions", async () => {
    for (const role of ["owner", "admin", "guest"]) {
      await expectError("select save_roster_assignment($1,$2,now(),now()+interval '8 hours','Test',$3)", [ids[role], ids.front_desk, randomUUID()], "ROSTER_FORBIDDEN");
      await expectError("select submit_shift_handover($1,$2,'Test source','reservation',$3,$4)", [ids[role], randomUUID(), reservation, ids.front_desk], "HANDOVER_FORBIDDEN");
      await expectError("select record_found_item($1,$2,'Test bag','Lobby',now())", [ids[role], randomUUID()], "LOST_FOUND_FORBIDDEN");
    }
    await q("set local role authenticated");
    await expectError("select customer_withdraw_guest_request($1,$2,1)", [ids.guest, randomUUID()], "permission denied");
    await q("reset role");
  });
  await test("cash exception investigation preserves the historical payment and guards stale notes", async () => {
    const payment = randomUUID();
    // Simulate a pre-fix historical record only in this disposable local fixture transaction.
    await q("alter table payments disable trigger payments_require_open_drawer");
    await q("insert into payments(id,invoice_id,reservation_id,amount,method,reference,purpose,status,received_by) values($1,$2,$3,25,'cash','TEST-LEGACY','stay_payment','paid',$4)", [payment, invoice, reservation, ids.front_desk]);
    await q("alter table payments enable trigger payments_require_open_drawer");
    await expectError("select review_cash_exception($1,$2,'Checked receipt',0)", [ids.front_desk, payment], "RECONCILIATION_FORBIDDEN");
    await q("select review_cash_exception($1,$2,'Receipt and physical custody checked',0)", [ids.accounting, payment]);
    await expectError("select review_cash_exception($1,$2,'Stale note',0)", [ids.accounting, payment], "CASH_EXCEPTION_STALE");
    const row = (await q("select amount,cash_shift_id,status from payments where id=$1", [payment])).rows[0];
    assert.equal(Number(row.amount), 25); assert.equal(row.cash_shift_id, null); assert.equal(row.status, "paid");
  });
  await q("rollback");
  console.log(`${passed} PostgreSQL acceptance scenarios passed; fixture transaction rolled back.`);

  // Independent connections test real lock behavior. These synthetic fixtures
  // persist only in the dedicated local scratch database, never the configured app DB.
  const worker = new pg.Client(config);
  await worker.connect();
  try {
    for (const role of ["front_desk", "accounting", "housekeeping", "manager"]) await q("insert into user_accounts(id,email,name,role,password_hash) values($1,$2,$3,$4,'invalid-test-only')", [ids[role], `${role}-concurrent-${token}@example.invalid`, `Test ${role}`, role]);
    await q("insert into reservations(id,guest_name,room_type,check_in,check_out,status,total) values($1,'Concurrent test','Test',current_date,current_date+1,'confirmed',1000)", [reservation]);
    await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Concurrent test',1000,1000,'unpaid')", [invoice, reservation]);
    await q("insert into inventory(id,name,category,quantity,reorder_point,unit) values($1,'Concurrent stock','Amenities',0,1,'pieces')", [item]);
    const concurrentPo = randomUUID();
    await q("insert into purchase_orders(id,status,total,items) values($1,'approved',10,$2)", [concurrentPo, JSON.stringify([{ itemId: item, name: "Stock", quantity: 10, unit: "pieces" }])]);
    await test("concurrent deliveries never exceed the PO balance", async () => {
      const receive = "select inventory_receive_purchase_order($1,$2,$3,1)";
      const results = await Promise.allSettled([
        q(receive, [concurrentPo, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 6 }])]),
        worker.query(receive, [concurrentPo, ids.housekeeping, JSON.stringify([{ itemId: item, quantity: 5 }])])
      ]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const stock = Number((await q("select quantity from inventory where id=$1", [item])).rows[0].quantity);
      assert.ok(stock === 5 || stock === 6);
      assert.equal((await q("select count(*)::int n from purchase_order_receipts where po_id=$1", [concurrentPo])).rows[0].n, 1);
    });
    await test("a payment waiting behind drawer closure is rejected without an unattributed record", async () => {
      const open = (await q("select accounting_open_cash_shift($1,'Concurrency test',0) value", [ids.front_desk])).rows[0].value.shiftId;
      await q("begin");
      await q("select accounting_close_cash_shift($1,0,'Concurrent test',$2,$3)", [open, randomUUID(), ids.front_desk]);
      const key = randomUUID();
      const pending = worker.query("select * from record_staff_payment($1,10,'cash',null,$2,$3,false,false)", [reservation, key, ids.accounting]).then(() => "unexpected success", e => e.message);
      await q("commit");
      assert.ok((await pending).includes("CASH_SHIFT_REQUIRED"));
      assert.equal((await q("select count(*)::int n from payments where idempotency_key=$1", [key])).rows[0].n, 0);
    });
    await test("drawer closure includes a cash payment committed by another connection", async () => {
      const open = (await q("select accounting_open_cash_shift($1,'Concurrency test',0) value", [ids.front_desk])).rows[0].value.shiftId;
      await worker.query("begin");
      await worker.query("select * from record_staff_payment($1,10,'cash',null,$2,$3,false,false)", [reservation, randomUUID(), ids.accounting]);
      const closing = q("select accounting_close_cash_shift($1,10,'Count checked',$2,$3) value", [open, randomUUID(), ids.front_desk]);
      await worker.query("commit");
      assert.equal((await closing).rows[0].value.expectedCash, 10);
    });
    console.log(`${passed} total PostgreSQL scenarios passed, including real concurrent connections.`);
  } finally { await worker.query("rollback").catch(() => {}); await worker.end(); }
} catch (e) {
  await q("rollback"); console.error(e.message); process.exitCode = 1;
} finally { await c.end(); }
