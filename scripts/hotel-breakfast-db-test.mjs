// Disposable loopback clone. Replay backend-remediation-db-test.mjs first.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
const value = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
const query = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const test = async (name, run) => { await run(); console.log(`PASS ${name}`); };

try {
  const dates = await query("select (hotel_today()+20)::text cin,(hotel_today()+21)::text first,(hotel_today()+22)::text cout");
  const details = (fixture) => ({ roomType: fixture.type, checkIn: dates.cin, checkOut: dates.cout, guests: 2, firstName: "Breakfast", lastName: "Guest", email: `${fixture.tag}@example.invalid`, mobile: "+639170000000" });
  const offer = async (fixture, mode = "optional", priceMinor = 45000) => {
    const roomType = await query("select id from room_types where name=$1", [fixture.type]);
    const id = await value("hotel_propose_breakfast", { p_actor: fixture.users.manager, p_room_type: roomType.id, p_offer: { mode, priceMinor, firstDay: dates.first, lastDay: dates.cout, start: "06:30", end: "10:00", venue: "Test Dining" } });
    await assert.rejects(value("hotel_decide_breakfast", { p_actor: fixture.users.manager, p_offer: id, p_publish: true }), /BREAKFAST_FORBIDDEN/);
    await value("hotel_decide_breakfast", { p_actor: fixture.users.owner, p_offer: id, p_publish: true });
    return id;
  };
  const hold = (f, id = null, replace = null, detail = details(f)) => value("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: f.rooms[0].id, p_details: detail, p_offer: id, p_replace: replace });
  const readHold = token => query("select subtotal::text,total::text,deposit_required::text,breakfast_snapshot,status from booking_holds where token=$1", [token]);
  await db.query("update reservation_deposit_policies set enabled=true,calculation_type='percentage',percentage_basis_points=3000 where key='online_reservation'");

  await test("current booking attempts preserve breakfast through concurrent retries and Xendit settlement", async () => {
    await db.query("update hotel_operational_policies set deposit_method='xendit' where key='default'");
    const f = await hotelFixture(db, 1);
    const offerId = await offer(f);
    const attempt = { p_user: f.users.guest, p_attempt: randomUUID(),
      p_details: { ...details(f), roomId: f.rooms[0].id, breakfastOfferId: offerId }, p_breakfast_enabled: true };
    const other = await suite.connect();
    let created;
    try {
      const both = await Promise.all([
        value("create_booking_hold_attempt", attempt),
        value("create_booking_hold_attempt", attempt, other),
      ]);
      assert.equal(both[0].token, both[1].token);
      assert.deepEqual(both.map(result => result.replayed).sort(), [false, true]);
      created = both[0];
    } finally { await other.end(); }
    assert.equal((await readHold(created.token)).total, "2000.00");
    assert.equal((await readHold(created.token)).deposit_required, "600.00");
    assert.equal((await value("read_booking_hold_attempt", {
      p_user: f.users.guest, p_attempt: attempt.p_attempt, p_details: attempt.p_details,
    })).token, created.token);
    assert.equal((await value("create_booking_hold_attempt", { ...attempt, p_breakfast_enabled: false })).token, created.token);
    await assert.rejects(value("create_booking_hold_attempt", {
      ...attempt, p_details: { ...attempt.p_details, breakfastOfferId: randomUUID() },
    }), /RETRY_PAYLOAD_CONFLICT/);
    const checkout = await value("hotel_begin_xendit_checkout", {
      p_token: created.token, p_user_id: f.users.guest, p_channel: "GCASH",
    });
    assert.equal(Number(checkout.amount), 600);
    const session = `ps-${randomUUID()}`;
    await value("hotel_attach_xendit_session", {
      p_reference: checkout.reference, p_session: session,
      p_url: `https://dev.xen.to/${randomUUID()}`, p_expires: checkout.expiresAt, p_amount: checkout.amount,
    });
    await value("hotel_process_xendit_event", {
      p_event: "payment_session.completed", p_reference: checkout.reference, p_session: session,
      p_amount: checkout.amount, p_currency: "PHP", p_transaction: `py-${checkout.paymentId}`, p_channel: "GCASH",
    });
    const stay = await query("select status,total::text,breakfast_snapshot from reservations where id=$1", [checkout.reservationId]);
    assert.equal(stay.status, "confirmed");
    assert.equal(stay.total, "2000.00");
    assert.equal(stay.breakfast_snapshot.offerId, offerId);
    assert.equal((await query("select count(*)::int n from hotel_breakfast_days where reservation_id=$1", [checkout.reservationId])).n, 2);
  });

  await test("room-only, optional, changed and included offers price inside the exact hold", async () => {
    const f = await hotelFixture(db, 1);
    const id = await offer(f);
    const first = await hold(f);
    assert.equal((await readHold(first)).total, "200.00");
    await assert.rejects(hold(f, randomUUID(), first), /BREAKFAST_OFFER_CHANGED/);
    assert.equal((await readHold(first)).status, "active");
    const second = await hold(f, id, first);
    const selected = await readHold(second);
    assert.deepEqual([selected.subtotal, selected.total, selected.deposit_required], ["200.00", "2000.00", "600.00"]);
    assert.deepEqual([selected.breakfast_snapshot.firstDate, selected.breakfast_snapshot.lastDate], [dates.first, dates.cout]);
    const included = await offer(f, "included", 0);
    const kept = await hold(f, id, second);
    assert.equal((await readHold(kept)).total, "2000.00");
    await assert.rejects(hold(f, null, kept), /BREAKFAST_OFFER_CHANGED/);
    const free = await hold(f, included, kept);
    assert.equal((await readHold(free)).total, "200.00");
    assert.equal((await readHold(free)).breakfast_snapshot.mode, "included");
    await assert.rejects(value("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: null, p_details: { ...details(f), checkOut: dates.first }, p_offer: included, p_replace: null }), /BREAKFAST_EXACT_ROOM_REQUIRED/);
    await db.query("update booking_holds set status='expired' where token=$1", [free]);
    await assert.rejects(value("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: null, p_details: details(f), p_offer: null, p_replace: null }), /BREAKFAST_EXACT_ROOM_REQUIRED/);
  });

  await test("manual conversion creates each date exactly once and preserves paid amount", async () => {
    const f = await hotelFixture(db, 1);
    await db.query("update hotel_operational_policies set deposit_method='manual' where key='default'");
    const token = await hold(f, await offer(f));
    const args = { p_token: token, p_user_id: f.users.guest, p_payment_method: "manual_gcash", p_payment_reference: randomUUID(), p_proof_storage_path: `submitted/${token}/${randomUUID()}.png`, p_proof_original_name: "synthetic.png", p_proof_mime_type: "image/png", p_proof_size_bytes: 8 };
    const { reservation_id: id } = (await rpc(db, "submit_reservation_deposit", args))[0];
    assert.equal((await rpc(db, "submit_reservation_deposit", args))[0].reservation_id, id);
    assert.equal((await query("select count(*)::int n from hotel_breakfast_days where reservation_id=$1", [id])).n, 2);
    const invoice = await query("select amount::text from invoices where reservation_id=$1", [id]);
    assert.equal(invoice.amount, "2000.00");
    const payment = await query("select id,amount::text from payments where reservation_id=$1", [id]);
    assert.equal(payment.amount, "600.00");
    await rpc(db, "verify_reservation_deposit", { p_payment_id: payment.id, p_staff_user_id: f.users.accounting });
    assert.equal((await query("select status from reservations where id=$1", [id])).status, "confirmed");
    await assert.rejects(db.query("update reservations set check_out=check_out+1 where id=$1", [id]), /BREAKFAST_AMENDMENT_UNAVAILABLE/);
  });

  await test("gateway uses the frozen amount and fixed deposits are capped", async () => {
    const f = await hotelFixture(db, 1);
    await db.query("update reservation_deposit_policies set calculation_type='fixed',fixed_amount=3000 where key='online_reservation'");
    await db.query("update hotel_operational_policies set deposit_method='paymongo' where key='default'");
    const token = await hold(f, await offer(f));
    assert.equal((await readHold(token)).deposit_required, "2000.00");
    const reference = randomUUID();
    const { reservation_id: id } = (await rpc(db, "submit_gateway_deposit", { p_token: token, p_user_id: f.users.guest, p_gateway_ref: reference }))[0];
    const payment = await query("select id,amount::text from payments where reservation_id=$1", [id]);
    assert.equal(payment.amount, "2000.00");
    await rpc(db, "confirm_gateway_payment", { p_payment_id: payment.id, p_gateway_ref: reference, p_webhook_id: randomUUID() });
    const stay = await query("select status,breakfast_snapshot from reservations where id=$1", [id]);
    assert.equal(stay.status, "confirmed");
    assert.equal(stay.breakfast_snapshot.guests, 2);
  });

  await test("verification is read-only, partial service replays safely and concurrent requests cannot overuse a pass", async () => {
    const f = await hotelFixture(db);
    const stay = await query(`insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,breakfast_snapshot)
      values($1,$2,'Synthetic guest',$3,hotel_today()-1,hotel_today(),'confirmed',100,
        jsonb_build_object('timezone','Asia/Manila','start','00:00','end','24:00')) returning id`, [f.guest, f.users.guest, f.type]);
    const day = await query("insert into hotel_breakfast_days(reservation_id,service_date,allowance) values($1,hotel_today(),2) returning pass_code", [stay.id]);
    const args = { p_code: day.pass_code, p_staff: f.users.front_desk, p_outlet: null };
    const service = (change = {}, client = db) => value("hotel_breakfast_service", { ...args, ...change }, client);
    assert.equal((await service()).remaining, 2);
    assert.equal((await service()).remaining, 2);
    await db.query("update reservations set status='checked_out',checked_out_at=now()-interval '1 day' where id=$1", [stay.id]);
    assert.equal((await service()).status, "ineligible");
    await db.query("update reservations set checked_out_at=now() where id=$1", [stay.id]);
    assert.equal((await service()).status, "valid");
    await db.query("update reservations set status='confirmed' where id=$1", [stay.id]);
    assert.equal((await service({ p_code: "checkin-only" })).status, "invalid");
    await assert.rejects(service({ p_staff: f.users.guest }), /BREAKFAST_FORBIDDEN/);
    const requestId = randomUUID();
    assert.equal((await service({ p_quantity: 1, p_request: requestId })).remaining, 1);
    assert.equal((await service({ p_quantity: 1, p_request: requestId })).replayed, true);
    assert.equal((await service({ p_quantity: 2, p_request: requestId })).status, "conflict");
    const second = await suite.connect();
    try {
      const both = await Promise.all([service({ p_quantity: 1, p_request: randomUUID() }), service({ p_staff: null, p_outlet: "test-outlet", p_quantity: 1, p_request: randomUUID() }, second)]);
      assert.deepEqual(both.map(item => item.status).sort(), ["recorded", "used"]);
    } finally { await second.end(); }
    assert.equal((await query("select used from hotel_breakfast_days where pass_code=$1", [day.pass_code])).used, 2);
    assert.equal((await query("select count(*)::int n from hotel_breakfast_redemptions b join hotel_breakfast_days d on d.id=b.day_id where d.pass_code=$1", [day.pass_code])).n, 2);
    await db.query("update reservations set status='cancelled' where id=$1", [stay.id]);
    assert.equal((await service()).status, "ineligible");
    assert.equal((await service({ p_quantity: 1, p_request: requestId })).replayed, true);
  });

  await test("future days and pending reservations cannot redeem a saved pass", async () => {
    const f = await hotelFixture(db);
    const id = await offer(f);
    const token = await hold(f, id);
    const { reservation_id: stay } = (await rpc(db, "submit_gateway_deposit", { p_token: token, p_user_id: f.users.guest, p_gateway_ref: randomUUID() }))[0];
    const { pass_code } = await query("select pass_code from hotel_breakfast_days where reservation_id=$1 order by service_date limit 1", [stay]);
    const verify = () => value("hotel_breakfast_service", { p_code: pass_code, p_staff: f.users.front_desk, p_outlet: null });
    assert.equal((await verify()).status, "ineligible");
    await db.query("update reservations set status='confirmed' where id=$1", [stay]);
    assert.equal((await verify()).status, "outside_service");
  });
} finally { await suite.close(); }
