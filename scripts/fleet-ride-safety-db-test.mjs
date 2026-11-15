// Isolated loopback-only SQL regression; replay the migration template first.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";
const suite = await hotelTestDatabase(); const { db } = suite;
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const call = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
try {
  const f = await hotelFixture(db);
  const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Safety QA',$3,hotel_today()+30,hotel_today()+32,'confirmed',200) returning id", [f.guest, f.users.guest, f.type])).rows[0].id;
  const dates = (await db.query("select (hotel_today()+30)::text as arrival,(hotel_today()+32)::text as departure")).rows[0];
  const trip = await call("customer_submit_transportation_request", { p_user_id: f.users.guest, p_reservation_id: reservation, p_service_type: "ROUND_TRIP", p_pickup_location: "Synthetic airport", p_dropoff_location: null, p_pickup_date: dates.arrival, p_pickup_time: "10:00", p_return_location: "Synthetic return airport", p_return_date: dates.departure, p_return_time: "14:00", p_passenger_count: 2, p_special_instructions: "Booking flight note", p_idempotency_key: randomUUID() });
  await call("staff_transition_transportation_request", { p_request_id: trip.id, p_action: "REVIEW", p_details: {}, p_staff_user_id: f.users.front_desk, p_expected_version: 1 });
  const details = { travelerName: "Actual traveler", phone: "+639171234567", email: "qa@example.invalid", photoPath: null, sharingEnabled: true, ridePreferences: ["QUIET_RIDE", "HELP_WITH_LUGGAGE"], luggageCount: 3, luggageNotes: "2 cases and a stroller", rideNotes: "Meet at arrival gate" };
  const save = (version, changes = {}, actor = f.users.guest) => call("save_transport_ride_profile", { p_actor: actor, p_request: trip.id, p_expected_version: version, p_details: { ...details, ...changes } });
  const saved = async () => (await db.query("select * from transport_pickup_profiles where request_id=$1", [trip.id])).rows[0];
  await test("new ride profile saves optional photo, preferences, luggage and notes atomically", async () => {
    await save(0); const p = await saved(); assert.equal(p.version, 1); assert.equal(p.photo_path, null); assert.equal(p.luggage_count, 3); assert.deepEqual(p.ride_preferences, details.ridePreferences); assert.equal(p.ride_notes, details.rideNotes);
  });
  await test("invalid ride inputs roll back contact, version and audit changes", async () => {
    const count = (await db.query("select count(*)::int n from audit_logs where entity_id=$1", [trip.id])).rows[0].n;
    for (const changes of [{ luggageCount: 21 }, { ridePreferences: ["INVALID"] }, { ridePreferences: ["QUIET_RIDE", "QUIET_RIDE"] }, { luggageNotes: "x".repeat(301) }]) await assert.rejects(save(1, { ...changes, travelerName: "Should roll back" }));
    assert.equal((await saved()).version, 1); assert.equal((await saved()).traveler_name, details.travelerName);
    assert.equal((await db.query("select count(*)::int n from audit_logs where entity_id=$1", [trip.id])).rows[0].n, count);
  });
  await test("new save route retains the original role, ownership and stale-version guards", async () => {
    await assert.rejects(save(1, {}, f.users.manager), /PICKUP_PROFILE_FORBIDDEN/);
    await assert.rejects(save(0), /PICKUP_PROFILE_STALE/);
    const other = await hotelFixture(db); await assert.rejects(save(1, {}, other.users.guest), /PICKUP_PROFILE_NOT_FOUND/);
  });
  await call("prepare_fleet_transport", { p_actor: f.users.front_desk, p_request: trip.id, p_expected_version: 2 });
  const rows = (await db.query("select o.*,l.external_request_id,l.leg from fleet_transport_outbox o join fleet_transport_links l on l.id=o.link_id where l.request_id=$1 order by l.leg", [trip.id])).rows;
  await test("all create callers attach matching ride details to both round-trip legs", async () => {
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.deepEqual(row.payload.request.ride_preferences, details.ridePreferences); assert.equal(row.payload.request.luggage.count, 3); assert.equal(row.payload.request.passenger_notes, details.rideNotes); assert.equal(row.payload.request.guest_photo_reference, null); assert.equal(row.payload.request.special_requests, "Booking flight note");
    }
  });
  for (const row of rows) { const lease = randomUUID(); await call("claim_fleet_transport", { p_id: row.id, p_lease: lease }); await call("finish_fleet_transport", { p_id: row.id, p_lease: lease, p_reference: "fleet-" + row.leg, p_error: null, p_review: false }); }
  const event = (row, version, changes = {}) => ({ event_id: randomUUID(), source_system: "PMS", external_request_id: row.external_request_id, fleet_reference: "fleet-" + row.leg, request_version: version, status: "ASSIGNED", assignment_active: true, assignment_reference: "assignment-1", driver: { name: "Synthetic driver" }, vehicle: { plate_number: "QA 1234", description: "White QA van" }, tracking: { url: "https://track.fleet.example.invalid/ride/token-1", expires_at: new Date(Date.now() + 3600000).toISOString(), assignment_reference: "assignment-1" }, occurred_at: new Date().toISOString(), passenger_email: "must-not-project@example.invalid", ...changes });
  const receive = (body, client = db) => call("receive_fleet_transport_status", { p_event: body }, client);
  const link = async index => (await db.query("select * from fleet_transport_links where id=$1", [rows[index].link_id])).rows[0];
  let first;
  await test("versioned Fleet assignment atomically projects plate, driver and bound tracking", async () => {
    first = event(rows[0], 1); assert.equal((await receive(first)).outcome, "APPLIED"); const state = await link(0);
    assert.equal(state.guest_safety.vehicle.plate_number, "QA 1234"); assert.equal(state.guest_safety.tracking.assignment_reference, state.guest_safety.assignment_reference); assert.equal(state.guest_safety.passenger_email, undefined);
    assert.equal((await link(1)).guest_safety, null);
  });
  await test("exact replay preserves one snapshot and changed replay conflicts", async () => {
    assert.equal((await receive(first)).duplicate, true); await assert.rejects(receive({ ...first, vehicle: { plate_number: "WRONG" } }), /FLEET_EVENT_CONFLICT/); assert.equal((await link(0)).guest_safety.vehicle.plate_number, "QA 1234");
  });
  await test("reassignment replaces the plate and removes a missing replacement tracking link", async () => {
    await receive(event(rows[0], 2, { assignment_reference: "assignment-2", vehicle: { plate_number: "QA 5678" }, tracking: null })); const state = await link(0); assert.equal(state.guest_safety.vehicle.plate_number, "QA 5678"); assert.equal(state.guest_safety.tracking, null);
  });
  await test("older assignment event cannot restore an old plate or tracking token", async () => {
    assert.equal((await receive(event(rows[0], 1))).outcome, "STALE"); assert.equal((await link(0)).guest_safety.vehicle.plate_number, "QA 5678");
  });
  await test("concurrent newer callbacks leave the highest-version safety snapshot", async () => {
    const second = await suite.connect(); try {
      await Promise.all([receive(event(rows[0], 3, { vehicle: { plate_number: "QA 0003" }, tracking: null })), receive(event(rows[0], 4, { vehicle: { plate_number: "QA 0004" }, tracking: null }), second)]);
      assert.equal((await link(0)).guest_safety.vehicle.plate_number, "QA 0004");
    } finally { await second.end(); }
  });
  await test("return-leg assignment remains isolated from the outbound leg", async () => {
    await receive(event(rows[1], 1, { vehicle: { plate_number: "RETURN 1" } })); assert.equal((await link(1)).guest_safety.vehicle.plate_number, "RETURN 1"); assert.equal((await link(0)).guest_safety.vehicle.plate_number, "QA 0004");
  });
  await test("completion clears guest-facing safety details", async () => {
    await receive(event(rows[0], 5, { status: "COMPLETED", assignment_active: false, tracking: null })); assert.equal((await link(0)).guest_safety, null);
  });
  await test("revoking passenger sharing clears assignment media and tracking projection", async () => {
    await save(1, { sharingEnabled: false }); assert.equal((await link(1)).guest_safety, null); assert.equal((await link(1)).assignment_active, false);
  });
  await test("ride callbacks and preference changes do not create a guest charge", async () => {
    assert.equal((await db.query("select count(*)::int n from folio_charges where reservation_id=$1 and category='transportation'", [reservation])).rows[0].n, 0);
    assert.equal((await db.query("select status from transportation_requests where id=$1", [trip.id])).rows[0].status, "REVIEWED");
  });
  await test("browser database roles cannot invoke the new writer", async () => {
    await db.query("set role authenticated"); try { await assert.rejects(db.query("select save_transport_ride_profile(null,null,0,'{}'::jsonb)"), /permission denied/); } finally { await db.query("reset role"); }
  });
  console.log(`Fleet ride safety: ${passed} real PostgreSQL cases passed.`);
} finally { await suite.close(); }
