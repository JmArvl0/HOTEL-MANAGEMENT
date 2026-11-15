// Loopback-only integration regression. Replay backend-remediation-db-test.mjs first.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const result = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
try {
  const f = await hotelFixture(db);
  const createTrip = async (roundTrip = false) => {
    const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Synthetic passenger',$3,hotel_today()+30,hotel_today()+32,'confirmed',200) returning id", [f.guest, f.users.guest, f.type])).rows[0].id;
    const dates = (await db.query("select (hotel_today()+30)::text as arrival,(hotel_today()+32)::text as departure")).rows[0];
    const trip = await result("customer_submit_transportation_request", { p_user_id: f.users.guest, p_reservation_id: reservation, p_service_type: roundTrip ? "ROUND_TRIP" : "PICKUP", p_pickup_location: "Synthetic airport terminal", p_dropoff_location: null, p_pickup_date: dates.arrival, p_pickup_time: "10:30", p_return_location: roundTrip ? "Synthetic return terminal" : null, p_return_date: roundTrip ? dates.departure : null, p_return_time: roundTrip ? "14:00" : null, p_passenger_count: 2, p_special_instructions: null, p_idempotency_key: randomUUID() });
    await result("staff_transition_transportation_request", { p_request_id: trip.id, p_action: "REVIEW", p_details: {}, p_staff_user_id: f.users.front_desk, p_expected_version: 1 });
    return { id: trip.id, reservation };
  };
  const details = { travelerName: "Synthetic lead traveler", phone: "+639171234567", email: "qa@example.invalid", sharingEnabled: true, photoPath: null };
  const save = (id, version = 0, changes = {}, actor = f.users.guest) => result("save_transport_pickup_profile", { p_actor: actor, p_request: id, p_expected_version: version, p_details: { ...details, ...changes } });
  const prepare = id => result("prepare_fleet_transport", { p_actor: f.users.front_desk, p_request: id, p_expected_version: 2 });
  const outbox = async id => (await db.query("select o.*,l.external_request_id from fleet_transport_outbox o join fleet_transport_links l on l.id=o.link_id where l.request_id=$1 order by l.leg", [id])).rows;
  const t = await createTrip(true);
  await test("pickup profile is private to the owning guest or Front Desk", async () => {
    await assert.rejects(save(t.id, 0, {}, f.users.manager), /PICKUP_PROFILE_FORBIDDEN/);
    const other = await hotelFixture(db);
    await assert.rejects(save(t.id, 0, {}, other.users.guest), /PICKUP_PROFILE_NOT_FOUND/);
    await db.query("update user_accounts set active=false where id=$1", [f.users.front_desk]);
    await assert.rejects(save(t.id, 0, {}, f.users.front_desk), /PICKUP_PROFILE_FORBIDDEN/);
    await db.query("update user_accounts set active=true where id=$1", [f.users.front_desk]);
  });
  await test("consent is required before preparing a Fleet request", async () => {
    await assert.rejects(prepare(t.id), /FLEET_PICKUP_CONSENT_REQUIRED/);
    await save(t.id, 0, { sharingEnabled: false });
    await assert.rejects(prepare(t.id), /FLEET_PICKUP_CONSENT_REQUIRED/);
    await save(t.id, 1);
  });
  await test("profile edits are versioned and arbitrary private storage paths are refused", async () => {
    await assert.rejects(save(t.id, 0), /PICKUP_PROFILE_STALE/);
    await assert.rejects(save(t.id, 2, { photoPath: "guest-ids/identity.jpg" }), /PICKUP_PHOTO_INVALID/);
  });
  await test("round trips produce two linked legs, correct routes and explicit Philippine timezone", async () => {
    await prepare(t.id);
    const rows = await outbox(t.id);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].payload.leg_kind, "outbound");
    assert.equal(rows[1].payload.leg_kind, "return");
    assert.equal(rows[1].payload.request.pickup_location, rows[0].payload.request.dropoff_location);
    assert.equal(rows[1].payload.request.dropoff_location, "Synthetic return terminal");
    assert.match(rows[0].payload.request.pickup_datetime, /T10:30:00\+08:00$/);
    assert.equal(rows[0].payload.request.guest_phone, details.phone);
    assert.equal(rows[0].payload.request.guest_photo_reference, null);
    assert.equal(rows[0].payload.round_trip_reference, rows[1].payload.round_trip_reference);
  });
  await test("prepare retry preserves event identities and does not create duplicates", async () => {
    const before = (await outbox(t.id)).map(row => row.id);
    await prepare(t.id); assert.deepEqual((await outbox(t.id)).map(row => row.id), before);
  });
  await test("profile edits invalidate both queued legs and can refresh an unsent snapshot", async () => {
    await save(t.id, 2, { phone: "+639181234567" });
    assert.ok((await outbox(t.id)).every(row => row.state === "NEEDS_REVIEW"));
    await prepare(t.id);
    assert.ok((await outbox(t.id)).every(row => row.payload.request.guest_phone === "+639181234567" && row.state === "PREPARED"));
  });
  let row = (await outbox(t.id))[0];
  const lease = randomUUID();
  await test("two workers claim one delivery only once", async () => {
    const second = await suite.connect();
    try {
      const claims = await Promise.all([result("claim_fleet_transport", { p_id: row.id, p_lease: lease }), result("claim_fleet_transport", { p_id: row.id, p_lease: randomUUID() }, second)]);
      assert.equal(claims.filter(Boolean).length, 1);
    } finally { await second.end(); }
  });
  await test("unknown worker cannot finish someone else's delivery lease", async () => {
    assert.equal(await result("finish_fleet_transport", { p_id: row.id, p_lease: randomUUID(), p_reference: "wrong", p_error: null, p_review: false }), false);
  });
  await test("crashed sender is reclaimed with the same event and a new lease", async () => {
    await db.query("update fleet_transport_outbox set lease_until=now()-interval '1 second' where id=$1", [row.id]);
    const claimed = await result("claim_fleet_transport", { p_id: row.id, p_lease: lease });
    assert.equal(claimed.payload.event_id, row.id);
    assert.equal(claimed.attempt, 2);
  });
  await test("temporary failure persists retry time and cannot be retried early", async () => {
    assert.equal(await result("finish_fleet_transport", { p_id: row.id, p_lease: lease, p_reference: null, p_error: "FLEET_DELIVERY_UNCERTAIN", p_review: false }), true);
    assert.equal(await result("claim_fleet_transport", { p_id: row.id, p_lease: randomUUID() }), null);
    const saved = (await outbox(t.id))[0]; assert.equal(saved.state, "FAILED"); assert.ok(new Date(saved.next_attempt_at) > new Date());
  });
  await test("attempted creates cannot be rewritten as changed duplicate requests", async () => {
    await assert.rejects(prepare(t.id), /FLEET_RECONCILIATION_REQUIRED/);
  });
  await test("successful retry saves Fleet reference and stops further sending", async () => {
    await db.query("update fleet_transport_outbox set next_attempt_at=now() where id=$1", [row.id]);
    assert.ok(await result("claim_fleet_transport", { p_id: row.id, p_lease: lease }));
    assert.equal(await result("finish_fleet_transport", { p_id: row.id, p_lease: lease, p_reference: "fleet-qa-1", p_error: null, p_review: false }), true);
    assert.equal(await result("claim_fleet_transport", { p_id: row.id, p_lease: lease }), null);
  });
  const event = (version, status = "ASSIGNED") => ({ event_id: randomUUID(), source_system: "PMS", external_request_id: row.external_request_id, external_booking_id: row.external_request_id, fleet_reference: "fleet-qa-1", request_version: version, status, assignment_active: status === "ASSIGNED", occurred_at: new Date().toISOString() });
  const receive = (body, client = db) => result("receive_fleet_transport_status", { p_event: body }, client);
  let latest;
  await test("versioned partner status persists as an advisory projection", async () => {
    latest = event(3); assert.equal((await receive(latest)).outcome, "APPLIED");
    const link = (await db.query("select * from fleet_transport_links where id=$1", [row.link_id])).rows[0]; assert.equal(Number(link.partner_version), 3); assert.equal(link.assignment_active, true);
    assert.equal((await db.query("select status from transportation_requests where id=$1", [t.id])).rows[0].status, "REVIEWED");
  });
  await test("exact callback retry returns the saved acknowledgment", async () => { assert.equal((await receive(latest)).duplicate, true); });
  await test("changed event replay and wrong Fleet reference conflict", async () => {
    await assert.rejects(receive({ ...latest, status: "COMPLETED" }), /FLEET_EVENT_CONFLICT/);
    await assert.rejects(receive({ ...event(4), fleet_reference: "another-fleet" }), /FLEET_REFERENCE_CONFLICT/);
  });
  await test("older event cannot overwrite a newer assignment", async () => {
    assert.equal((await receive(event(2, "RECEIVED"))).outcome, "STALE");
    assert.equal((await db.query("select partner_status from fleet_transport_links where id=$1", [row.link_id])).rows[0].partner_status, "ASSIGNED");
  });
  await test("concurrent callback retries have one durable event", async () => {
    const second = await suite.connect(); const body = event(4, "IN_TRANSIT");
    try { const results = await Promise.all([receive(body), receive(body, second)]); assert.equal(results.filter(item => item.duplicate).length, 1); }
    finally { await second.end(); }
  });
  await test("terminal completion revokes assignment access and cannot regress", async () => {
    assert.equal((await receive(event(5, "COMPLETED"))).outcome, "APPLIED");
    assert.equal((await db.query("select assignment_active from fleet_transport_links where id=$1", [row.link_id])).rows[0].assignment_active, false);
    assert.equal((await receive(event(6, "SCHEDULED"))).outcome, "NEEDS_REVIEW");
    assert.equal((await db.query("select partner_status from fleet_transport_links where id=$1", [row.link_id])).rows[0].partner_status, "COMPLETED");
  });
  await test("status callbacks cannot post a guest fare", async () => {
    assert.equal((await db.query("select count(*)::int as n from folio_charges where reservation_id=$1 and category='transportation'", [t.reservation])).rows[0].n, 0);
  });
  await test("local cancellation invalidates delivery and revokes media access", async () => {
    await db.query("update transportation_requests set status='CANCELLED',version=version+1 where id=$1", [t.id]);
    assert.ok((await outbox(t.id)).every(item => item.state === "NEEDS_REVIEW"));
    assert.ok((await db.query("select assignment_active from fleet_transport_links where request_id=$1", [t.id])).rows.every(item => !item.assignment_active));
  });
  await test("legacy unversioned Fleet callback is durably acknowledged for review", async () => {
    const legacy = event(undefined); delete legacy.request_version;
    assert.equal((await receive(legacy)).outcome, "NEEDS_REVIEW");
    assert.equal((await receive(legacy)).duplicate, true);
  });
  await test("coordination notes are audited and do not pretend partner reconciliation", async () => {
    await result("record_fleet_coordination", { p_actor: f.users.front_desk, p_request: t.id, p_note: "Synthetic Fleet contact; cancellation confirmation pending." });
    assert.ok((await db.query("select needs_review from fleet_transport_links where request_id=$1", [t.id])).rows.every(item => item.needs_review));
    await assert.rejects(result("record_fleet_coordination", { p_actor: f.users.manager, p_request: t.id, p_note: "Not authorized." }), /FLEET_FORBIDDEN/);
  });
  await test("private pickup bucket and tables have no browser-role grants", async () => {
    assert.equal((await db.query("select public from storage.buckets where id='transport-pickup-photos'")).rows[0].public, false);
    await db.query("set role authenticated");
    try {
      await assert.rejects(db.query("select * from transport_pickup_profiles"), /permission denied/);
      await assert.rejects(db.query("select receive_fleet_transport_status('{}'::jsonb)"), /permission denied/);
    } finally { await db.query("reset role"); }
  });
  await test("photo identity stays stable across contact edits and changes on replacement", async () => {
    const trip = await createTrip(); const photo = `${trip.id}/${randomUUID()}.png`;
    await save(trip.id, 0, { photoPath: photo });
    const read = async () => (await db.query("select photo_reference,photo_version from transport_pickup_profiles where request_id=$1", [trip.id])).rows[0];
    const first = await read(); await save(trip.id, 1, { phone: "+639181234567", photoPath: photo });
    assert.deepEqual(await read(), first);
    await save(trip.id, 2, { photoPath: `${trip.id}/${randomUUID()}.png` });
    const changed = await read(); assert.notEqual(changed.photo_reference, first.photo_reference); assert.equal(changed.photo_version, first.photo_version + 1);
    await save(trip.id, 3, { photoPath: null, sharingEnabled: false });
    assert.equal((await read()).photo_reference, null);
  });
  await test("cancellation during sending keeps a late accepted reference for coordination", async () => {
    const trip = await createTrip(); await save(trip.id); await prepare(trip.id);
    const pending = (await outbox(trip.id))[0]; const token = randomUUID();
    await result("claim_fleet_transport", { p_id: pending.id, p_lease: token });
    await db.query("update transportation_requests set status='CANCELLED',version=version+1 where id=$1", [trip.id]);
    assert.equal(await result("finish_fleet_transport", { p_id: pending.id, p_lease: token, p_reference: "late-fleet-reference", p_error: null, p_review: false }), false);
    const link = (await db.query("select fleet_reference,needs_review from fleet_transport_links where id=$1", [pending.link_id])).rows[0];
    assert.equal(link.fleet_reference, "late-fleet-reference"); assert.equal(link.needs_review, true);
    assert.equal((await outbox(trip.id))[0].state, "NEEDS_REVIEW");
  });
  await test("reservation cancellation invalidates prepared delivery even without a transport transition", async () => {
    const trip = await createTrip(); await save(trip.id); await prepare(trip.id);
    const pending = (await outbox(trip.id))[0];
    await db.query("update reservations set status='cancelled' where id=$1", [trip.reservation]);
    assert.equal((await outbox(trip.id))[0].state, "NEEDS_REVIEW");
    assert.equal(await result("claim_fleet_transport", { p_id: pending.id, p_lease: randomUUID() }), null);
  });
  console.log(`Fleet preparation: ${passed} real PostgreSQL cases passed.`);
} finally { await suite.close(); }
