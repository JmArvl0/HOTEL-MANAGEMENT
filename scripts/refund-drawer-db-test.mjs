// Use the disposable loopback database template from hotel-db-test-helpers.mjs.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
const one = async (connection, name, args) => (await rpc(connection, name, args))[0];
try {
  const f = await hotelFixture(db);
  const actor = f.users.accounting;
  await db.query("update hotel_operational_policies set operating_date=hotel_today()-1 where key='default'");
  const { accounting_open_cash_shift: { shiftId } } = await one(db, "accounting_open_cash_shift", {
    p_staff_user_id: f.users.front_desk, p_location: "Test drawer", p_opening_amount: 1000,
  });

  async function refundable(amount, method) {
    const reservation = `DRAWER-${randomUUID()}`;
    await db.query("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Test guest',$3,hotel_today()+30,hotel_today()+31,'confirmed',500)", [reservation, f.users.guest, f.type]);
    await db.query("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Test guest',500,500,'unpaid')", [`${reservation}-I`, reservation]);
    await one(db, "hms_collect_payment", {
      p_reservation_id: reservation, p_amount: amount, p_method: method,
      p_reference: method === "cash" ? null : `Test collection ${reservation}`,
      p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk,
    });
    await one(db, "cancel_reservation", { p_reservation_id: reservation, p_actor_user_id: f.users.front_desk, p_reason: "Test cancellation" });
    const { rows: [refund] } = await db.query("select id, eligible_amount from refund_requests where reservation_id=$1", [reservation]);
    assert.equal(Number(refund.eligible_amount), amount);
    return refund.id;
  }

  const cashId = await refundable(200, "cash");
  const noncashId = await refundable(150, "bank_transfer");
  const staleId = await refundable(100, "bank_transfer");
  const cash = { p_refund_id: cashId, p_staff_user_id: actor, p_reference: "Test cash payout", p_payout_method: "cash", p_cash_shift_id: shiftId };
  const noncash = { ...cash, p_refund_id: noncashId, p_reference: "Test bank payout", p_payout_method: "noncash", p_cash_shift_id: null };
  await assert.rejects(one(db, "process_refund", { ...cash, p_staff_user_id: f.users.front_desk }), /REFUND_PROCESSING_FORBIDDEN/);
  await assert.rejects(one(db, "process_refund", { ...cash, p_cash_shift_id: null }), /REFUND_DRAWER_REQUIRED/);
  await assert.rejects(one(db, "process_refund", { ...cash, p_cash_shift_id: randomUUID() }), /REFUND_DRAWER_CHANGED/);
  await assert.rejects(one(db, "process_refund", { ...noncash, p_cash_shift_id: shiftId }), /INVALID_REFUND_PAYOUT/);
  assert.equal((await db.query("select count(*)::int n from refund_attempts where refund_request_id in ($1,$2)", [cashId, noncashId])).rows[0].n, 0);
  await one(db, "process_refund", noncash);

  const peer = await suite.connect();
  const { rows: [{ pid }] } = await peer.query("select pg_backend_pid() pid");
  let close;
  let settled;
  await db.query("begin");
  try {
    settled = await one(db, "process_refund", cash);
    close = one(peer, "accounting_close_cash_shift", {
      p_shift_id: shiftId, p_actual_cash: 1000, p_notes: null,
      p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk,
    });
    close.catch(() => {});
    const deadline = Date.now() + 5000;
    while (!(await db.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'", [pid])).rowCount) {
      assert.ok(Date.now() < deadline, "Drawer close waits for the in-flight payout");
      await new Promise(resolve => setTimeout(resolve, 10));
      await db.query("select pg_stat_clear_snapshot()");
    }
    await db.query("commit");
    const { accounting_close_cash_shift: closed } = await close;
    assert.equal(closed.expectedCash, 1000);
    assert.equal(closed.actualCash, 1000);
    assert.equal(closed.variance, 0);
    assert.equal(closed.cashPaidOut, 200);
  } finally {
    await db.query("rollback");
    await close?.catch(() => {});
    await peer.end();
  }
  assert.deepEqual(await one(db, "process_refund", cash), settled, "Exact retry succeeds after drawer close");
  await assert.rejects(one(db, "process_refund", { ...cash, p_reference: "Different reference" }), /REFUND_PAYOUT_CONFLICT/);
  await assert.rejects(one(db, "process_refund", { ...cash, p_payout_method: "noncash", p_cash_shift_id: null }), /REFUND_PAYOUT_CONFLICT/);
  await assert.rejects(db.query("update payments set cash_shift_id=null where idempotency_key=$1", [cashId]), /SETTLED_PAYMENT_IMMUTABLE/);
  const payments = (await db.query("select method,cash_shift_id,operating_date::text from payments where idempotency_key in ($1,$2) order by cash_shift_id nulls last", [cashId, noncashId])).rows;
  const { rows: [{ operating_date: date }] } = await db.query("select operating_date::text from hotel_operational_policies where key='default'");
  assert.deepEqual(payments, [
    { method: "manual_refund", cash_shift_id: shiftId, operating_date: date },
    { method: "manual_refund", cash_shift_id: null, operating_date: date },
  ]);
  assert.equal((await db.query("select count(*)::int n from refund_attempts where refund_request_id in ($1,$2)", [cashId, noncashId])).rows[0].n, 2);

  const { accounting_open_cash_shift: { shiftId: replacement } } = await one(db, "accounting_open_cash_shift", {
    p_staff_user_id: actor, p_location: "Replacement drawer", p_opening_amount: 0,
  });
  await assert.rejects(one(db, "process_refund", { ...cash, p_refund_id: staleId }), /REFUND_DRAWER_CHANGED/);
  assert.equal((await db.query("select status from refund_requests where id=$1", [staleId])).rows[0].status, "pending");
  await one(db, "accounting_close_cash_shift", { p_shift_id: replacement, p_actual_cash: 0, p_notes: null, p_idempotency_key: randomUUID(), p_staff_user_id: actor });
  const { rows: closedShifts } = await db.query("select id from cash_shifts where status='closed' and reconciled_at is null");
  for (const shift of closedShifts) await one(db, "accounting_reconcile_cash_shift", { p_shift_id: shift.id, p_notes: "Test review", p_staff_user_id: actor });
  const { hotel_night_audit_preview: preview } = await one(db, "hotel_night_audit_preview", { p_actor: actor });
  assert.deepEqual(preview.blockers, []);
  const { hotel_night_audit_close: closedDay } = await one(db, "hotel_night_audit_close", {
    p_date: preview.businessDate, p_version: preview.version, p_key: randomUUID(), p_actor: actor,
  });
  assert.equal(Number(closedDay.snapshot.received), 450);
  assert.equal(Number(closedDay.snapshot.refunds), 350);
  assert.equal(Number(closedDay.snapshot.netReceipts), 100);
  console.log("PASS refund role, explicit payout, exact drawer, concurrent close, immutable linkage, retry, and night audit totals");
} finally {
  await suite.close();
}
