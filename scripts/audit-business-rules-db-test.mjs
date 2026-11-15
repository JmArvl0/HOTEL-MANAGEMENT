// Uses the disposable loopback database harness and synthetic guests only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
let passed = 0;
const row = async (sql, args = [], client = db) => (await client.query(sql, args)).rows[0];
const call = async (name, args, client = db) => (await rpc(client, name, args))[0]?.[name];
const test = async (name, work) => { await work(); passed++; console.log("PASS " + name); };
try {
  await db.query("set statement_timeout='12s'");
  await db.query("update hotel_operational_policies set deposit_method='xendit' where key='default'");
  const dates = await row("select (hotel_today()+30)::text cin,(hotel_today()+32)::text cout");
  const details = f => ({ roomId: f.rooms[0].id, roomType: f.type, checkIn: dates.cin, checkOut: dates.cout, guests: 2,
    firstName: "Audit", lastName: "Guest", email: `${f.tag}@example.invalid`, mobile: "+639171234567",
    expectedArrival: "", address: "Manila", requestOptions: [], specialRequests: "" });
  const hold = (f, key = randomUUID(), body = details(f), client = db) => call("create_booking_hold_attempt", {
    p_user: f.users.guest, p_attempt: key, p_details: body, p_breakfast_enabled: true,
  }, client);
  const booked = async () => {
    const f = await hotelFixture(db, 2);
    const h = await hold(f);
    const a = await call("hotel_begin_xendit_checkout", { p_token: h.token, p_user_id: f.users.guest, p_channel: "GCASH", p_payment_choice: "full" });
    const session = "ps-" + randomUUID();
    await call("hotel_attach_xendit_session", { p_reference: a.reference, p_session: session, p_url: "https://dev.xen.to/" + randomUUID(),
      p_expires: a.expiresAt, p_amount: a.amount });
    await call("hotel_process_xendit_event", { p_event: "payment_session.completed", p_reference: a.reference, p_session: session,
      p_amount: a.amount, p_currency: "PHP", p_transaction: "py-" + randomUUID(), p_channel: "GCASH" });
    return { f, h, a, session };
  };

  await test("the same hold attempt returns one owned token and rejects changed details", async () => {
    const f = await hotelFixture(db, 2), key = randomUUID(), body = details(f);
    const first = await hold(f, key, body);
    assert.equal((await hold(f, key, body)).token, first.token);
    assert.equal((await call("read_booking_hold_attempt", { p_user: f.users.guest, p_attempt: key, p_details: body })).token, first.token);
    await assert.rejects(hold(f, key, { ...body, specialRequests: "changed" }), /RETRY_PAYLOAD_CONFLICT/);
    const other = await hotelFixture(db, 1);
    assert.equal(await call("read_booking_hold_attempt", { p_user: other.users.guest, p_attempt: key, p_details: body }), null);
  });
  await test("concurrent double submits recover the same hold", async () => {
    const f = await hotelFixture(db, 2), key = randomUUID(), body = details(f);
    const concurrent = await suite.connect();
    try {
      const results = await Promise.all([hold(f, key, body), hold(f, key, body, concurrent)]);
      assert.equal(results[0].token, results[1].token);
    } finally { await concurrent.end(); }
  });
  await test("expired attempts preserve their identity and require a fresh attempt", async () => {
    const f = await hotelFixture(db, 2), key = randomUUID(), body = details(f);
    const first = await hold(f, key, body);
    await db.query("update booking_holds set expires_at=now()-interval '1 minute' where token=$1", [first.token]);
    await assert.rejects(hold(f, key, body), /HOLD_ATTEMPT_EXPIRED/);
    assert.notEqual((await hold(f, randomUUID(), body)).token, first.token);
  });
  await test("guest transport retries enforce owner, reservation, and request fingerprint", async () => {
    const { f, a } = await booked();
    const args = { p_user_id: f.users.guest, p_reservation_id: a.reservationId, p_service_type: "DROPOFF",
      p_pickup_location: null, p_dropoff_location: "Airport terminal", p_pickup_date: dates.cin, p_pickup_time: "18:00",
      p_return_location: null, p_return_date: null, p_return_time: null, p_passenger_count: 2,
      p_special_instructions: null, p_idempotency_key: randomUUID() };
    const first = await call("customer_submit_transportation_request", args);
    assert.equal((await call("customer_submit_transportation_request", args)).id, first.id);
    await assert.rejects(call("customer_submit_transportation_request", { ...args, p_passenger_count: 1 }), /RETRY_PAYLOAD_CONFLICT/);
    const other = await booked();
    await assert.rejects(call("customer_submit_transportation_request", { ...args, p_user_id: other.f.users.guest,
      p_reservation_id: other.a.reservationId }), /RETRY_PAYLOAD_CONFLICT/);
  });
  await test("a round trip cannot return earlier on the same day", async () => {
    const { f, a } = await booked();
    await assert.rejects(call("customer_submit_transportation_request", { p_user_id: f.users.guest, p_reservation_id: a.reservationId,
      p_service_type: "ROUND_TRIP", p_pickup_location: "Airport terminal", p_dropoff_location: null,
      p_pickup_date: dates.cin, p_pickup_time: "18:00", p_return_location: "Airport terminal",
      p_return_date: dates.cin, p_return_time: "17:00", p_passenger_count: 2, p_special_instructions: null,
      p_idempotency_key: randomUUID() }), /INVALID_RETURN_SCHEDULE/);
  });
  await test("checkout drop-off and round-trip preferences file into the confirmed stay", async () => {
    for (const serviceType of ["DROPOFF", "ROUND_TRIP"]) {
      const f = await hotelFixture(db, 1);
      const preferences = serviceType === "DROPOFF" ? { serviceType, dropoffLocation: "Airport terminal", pickupDate: dates.cout,
        pickupTime: "10:00", passengerCount: 2 } : { serviceType, pickupLocation: "Airport terminal", pickupDate: dates.cin,
        pickupTime: "10:00", returnLocation: "Airport terminal", returnDate: dates.cout, returnTime: "10:00", passengerCount: 2 };
      const h = await hold(f, randomUUID(), { ...details(f), transportationPreferences: preferences });
      const a = await call("hotel_begin_xendit_checkout", { p_token: h.token, p_user_id: f.users.guest, p_channel: "GCASH", p_payment_choice: "deposit" });
      const session = "ps-" + randomUUID();
      await call("hotel_attach_xendit_session", { p_reference: a.reference, p_session: session, p_url: "https://dev.xen.to/" + randomUUID(), p_expires: a.expiresAt, p_amount: a.amount });
      await call("hotel_process_xendit_event", { p_event: "payment_session.completed", p_reference: a.reference, p_session: session,
        p_amount: a.amount, p_currency: "PHP", p_transaction: "py-" + randomUUID(), p_channel: "GCASH" });
      const trip = await row("select * from transportation_requests where reservation_id=$1", [a.reservationId]);
      assert.ok(trip, JSON.stringify((await db.query("select action,after_data from audit_logs where entity_id=$1", [a.reservationId])).rows));
      assert.equal(trip.service_type, serviceType);
      if (serviceType === "DROPOFF") assert.equal(trip.dropoff_location, "Airport terminal");
      else assert.equal(trip.return_location, "Airport terminal");
    }
  });
  await test("reservation change exact retries work after execution and changed notes conflict", async () => {
    const { f, a } = await booked();
    const args = { p_user_id: f.users.guest, p_reservation_id: a.reservationId,
      p_check_in: null, p_check_out: null, p_room_type: null, p_guests: null, p_special_requests: "Quiet room",
      p_reason: "Preference update", p_idempotency_key: randomUUID() };
    const first = await call("customer_request_reservation_change", args);
    assert.equal((await call("customer_request_reservation_change", args)).id, first.id);
    await assert.rejects(call("customer_request_reservation_change", { ...args, p_special_requests: "Different notes" }), /RETRY_PAYLOAD_CONFLICT/);
  });
  await test("new registration preserves historic CRM ownership", async () => {
    const email = `${randomUUID()}@example.invalid`;
    const original = await row("insert into guests(name,email,phone) values('Historical guest',$1,'old contact') returning id", [email]);
    const id = await call("register_guest_account", { p_first_name: "New", p_last_name: "Account", p_email: email, p_phone: "+639171234567",
      p_password_hash: "$2b$12$" + "a".repeat(53) });
    assert.equal((await row("select user_account_id from guests where id=$1", [original.id])).user_account_id, null);
    assert.notEqual((await row("select id from guests where user_account_id=$1", [id])).id, original.id);
  });
  await test("a live hold prevents reducing room capacity below its party", async () => {
    const f = await hotelFixture(db, 2);
    await hold(f);
    await assert.rejects(db.query("update room_types set max_guests=1 where name=$1", [f.type]), /ROOM_TYPE_CAPACITY_COMMITMENT/);
    await db.query("update room_types set max_guests=3 where name=$1", [f.type]);
  });
  await test("effective amenities merge all lists and enforce the saved display limit", async () => {
    const f = await hotelFixture(db, 1);
    const standard = Array.from({ length: 100 }, (_, i) => "Item " + i);
    const merged = await call("catalog_effective_amenities", { p_standard: standard, p_additions: ["Extra"], p_exclusions: ["Item 0"] });
    assert.equal(merged.length, 100);
    await db.query("update room_types set amenities=$2::jsonb where name=$1", [f.type, JSON.stringify(standard)]);
    await assert.rejects(db.query("update rooms set amenity_additions='[\"Extra\"]' where id=$1", [f.rooms[0].id]), /ROOM_AMENITY_EFFECTIVE_LIMIT/);
  });
  await test("the daily snapshot includes over 1000 records and rejects a changed preview", async () => {
    const { f, a } = await booked();
    const invoice = await row("select id from invoices where reservation_id=$1", [a.reservationId]);
    await db.query("insert into payments(invoice_id,reservation_id,amount,method,status,purpose,verified_at) select $1,$2,1,'card','paid','stay_payment',now() from generate_series(1,1005)", [invoice.id, a.reservationId]);
    const date = (await row("select hotel_today()::text hotel_day")).hotel_day;
    const preview = await call("preview_front_desk_daily_report", { p_date: date });
    assert.ok(preview.collections.count >= 1005);
    await db.query("insert into payments(invoice_id,reservation_id,amount,method,status,purpose,verified_at) values($1,$2,1,'card','paid','stay_payment',now())", [invoice.id,a.reservationId]);
    await assert.rejects(call("submit_front_desk_daily_snapshot", { p_date: date, p_supersedes: null,
      p_actor: f.users.front_desk, p_preview_version: preview.previewVersion }), /REPORT_PREVIEW_CHANGED/);
    const fresh = await call("preview_front_desk_daily_report", { p_date: date });
    assert.ok((await call("submit_front_desk_daily_snapshot", { p_date: date, p_supersedes: null,
      p_actor: f.users.front_desk, p_preview_version: fresh.previewVersion })).id);
  });
  await test("late captures enter one Accounting obligation and preserve released inventory", async () => {
    const f = await hotelFixture(db, 1), h = await hold(f);
    const a = await call("hotel_begin_xendit_checkout", { p_token: h.token, p_user_id: f.users.guest, p_channel: "GCASH", p_payment_choice: "full" });
    const session = "ps-" + randomUUID(), transaction = "py-" + randomUUID();
    await call("hotel_attach_xendit_session", { p_reference: a.reference, p_session: session,
      p_url: "https://dev.xen.to/" + randomUUID(), p_expires: a.expiresAt, p_amount: a.amount });
    await db.query("update payments set gateway_expires_at=now()-interval '1 minute' where id=$1", [a.paymentId]);
    await call("expire_booking_holds", {});
    const event = { p_event: "payment_session.completed", p_reference: a.reference, p_session: session,
      p_amount: a.amount, p_currency: "PHP", p_transaction: transaction, p_channel: "GCASH" };
    assert.equal((await call("hotel_process_xendit_event", event)).outcome, "review_required");
    await call("hotel_process_xendit_event", event);
    assert.equal((await row("select count(*)::int n from xendit_payment_reviews where payment_id=$1 and state='open'", [a.paymentId])).n, 1);
    assert.equal((await row("select status from reservations where id=$1", [a.reservationId])).status, "cancelled");
    await call("resolve_xendit_payment_review", { p_payment: a.paymentId, p_actor: f.users.accounting, p_evidence: "Refund evidence ref fixture-123" });
    await call("hotel_process_xendit_event", event);
    assert.equal((await row("select state from xendit_payment_reviews where payment_id=$1", [a.paymentId])).state, "resolved");
  });
  await test("uncertain checkout creation is durable and closes on trusted attachment", async () => {
    const f = await hotelFixture(db, 1), h = await hold(f);
    const a = await call("hotel_begin_xendit_checkout", { p_token: h.token, p_user_id: f.users.guest, p_channel: "GCASH", p_payment_choice: "deposit" });
    await call("mark_xendit_session_uncertain", { p_payment: a.paymentId });
    assert.equal((await row("select reason from xendit_payment_reviews where payment_id=$1", [a.paymentId])).reason, "session_unknown");
    await call("hotel_attach_xendit_session", { p_reference: a.reference, p_session: "ps-" + randomUUID(),
      p_url: "https://dev.xen.to/" + randomUUID(), p_expires: a.expiresAt, p_amount: a.amount });
    assert.equal((await row("select state from xendit_payment_reviews where payment_id=$1", [a.paymentId])).state, "resolved");
  });
  await test("email delivery records sent, failure, and bounded opt-in retries", async () => {
    const key = "fixture:" + randomUUID();
    assert.equal(await call("claim_guest_email_delivery", { p_key: key, p_retry: false }), 1);
    assert.equal(await call("claim_guest_email_delivery", { p_key: key, p_retry: true }), null);
    await call("finish_guest_email_delivery", { p_key: key, p_attempt: 1, p_state: "failed", p_provider_id: null, p_failure: "failed" });
    assert.equal(await call("claim_guest_email_delivery", { p_key: key, p_retry: false }), null);
    assert.equal(await call("claim_guest_email_delivery", { p_key: key, p_retry: true }), 2);
    await call("finish_guest_email_delivery", { p_key: key, p_attempt: 2, p_state: "sent", p_provider_id: "fixture-mail", p_failure: null });
    assert.equal(await call("claim_guest_email_delivery", { p_key: key, p_retry: true }), null);
  });
  await test("auth budgets serialize simultaneous registration attempts", async () => {
    const subject = "a".repeat(64), network = "b".repeat(64);
    const clients = await Promise.all(Array.from({ length: 6 }, () => suite.connect()));
    let outcomes;
    try {
      outcomes = await Promise.all(clients.map(client => call("consume_auth_request_budget", {
        p_operation: "register", p_subject: subject, p_network: network,
      }, client)));
    } finally { await Promise.all(clients.map(client => client.end())); }
    assert.equal(outcomes.filter(Boolean).length, 4);
  });
  await test("OTP purposes coexist and a reset code cannot verify a login challenge", async () => {
    const f = await hotelFixture(db, 1), reset = randomUUID(), login = randomUUID();
    for (const [purpose, id] of [["login", login], ["password_reset", reset]]) {
      await call("auth_otp_issue_for_purpose", { p_purpose: purpose, p_user_id: f.users.guest,
        p_challenge_id: id, p_code_verifier: "fixture-verifier", p_ttl_seconds: 300, p_cooldown_seconds: 60 });
    }
    assert.equal((await row("select count(*)::int n from auth_otp_challenges where user_id=$1 and invalidated_at is null", [f.users.guest])).n, 2);
    assert.ok((await call("auth_otp_verify_for_purpose", { p_purpose: "login", p_challenge_id: reset,
      p_code_verifier: "fixture-verifier", p_max_attempts: 3 })).error);
    assert.equal((await row("select consumed_at from auth_otp_challenges where id=$1", [reset])).consumed_at, null);
  });
  await test("zero-deposit activation fails before accepting online booking details", async () => {
    await assert.rejects(db.query("update reservation_deposit_policies set enabled=true,percentage_basis_points=0,calculation_type='percentage' where key='online_reservation'"), /DEPOSIT_AMOUNT_UNAVAILABLE/);
  });
  await test("catalog photo deletion serializes with attaching a published photo", async () => {
    const f = await hotelFixture(db, 1), object = randomUUID() + ".webp";
    const url = "https://fixture.supabase.co/storage/v1/object/public/room-photos/" + object;
    await call("catalog_stage_room_photo", { p_actor: f.users.manager, p_path: object });
    await db.query("update room_types set photo_urls=array[$2] where name=$1", [f.type, url]);
    await assert.rejects(call("catalog_request_room_photo_deletion", { p_actor: f.users.manager, p_path: object }), /ROOM_PHOTO_IN_USE/);
    await db.query("update room_types set photo_urls='{}' where name=$1", [f.type]);
    await call("catalog_request_room_photo_deletion", { p_actor: f.users.manager, p_path: object });
    await assert.rejects(db.query("update room_types set photo_urls=array[$2] where name=$1", [f.type, url]), /ROOM_PHOTO_REMOVED/);
  });
  await test("asset editing can clear a room and refuses stale updates", async () => {
    const f = await hotelFixture(db, 1);
    const id = await call("maintenance_register_asset", {
      p_actor: f.users.manager, p_name: "Fixture pump", p_category: "Equipment", p_room_id: f.rooms[0].id,
      p_location: "Fixture floor", p_last_serviced_at: null, p_service_interval_days: 30, p_notes: null,
    });
    const asset = await row("select updated_at::text stamp from maintenance_assets where id=$1", [id]);
    const args = { p_actor: f.users.manager, p_asset_id: id, p_expected_updated: asset.stamp,
      p_action: "update", p_details: { roomId: "", name: "Fixture pump" } };
    await call("maintenance_apply_asset_change", args);
    assert.equal((await row("select room_id from maintenance_assets where id=$1", [id])).room_id, null);
    await assert.rejects(call("maintenance_apply_asset_change", args), /ASSET_STALE/);
  });
  await test("negative, zero, and non-finite payment amounts are rejected at the table boundary", async () => {
    const { a } = await booked();
    const invoice = await row("select id from invoices where reservation_id=$1", [a.reservationId]);
    for (const amount of ["-1", "0", "NaN"]) {
      await assert.rejects(db.query("insert into payments(invoice_id,reservation_id,amount,method,status,purpose) values($1,$2,$3,'card','paid','stay_payment')",
        [invoice.id, a.reservationId, amount]), /payment_amount_positive_cents/);
    }
    await assert.rejects(call("room_nightly_rates", { p_room_type: "invalid", p_from: dates.cin,
      p_to: (await row("select (hotel_today()+500)::text date")).date }), /INVALID_STAY_RANGE/);
  });
  console.log("Audit business rule SQL scenarios passed: " + passed);
} finally { await suite.close(); }
