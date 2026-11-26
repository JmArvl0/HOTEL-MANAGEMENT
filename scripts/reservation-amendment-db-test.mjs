// Run against a migrated, disposable loopback PostgreSQL template.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
const row = async (query, args = []) => (await db.query(query, args)).rows[0];
const call = async (name, args) => (await rpc(db, name, args))[0][name];
const count = async (query, args) => Number((await row(query, args)).count);
const day = async (offset) => (await row("select (hotel_today()+$1::int)::text as hotel_date", [offset])).hotel_date;
const booking = (id) => row("select id,room_id,room_number,room_type,check_in::text,check_out::text,total::int,deposit_required::int,guests,nightly_rates,status,special_requests from reservations where id=$1", [id]);
const assignment = (id) => row("select id,room_id,check_in::text,check_out::text,effective_from::text from reservation_room_assignments where reservation_id=$1 and status='active'", [id]);
const folio = (id) => row("select id,amount::int,paid::int,balance::int,credit_balance::int,status from invoices where reservation_id=$1", [id]);
const hold = (f, cin, cout, user = f.users.guest, room = f.rooms[0].id) => call("hotel_create_breakfast_booking_hold", {
  p_user: user, p_room: room, p_details: {
    roomType: f.type, checkIn: cin, checkOut: cout, guests: 2,
    firstName: "Fixture", lastName: "Guest", email: `${f.tag}@example.invalid`, mobile: "+639170000000",
  }, p_offer: null, p_replace: null,
});
const checkout = async (offset = 30, choice = "deposit") => {
  const f = await hotelFixture(db);
  const token = await hold(f, await day(offset), await day(offset + 2));
  const attempt = await call("hotel_begin_xendit_checkout", {
    p_token: token, p_user_id: f.users.guest, p_channel: "GCASH", p_payment_choice: choice,
  });
  return { ...f, token, attempt, id: attempt.reservationId, offset };
};
const attach = async ({ attempt }) => {
  const session = `ps-${randomUUID()}`;
  await call("hotel_attach_xendit_session", {
    p_reference: attempt.reference, p_session: session, p_url: `https://dev.xen.to/${randomUUID()}`,
    p_expires: attempt.expiresAt, p_amount: attempt.amount,
  });
  return session;
};
const settle = ({ attempt }, session) => call("hotel_process_xendit_event", {
  p_event: "payment_session.completed", p_reference: attempt.reference, p_session: session,
  p_amount: attempt.amount, p_currency: "PHP", p_transaction: `py-${attempt.paymentId}`, p_channel: "GCASH",
});
const confirmed = async (offset, choice) => {
  const f = await checkout(offset, choice);
  const session = await attach(f);
  assert.equal((await settle(f, session)).outcome, "confirmed");
  return { ...f, session };
};
const amend = (f, fields = {}) => call("customer_request_reservation_change", {
  p_user_id: f.users.guest, p_reservation_id: f.id, p_check_in: null, p_check_out: null,
  p_room_type: null, p_guests: null, p_special_requests: null, p_reason: "Fixture reservation change",
  p_idempotency_key: randomUUID(), ...fields,
});
const approve = async (f, result) => {
  const current = await row("select version from manager_approval_requests where id=$1", [result.managerApprovalId]);
  return call("review_manager_approval", {
    p_approval_id: result.managerApprovalId, p_decision: "approve", p_reason: "Confirmed the guest's change",
    p_expected_version: current.version, p_manager_user_id: f.users.manager,
  });
};
const execute = (f, result, room = null) => call("front_desk_execute_manager_approval", {
  p_approval_id: result.managerApprovalId, p_room_id: room, p_staff_user_id: f.users.front_desk,
});

// Add a synthetic transport line to a pre-arrival folio to exercise the existing
// separated lodging and ancillary charge model.
const addTransportCharge = async (f, amount) => {
  const invoice = await folio(f.id);
  await db.query("insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id) values($1,$2,'Fixture transport','transportation',$3,$4,$5,'transportation',$6)",
    [invoice.id, f.id, amount, f.users.front_desk, randomUUID(), randomUUID()]);
  await db.query("update invoices set amount=amount+$1 where id=$2", [amount, invoice.id]);
  await call("sync_invoice_financials", { p_invoice_id: invoice.id });
};

let passed = 0;
const test = async (name, check) => {
  await check();
  passed++;
  console.log(`PASS ${name}`);
};

try {
  await db.query("set statement_timeout='12s'");
  await db.query("update hotel_operational_policies set deposit_method='xendit',self_service_modification_days=3 where key='default'");
  await db.query("update reservation_deposit_policies set enabled=true,calculation_type='percentage',percentage_basis_points=3000 where key='online_reservation'");

  await test("the approved guest-request workflow still routes one task and records the reviewer", async () => {
    const f = await confirmed();
    const batch = randomUUID();
    const [request] = await rpc(db, "customer_submit_guest_requests", {
      p_user_id: f.users.guest, p_reservation_id: f.id, p_request_types: "{extra_towels}",
      p_description: "Two towels", p_requested_action: {}, p_idempotency_key: batch,
    });
    assert.equal(request.status, "open");
    assert.equal(await count("select count(*) from housekeeping_tasks where guest_request_id=$1", [request.id]), 0);
    assert.equal(await call("front_desk_review_guest_request_batch", {
      p_staff_user_id: f.users.front_desk, p_batch_id: batch, p_decision: "approve", p_note: null,
    }), 1);
    assert.deepEqual(await row("select approval_status,approved_by from guest_requests where id=$1", [request.id]),
      { approval_status: "approved", approved_by: f.users.front_desk });
    assert.equal(await count("select count(*) from housekeeping_tasks where guest_request_id=$1", [request.id]), 1);
  });

  await test("notes preserve a confirmed Xendit room, its frozen prices and transport charge", async () => {
    const f = await confirmed();
    await addTransportCharge(f, 45);
    const before = { booking: await booking(f.id), assignment: await assignment(f.id), folio: await folio(f.id) };
    await db.query("update room_types set base_rate=175 where name=$1", [f.type]);
    const result = await amend(f, { p_special_requests: "Quiet room requested" });
    assert.equal(result.status, "executed");
    assert.equal(result.paymentDifference, 0);
    assert.equal(result.calculatedTotal, 245);
    assert.deepEqual(await booking(f.id), { ...before.booking, special_requests: "Quiet room requested" });
    assert.deepEqual(await assignment(f.id), before.assignment);
    assert.deepEqual(await folio(f.id), before.folio);
    assert.equal(await count("select count(*) from folio_charges where reservation_id=$1", [f.id]), 1);
  });

  await test("a pending full Xendit checkout keeps its quote and can settle after a notes edit", async () => {
    const f = await checkout(30, "full");
    await assert.rejects(amend(f, { p_check_out: await day(33) }), /MODIFICATION_PAYMENT_IN_PROGRESS/);
    const edit = await amend(f, { p_special_requests: "Extra pillows" });
    assert.equal(edit.paymentDifference, 0);
    const session = await attach(f);
    assert.equal((await settle(f, session)).outcome, "confirmed");
    assert.equal((await folio(f.id)).paid, 200);
    assert.equal((await booking(f.id)).room_id, f.rooms[0].id);
  });

  await test("an extension keeps the exact room, original nights, transport and settled payment", async () => {
    const f = await confirmed();
    await addTransportCharge(f, 45);
    const previous = await assignment(f.id);
    await db.query("update room_types set base_rate=175 where name=$1", [f.type]);
    const out = await day(33);
    const result = await amend(f, { p_check_out: out });
    assert.equal(result.status, "executed");
    assert.equal(result.paymentDifference, 175);
    assert.equal(result.calculatedTotal, 420);
    assert.deepEqual(await assignment(f.id), { ...previous, check_out: out });
    const stay = await booking(f.id);
    assert.equal(stay.total, 375);
    assert.equal(stay.deposit_required, 60);
    assert.deepEqual(stay.nightly_rates.map(({ rate }) => rate), [100, 100, 175]);
    const invoice = await folio(f.id);
    assert.equal(invoice.amount, 420);
    assert.equal(invoice.paid, 60);
    assert.equal(invoice.balance, 360);
    assert.equal((await settle(f, f.session)).outcome, "already_paid");
  });

  await test("a guest-count-only edit does not reprice or release the selected room", async () => {
    const f = await confirmed();
    const before = { booking: await booking(f.id), assignment: await assignment(f.id), folio: await folio(f.id) };
    await db.query("update room_types set base_rate=175 where name=$1", [f.type]);
    const result = await amend(f, { p_guests: 1 });
    assert.equal(result.paymentDifference, 0);
    assert.deepEqual(await booking(f.id), { ...before.booking, guests: 1 });
    assert.deepEqual(await assignment(f.id), before.assignment);
    assert.deepEqual(await folio(f.id), before.folio);
  });

  await test("approved notes update neither the assigned room nor the folio", async () => {
    const f = await confirmed(2);
    await addTransportCharge(f, 45);
    const previous = { assignment: await assignment(f.id), folio: await folio(f.id) };
    const result = await amend(f, { p_special_requests: "Late arrival note" });
    assert.equal(result.status, "pending");
    await db.query("update room_types set base_rate=175 where name=$1", [f.type]);
    assert.equal((await approve(f, result)).executionStatus, "awaiting_execution");
    assert.equal((await execute(f, result)).status, "executed");
    assert.equal((await booking(f.id)).special_requests, "Late arrival note");
    assert.deepEqual(await assignment(f.id), previous.assignment);
    assert.deepEqual(await folio(f.id), previous.folio);
  });

  await test("a conflict keeps the original room until Front Desk names a valid replacement", async () => {
    const f = await confirmed();
    const other = await hotelFixture(db);
    const previous = await assignment(f.id);
    await hold(f, await day(32), await day(33), other.users.guest);
    const result = await amend(f, { p_check_out: await day(33) });
    assert.equal(result.status, "pending");
    await approve(f, result);
    await assert.rejects(execute(f, result), /MODIFICATION_ROOM_SELECTION_REQUIRED/);
    await assert.rejects(execute(f, result, f.rooms[0].id), { message: "MODIFICATION_ROOM_HELD" });
    assert.deepEqual(await assignment(f.id), previous);
    assert.equal((await execute(f, result, f.rooms[1].number)).status, "executed");
    assert.equal((await assignment(f.id)).room_id, f.rooms[1].id);
    assert.equal((await booking(f.id)).room_id, f.rooms[1].id);
  });

  await test("a catalog price change after review does not change the authorized lodging delta", async () => {
    const f = await confirmed(2);
    const result = await amend(f, { p_check_out: await day(5) });
    await approve(f, result);
    await db.query("update room_types set base_rate=175 where name=$1", [f.type]);
    assert.equal((await execute(f, result)).status, "executed");
    const stay = await booking(f.id);
    assert.equal(stay.room_id, f.rooms[0].id);
    assert.deepEqual(stay.nightly_rates.map(({ rate }) => rate), [100, 100, 100]);
    assert.equal((await folio(f.id)).amount, 300);
  });

  await test("room-type checkout contention yields a retry without changing the booking", async () => {
    const f = await confirmed();
    const before = await booking(f.id);
    const date = await day(33);
    const other = await suite.connect();
    try {
      await other.query("begin");
      await other.query("select pg_advisory_xact_lock(hashtextextended(lower($1),0))", [f.type]);
      await assert.rejects(amend(f, { p_check_out: date }), /AMENDMENT_BUSY/);
      assert.deepEqual(await booking(f.id), before);
    } finally {
      await other.query("rollback");
      await other.end();
    }
    assert.equal((await amend(f, { p_check_out: date })).status, "executed");
  });

  console.log(`Guest request and amendment SQL scenarios passed: ${passed}`);
} finally {
  await suite.close();
}
