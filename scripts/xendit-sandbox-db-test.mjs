// Real PostgreSQL transactions; loopback-only clone, never loads credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
let passed = 0;
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const call = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
const test = async (name, work) => { await work(); passed++; console.log(`PASS ${name}`); };
try {
  await db.query("set statement_timeout='12s'");
  await db.query("update hotel_operational_policies set deposit_method='xendit' where key='default'");
  await db.query("update reservation_deposit_policies set enabled=true,calculation_type='percentage',percentage_basis_points=3000 where key='online_reservation'");
  const dates = await row("select (hotel_today()+30)::text cin,(hotel_today()+32)::text cout");
  const hold = async (f, transportationPreferences) => call("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: f.rooms[0].id,
    p_details: { roomType: f.type, checkIn: dates.cin, checkOut: dates.cout, guests: 2, firstName: "Sandbox", lastName: "Guest", email: `${f.tag}@example.invalid`, mobile: "+639170000000", transportationPreferences }, p_offer: null, p_replace: null });
  const begin = (f, token, client = db, channel = "GCASH", paymentChoice) => call("hotel_begin_xendit_checkout", {
    p_token: token, p_user_id: f.users.guest, p_channel: channel,
    ...(paymentChoice === undefined ? {} : { p_payment_choice: paymentChoice }),
  }, client);
  const attach = async a => {
    const id = `ps-${randomUUID()}`;
    await call("hotel_attach_xendit_session", { p_reference: a.reference, p_session: id, p_url: `https://dev.xen.to/${randomUUID()}`, p_expires: a.expiresAt, p_amount: a.amount });
    return id;
  };
  const event = (a, id, type = "payment_session.completed", overrides = {}) => call("hotel_process_xendit_event", { p_event: type,
    p_reference: a.reference, p_session: id, p_amount: a.amount, p_currency: "PHP", p_transaction: type.endsWith("completed") ? `py-${a.paymentId}` : null, p_channel: "GCASH", ...overrides });
  const fresh = async () => { const f = await hotelFixture(db, 1); const token = await hold(f); const a = await begin(f, token); return { f, token, a }; };
  const trips = async id => (await db.query("select * from transportation_requests where reservation_id=$1", [id])).rows;
  const ride = (serviceType) => ({
    serviceType, passengerCount: 2, pickupTime: "10:30",
    pickupDate: serviceType === "DROPOFF" ? dates.cout : dates.cin,
    ...(serviceType === "DROPOFF" ? { dropoffLocation: "Airport Terminal 1" } : { pickupLocation: "Airport Terminal 3" }),
    ...(serviceType === "ROUND_TRIP" ? { returnLocation: "Airport Terminal 1", returnDate: dates.cout, returnTime: "15:00" } : {}),
  });
  const transition = (f, trip, version, action, details = {}) => call("staff_transition_transportation_request", {
    p_request_id: trip.id, p_action: action, p_details: details, p_staff_user_id: f.users.front_desk, p_expected_version: version,
  });

  await test("optional transportation files once after verified payment and never changes checkout price", async () => {
    for (const type of [null, "PICKUP", "DROPOFF", "ROUND_TRIP"]) {
      const f = await hotelFixture(db, 1);
      const token = await hold(f, type ? ride(type) : undefined);
      const checkout = await begin(f, token, db, "GCASH", "full");
      assert.equal(Number(checkout.amount), 200);
      assert.equal((await trips(checkout.reservationId)).length, 0);
      const session = await attach(checkout);
      assert.equal((await event(checkout, session)).outcome, "confirmed");
      assert.equal((await event(checkout, session)).outcome, "already_paid");
      const requests = await trips(checkout.reservationId);
      assert.equal(requests.length, type ? 1 : 0);
      if (type) {
        assert.equal(requests[0].service_type, type);
        assert.equal(requests[0].status, "REQUESTED");
        assert.equal(requests[0].fare_amount, null);
        assert.equal(requests[0].return_time, type === "ROUND_TRIP" ? "15:00" : null);
      }
      assert.deepEqual(await row("select amount::int,paid::int,balance::int from invoices where reservation_id=$1", [checkout.reservationId]),
        { amount: 200, paid: 200, balance: 0 });
    }
  });

  await test("expired or unpaid transportation preferences create no dispatch, and a filing failure leaves payment confirmed", async () => {
    const f = await hotelFixture(db, 1);
    const abandoned = await hold(f, ride("PICKUP"));
    await db.query("update booking_holds set expires_at=now()-interval '1 minute' where token=$1", [abandoned]);
    await call("expire_booking_holds", {});
    assert.equal((await row("select reservation_id from booking_holds where token=$1", [abandoned])).reservation_id, null);
    const label = await row("select transfer_hotel_label from hotel_operational_policies where key='default'");
    const token = await hold(f, { ...ride("PICKUP"), pickupLocation: label.transfer_hotel_label || "HAVEN Hotel & Residences" });
    const checkout = await begin(f, token);
    const session = await attach(checkout);
    await assert.rejects(event(checkout, session, "payment_session.completed", { p_amount: 1 }), /XENDIT_SESSION_MISMATCH/);
    assert.equal((await trips(checkout.reservationId)).length, 0);
    assert.equal((await event(checkout, session)).outcome, "confirmed");
    assert.equal((await trips(checkout.reservationId)).length, 0);
    assert.equal((await row("select status from reservations where id=$1", [checkout.reservationId])).status, "confirmed");
    assert.equal((await row("select count(*)::int n from audit_logs where entity_id=$1 and action='file_booking_transportation_skipped'", [checkout.reservationId])).n, 1);
  });

  await test("only the assigned hotel vehicle fare enters the existing folio once, using available credit", async () => {
    const f = await hotelFixture(db, 1);
    const checkout = await begin(f, await hold(f, ride("ROUND_TRIP")), db, "GCASH", "full");
    await event(checkout, await attach(checkout));
    const [trip] = await trips(checkout.reservationId);
    await db.query("update invoices set amount=180 where reservation_id=$1", [checkout.reservationId]);
    const invoice = await row("select id from invoices where reservation_id=$1", [checkout.reservationId]);
    await db.query("select sync_invoice_financials($1)", [invoice.id]);
    const vehicle = await row("insert into transport_vehicle_types(name,seats,base_fare,booking_fee) values($1,4,42,8) returning id", [`QA-${f.tag}`]);
    await transition(f, trip, 1, "REVIEW");
    await transition(f, trip, 2, "SCHEDULE");
    const details = { driverName: "Test driver", vehicleTypeId: vehicle.id, expectedFareMinor: 10000 };
    await assert.rejects(transition(f, trip, 3, "ASSIGN", { ...details, expectedFareMinor: 9000 }), /TRANSPORTATION_FARE_CHANGED/);
    assert.equal((await transition(f, trip, 3, "ASSIGN", details)).fareAmount, 100);
    await assert.rejects(transition(f, trip, 3, "ASSIGN", details), /TRANSPORTATION_REQUEST_STALE/);
    await transition(f, trip, 4, "START");
    await transition(f, trip, 5, "COMPLETE");
    assert.deepEqual(await row("select amount::int,paid::int,balance::int,credit_balance::int from invoices where id=$1", [invoice.id]),
      { amount: 280, paid: 200, balance: 80, credit_balance: 0 });
    assert.equal((await row("select count(*)::int n from folio_charges where source_record_id=$1 and category='transportation'", [trip.id])).n, 1);
  });

  await test("ride cancellation preserves the stay, and stay cancellation closes an uncommitted ride", async () => {
    const f = await hotelFixture(db, 1);
    const checkout = await begin(f, await hold(f, ride("PICKUP")));
    await event(checkout, await attach(checkout));
    const [booked] = await trips(checkout.reservationId);
    const cancel = (user) => call("customer_cancel_transportation_request", {
      p_user_id: user, p_request_id: booked.id, p_reason: null, p_expected_version: 1,
    });
    const other = await hotelFixture(db, 0);
    await assert.rejects(cancel(other.users.guest), /TRANSPORTATION_REQUEST_NOT_FOUND/);
    assert.equal((await cancel(f.users.guest)).status, "CANCELLED");
    assert.equal((await row("select status from reservations where id=$1", [checkout.reservationId])).status, "confirmed");
    const submitted = await call("customer_submit_transportation_request", {
      p_user_id: f.users.guest, p_reservation_id: checkout.reservationId, p_service_type: "DROPOFF",
      p_pickup_location: null, p_dropoff_location: "Airport Terminal 1", p_pickup_date: dates.cout,
      p_pickup_time: "14:00", p_return_location: null, p_return_date: null, p_return_time: null,
      p_passenger_count: 2, p_special_instructions: null, p_idempotency_key: randomUUID(),
    });
    await transition(f, submitted, 1, "REVIEW");
    await db.query("update reservations set status='cancelled' where id=$1", [checkout.reservationId]);
    assert.equal((await row("select status from transportation_requests where id=$1", [submitted.id])).status, "CANCELLED");
  });

  await test("pending deposit uses frozen server price, exact room and a single local record", async () => {
    const { f, token, a } = await fresh();
    assert.equal(a.create, true); assert.equal(Number(a.amount), 60);
    const r = await row("select status,room_id,payment_method from reservations where id=$1", [a.reservationId]);
    assert.equal(r.status, "pending"); assert.equal(r.room_id, f.rooms[0].id); assert.equal(r.payment_method, "gateway_xendit");
    const replay = await begin(f, token); assert.equal(replay.paymentId, a.paymentId); assert.equal(replay.create, false);
    assert.equal((await row("select count(*)::int n from payments where reservation_id=$1", [a.reservationId])).n, 1);
    await assert.rejects(begin({ ...f, users: { ...f.users, guest: f.users.manager } }, token), /CUSTOMER_REQUIRED/);
  });
  await test("Xendit preserves the booked breakfast snapshot and includes it in the deposit", async () => {
    const f = await hotelFixture(db, 1);
    const type = await row("select id from room_types where name=$1", [f.type]);
    const first = await row("select ($1::date+1)::text d", [dates.cin]);
    const offer = await call("hotel_propose_breakfast", { p_actor: f.users.manager, p_room_type: type.id,
      p_offer: { mode: "optional", priceMinor: 45000, firstDay: first.d, lastDay: dates.cout, start: "06:30", end: "10:00", venue: "Sandbox dining" } });
    await call("hotel_decide_breakfast", { p_actor: f.users.owner, p_offer: offer, p_publish: true });
    const token = await call("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: f.rooms[0].id,
      p_details: { roomType: f.type, checkIn: dates.cin, checkOut: dates.cout, guests: 2, firstName: "Sandbox", lastName: "Guest", email: `${f.tag}@example.invalid`, mobile: "+639170000000" }, p_offer: offer, p_replace: null });
    const a = await begin(f, token); assert.equal(Number(a.amount), 600);
    const booked = await row("select total,breakfast_snapshot from reservations where id=$1", [a.reservationId]);
    assert.equal(Number(booked.total), 2000); assert.equal(booked.breakfast_snapshot.unitMinor * booked.breakfast_snapshot.guests * booked.breakfast_snapshot.mornings, 180000);
  });
  await test("GCash and Maya settle through existing invoices, receipts and exact-room rules", async () => {
    for (const channel of ["GCASH", "PAYMAYA"]) {
      const { a } = await fresh(); const id = await attach(a);
      assert.equal((await event(a, id, "payment_session.completed", { p_channel: channel })).outcome, "confirmed");
      const state = await row("select p.status,p.verified_at,p.gateway_payment_id,p.gateway_channel,r.status as reservation_status,i.paid,i.balance,h.status as hold_status from payments p join reservations r on r.id=p.reservation_id join invoices i on i.id=p.invoice_id join booking_holds h on h.reservation_id=r.id where p.id=$1", [a.paymentId]);
      assert.equal(state.status, "paid"); assert.equal(state.reservation_status, "confirmed"); assert.equal(state.hold_status, "completed");
      assert.equal(Number(state.paid), 60); assert.equal(Number(state.balance), 140); assert.ok(state.verified_at); assert.equal(state.gateway_channel, channel);
      const invoice = await row("select id from invoices where reservation_id=$1", [a.reservationId]);
      assert.ok(invoice.id);
    }
  });
  await test("duplicate and out-of-order deliveries cannot settle twice or downgrade paid", async () => {
    const { a } = await fresh(); const id = await attach(a); await event(a, id);
    assert.equal((await event(a, id)).outcome, "already_paid");
    assert.equal((await event(a, id, "payment_session.expired")).outcome, "already_paid");
    assert.equal((await row("select count(*)::int n from audit_logs where action='confirm_gateway_payment' and entity_id=$1", [a.paymentId])).n, 1);
    assert.equal(Number((await row("select deposit from reservations where id=$1", [a.reservationId])).deposit), 60);
  });
  await test("full payment uses the frozen total and settles the invoice with one provider transaction", async () => {
    const f = await hotelFixture(db, 1);
    const token = await hold(f);
    await assert.rejects(begin(f, token, db, "PAYMAYA", "1"), /INVALID_XENDIT_PAYMENT_CHOICE/);
    const a = await begin(f, token, db, "PAYMAYA", "full");
    assert.equal(Number(a.amount), 200);
    assert.equal(a.paymentChoice, "full");
    await assert.rejects(begin(f, token, db, "GCASH", "deposit"), /XENDIT_AMOUNT_ALREADY_SELECTED/);
    assert.equal(Number((await begin(f, token)).amount), 200);
    await assert.rejects(attach({ ...a, amount: 60 }), /XENDIT_SESSION_MISMATCH/);
    const id = await attach(a);
    await assert.rejects(event(a, id, "payment_session.completed", { p_amount: 60 }), /XENDIT_SESSION_MISMATCH/);
    assert.equal((await event(a, id, "payment_session.completed", { p_channel: "PAYMAYA" })).outcome, "confirmed");
    assert.equal((await event(a, id)).outcome, "already_paid");
    const invoice = await row("select paid::int,balance::int,status from invoices where reservation_id=$1", [a.reservationId]);
    assert.deepEqual(invoice, { paid: 200, balance: 0, status: "paid" });
    const reservation = await row("select deposit::int,payment_status from reservations where id=$1", [a.reservationId]);
    assert.deepEqual(reservation, { deposit: 60, payment_status: "paid" });
    const entries = (await db.query("select amount::int,purpose,status,gateway_payment_id from payments where reservation_id=$1 order by purpose", [a.reservationId])).rows;
    assert.deepEqual(entries, [
      { amount: 60, purpose: "reservation_deposit", status: "paid", gateway_payment_id: `py-${a.paymentId}` },
      { amount: 140, purpose: "stay_payment", status: "paid", gateway_payment_id: null },
    ]);
    await db.query("update reservations set check_in=(hotel_today()-2),check_out=hotel_today() where id=$1", [a.reservationId]);
    await rpc(db, "mark_reservation_no_show", { p_reservation_id: a.reservationId, p_staff_user_id: f.users.front_desk, p_reason: "Did not arrive" });
    assert.deepEqual(await row("select amount::int,credit_balance::int from invoices where reservation_id=$1", [a.reservationId]), { amount: 60, credit_balance: 140 });
    await db.query("update reservations set total=220 where id=$1", [a.reservationId]);
    assert.equal((await event(a, id)).outcome, "already_paid");
  });
  await test("full-payment choice can change after a definitive rejection", async () => {
    const { f, token, a } = await fresh();
    await call("hotel_xendit_creation_rejected", { p_payment: a.paymentId });
    const full = await begin(f, token, db, "PAYMAYA", "full");
    assert.equal(full.paymentId, a.paymentId);
    assert.equal(full.create, true);
    assert.equal(Number(full.amount), 200);
  });
  await test("wrong amount, currency, reference, session and missing transaction roll back", async () => {
    const { a } = await fresh(); const id = await attach(a);
    for (const patch of [{ p_amount: 1 }, { p_amount: null }, { p_currency: "USD" }, { p_session: "ps-foreign" }, { p_session: null }, { p_reference: "other" }, { p_transaction: null }])
      await assert.rejects(event(a, id, "payment_session.completed", patch), /XENDIT_SESSION_MISMATCH|XENDIT_PAYMENT_NOT_FOUND|XENDIT_TRANSACTION_REQUIRED/);
    assert.equal((await row("select status from payments where id=$1", [a.paymentId])).status, "pending_verification");
    assert.equal((await row("select status from reservations where id=$1", [a.reservationId])).status, "pending");
  });
  await test("guest success return and staff/other-provider calls cannot prove payment", async () => {
    const { f, a } = await fresh(); const id = await attach(a);
    await assert.rejects(rpc(db, "verify_reservation_deposit", { p_payment_id: a.paymentId, p_staff_user_id: f.users.accounting }), /GATEWAY_MANUAL_VERIFY_FORBIDDEN/);
    await assert.rejects(rpc(db, "confirm_gateway_payment", { p_payment_id: a.paymentId, p_gateway_ref: id, p_webhook_id: randomUUID() }), /XENDIT_WEBHOOK_REQUIRED/);
    await db.query("set role service_role");
    try { await assert.rejects(rpc(db, "hotel_confirm_xendit_payment", { p_payment_id: a.paymentId, p_gateway_ref: id, p_webhook_id: randomUUID() }), /permission denied/); }
    finally { await db.query("reset role"); }
    assert.equal((await row("select status from reservations where id=$1", [a.reservationId])).status, "pending");
  });
  await test("expiry releases inventory; delayed completion is recorded for review without revival", async () => {
    const { f, a } = await fresh(); const id = await attach(a);
    assert.equal((await event(a, id, "payment_session.expired")).outcome, "expired");
    const replacement = await hold(f); assert.ok(replacement);
    assert.equal((await event(a, id)).outcome, "review_required");
    assert.equal((await row("select status from reservations where id=$1", [a.reservationId])).status, "cancelled");
    assert.match((await row("select notes from payments where id=$1", [a.paymentId])).notes, /Accounting review/);
  });
  await test("lost webhook expiry is swept through the established availability mechanism", async () => {
    const { a } = await fresh(); await db.query("update payments set gateway_expires_at=now()-interval '1 second' where id=$1", [a.paymentId]);
    await rpc(db, "expire_booking_holds", {});
    assert.equal((await row("select status from reservations where id=$1", [a.reservationId])).status, "cancelled");
    assert.equal((await row("select status from booking_holds where reservation_id=$1", [a.reservationId])).status, "expired");
  });
  await test("concurrent double-clicks have one external create claim and one payment", async () => {
    const f = await hotelFixture(db, 1); const token = await hold(f); const other = await suite.connect();
    try {
      const outcomes = await Promise.all([begin(f, token), begin(f, token, other)]);
      assert.equal(outcomes.filter(a => a.create).length, 1); assert.equal(outcomes[0].paymentId, outcomes[1].paymentId);
    } finally { await other.end(); }
  });
  await test("simultaneous final-room bookings retain one winner and no duplicate room claim", async () => {
    const f = await hotelFixture(db, 1); const other = await suite.connect();
    try {
      const outcomes = await Promise.allSettled([hold(f), call("hotel_create_breakfast_booking_hold", { p_user: f.users.guest, p_room: f.rooms[0].id,
        p_details: { roomType: f.type, checkIn: dates.cin, checkOut: dates.cout, guests: 2, firstName: "Other", lastName: "Guest", email: `${f.tag}@example.invalid`, mobile: "+639170000000" }, p_offer: null, p_replace: null }, other)]);
      assert.equal(outcomes.filter(a => a.status === "fulfilled").length, 1);
      const token = outcomes.find(a => a.status === "fulfilled").value;
      await begin(f, token);
      await assert.rejects(hold(f), /ROOM.*UNAVAILABLE/);
    } finally { await other.end(); }
  });
  await test("definitive provider rejection permits retry; ambiguous create remains claimed", async () => {
    const { f, token, a } = await fresh(); assert.equal((await begin(f, token)).create, false);
    await call("hotel_xendit_creation_rejected", { p_payment: a.paymentId });
    assert.equal((await begin(f, token, db, "PAYMAYA")).create, true);
    assert.equal((await begin(f, token)).create, false);
  });
  await test("provider references and successful external transactions are unique", async () => {
    const first = await fresh(); const id = await attach(first.a); await event(first.a, id);
    const second = await fresh(); const nextId = await attach(second.a);
    await assert.rejects(event(second.a, nextId, "payment_session.completed", { p_transaction: `py-${first.a.paymentId}` }), /duplicate key/);
    assert.equal((await row("select status from payments where id=$1", [second.a.paymentId])).status, "pending_verification");
  });
  console.log(`Xendit SQL scenarios passed: ${passed}`);
} finally { await suite.close(); }
