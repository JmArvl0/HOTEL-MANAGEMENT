// Real loopback PostgreSQL only; replay backend-remediation-db-test.mjs first.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Ajv from "ajv";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";
const schema = JSON.parse(fs.readFileSync("docs/integrations/contracts/fleet-haven-2026-11-06.schema.json"));
const sample = JSON.parse(fs.readFileSync("docs/integrations/contracts/examples/acceptance.json"));
const ajv = new Ajv({ allErrors: true }); ajv.addSchema(schema);
const validate = (name, data) => { const check = ajv.getSchema(`${schema.$id}#/definitions/${name}`); assert.ok(check(data), JSON.stringify(check.errors)); };
const suite = await hotelTestDatabase(); const { db } = suite; let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const call = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
const canonical = s => ({ event_id: s.event_id, source_system: "PMS", external_request_id: s.external_request_id, external_booking_id: s.external_booking_id, fleet_reference: s.fleet_reference, request_version: s.request_version, status: s.status, assignment_active: s.assignment_active, assignment_reference: s.assignment_reference, driver: s.assignment ? { name: s.assignment.driver_name } : null, vehicle: s.vehicle, tracking: s.tracking, occurred_at: s.occurred_at, wire_snapshot: s });
const receive = (s, client = db) => call("receive_haven_fleet_snapshot", { p_snapshot: s, p_event: canonical(s) }, client);
try {
 const f = await hotelFixture(db);
 const create = async (photo = true) => {
  const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Wire QA',$3,hotel_today()+30,hotel_today()+32,'confirmed',200) returning id", [f.guest, f.users.guest, f.type])).rows[0].id;
  const dates = (await db.query("select (hotel_today()+30)::text arrival,(hotel_today()+32)::text departure")).rows[0];
  const t = await call("customer_submit_transportation_request", { p_user_id: f.users.guest, p_reservation_id: reservation, p_service_type: "ROUND_TRIP", p_pickup_location: "QA Airport", p_dropoff_location: null, p_pickup_date: dates.arrival, p_pickup_time: "10:00", p_return_location: "QA departure", p_return_date: dates.departure, p_return_time: "14:00", p_passenger_count: 2, p_special_instructions: "Flight QA", p_idempotency_key: randomUUID() });
  await call("staff_transition_transportation_request", { p_request_id: t.id, p_action: "REVIEW", p_details: {}, p_staff_user_id: f.users.front_desk, p_expected_version: 1 });
  const details = { travelerName: "Synthetic passenger", phone: "+639171234567", email: "qa@example.invalid", photoPath: photo ? `${t.id}/${randomUUID()}.png` : null, sharingEnabled: true, ridePreferences: ["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"], luggageCount: 20, luggageNotes: "x".repeat(300), rideNotes: "x".repeat(500) };
  await call("save_transport_ride_profile", { p_actor: f.users.guest, p_request: t.id, p_expected_version: 0, p_details: details });
  await call("prepare_fleet_transport", { p_actor: f.users.front_desk, p_request: t.id, p_expected_version: 2 });
  const rows = (await db.query("select o.*,l.external_request_id,l.leg from fleet_transport_outbox o join fleet_transport_links l on l.id=o.link_id where l.request_id=$1 order by l.leg", [t.id])).rows;
  return { ...t, reservation, rows, details };
 };
 const trip = await create(); const row = trip.rows[0]; const assignment = randomUUID();
 const read = async () => (await db.query("select * from fleet_transport_links where id=$1", [row.link_id])).rows[0];
 const snapshot = (version = 1, changes = {}, r = row) => ({ ...structuredClone(sample.data), event_id: randomUUID(), external_request_id: r.external_request_id, external_booking_id: r.external_request_id, round_trip_reference: r.payload.round_trip_reference, leg_kind: r.payload.leg_kind, request_version: version, occurred_at: new Date().toISOString(), ...changes });
 const active = (version, changes = {}) => snapshot(version, { status: "ASSIGNED", assignment_active: true, assignment_reference: assignment, assignment: { driver_reference: 1, vehicle_reference: 2, vehicle_plate: "QA 1234", vehicle_model: "Van", driver_name: "QA driver", vehicle_description: "White van" }, driver: { name: "QA driver" }, vehicle: { plate_number: "QA 1234", description: "White van" }, tracking: { url: `https://track.fleet.example.invalid/ride/token-${version}`, expires_at: new Date(Date.now()+3600000).toISOString(), assignment_reference: assignment }, ...changes });
 const queue = (key = randomUUID(), expected = 2, ref = assignment, actor = f.users.front_desk) => call("queue_fleet_tracking_renewal", { p_actor: actor, p_link: row.link_id, p_key: key, p_expected: expected, p_assignment: ref });
 const claim = (id, lease = randomUUID(), client = db) => call("claim_fleet_tracking_renewal", { p_id: id, p_lease: lease }, client);
 const finish = (id, lease, s = null, error = null, review = false) => call("finish_fleet_tracking_renewal", { p_id: id, p_lease: lease, p_snapshot: s, p_event: s ? canonical(s) : null, p_error: error, p_review: review });
 const command = async id => (await db.query("select * from fleet_tracking_renewals where id=$1", [id])).rows[0];
 await test("both persisted create envelopes pass supplied JSON Schema with contacts, optional photo and maximum ride details", async () => {
  for (const r of trip.rows) { validate("InboundEnvelope", r.payload); assert.equal(r.payload.source_system, "HAVEN"); assert.equal(r.payload.request.traveler, undefined); assert.equal(r.payload.request.guest_phone, trip.details.phone); assert.equal(r.payload.request.passenger_notes.length, 500); }
  assert.deepEqual(trip.rows.map(r => r.payload.leg_kind), ["outbound", "return"]); assert.equal(trip.rows[0].payload.round_trip_reference, trip.rows[1].payload.round_trip_reference);
  const noPhoto = await create(false); for (const r of noPhoto.rows) { validate("InboundEnvelope", r.payload); assert.equal(r.payload.request.guest_photo_reference, null); assert.equal(r.payload.request.guest_photo_version, 0); }
 });
 const lease = randomUUID(); await call("claim_fleet_transport", { p_id: row.id, p_lease: lease });
 await test("invalid ACK journey rolls back reference and outbox atomically", async () => {
  const invalid = snapshot(1, { round_trip_reference: randomUUID() });
  await assert.rejects(call("finish_fleet_contract_create", { p_id: row.id, p_lease: lease, p_reference: "123", p_snapshot: invalid, p_event: canonical(invalid), p_error: null, p_review: false }), /FLEET_EVENT_CONFLICT/);
  assert.equal((await read()).fleet_reference, null); assert.equal((await db.query("select state from fleet_transport_outbox where id=$1", [row.id])).rows[0].state, "SENDING");
 });
 let ack;
 await test("wrapped create ACK commits reference and its status evidence together", async () => {
  ack = snapshot(); validate("Acceptance", { success: true, data: ack });
  assert.equal(await call("finish_fleet_contract_create", { p_id: row.id, p_lease: lease, p_reference: "123", p_snapshot: ack, p_event: canonical(ack), p_error: null, p_review: false }), true);
  assert.equal((await read()).partner_status, "RECEIVED"); assert.equal((await read()).partner_version, "1"); assert.equal((await receive(ack)).duplicate, true);
 });
 await test("wrong external revision, leg and journey cannot cross-link another ride", async () => {
  for (const changes of [{ external_revision: 2 }, { leg_kind: "return" }, { round_trip_reference: "wrong" }]) await assert.rejects(receive(snapshot(2, changes)), /FLEET_EVENT_CONFLICT/);
 });
 await test("versioned active assignment saves only current driver and plate for guests", async () => {
  const s = active(2); validate("StatusSnapshot", s); assert.equal((await receive(s)).outcome, "APPLIED"); assert.equal((await read()).guest_safety.vehicle.plate_number, "QA 1234");
 });
 await test("all four photo fields must match consent, original ride and current assignment", async () => {
  const p = (await db.query("select * from transport_pickup_profiles where request_id=$1", [trip.id])).rows[0];
  const args = { p_external: row.external_request_id, p_photo: p.photo_reference, p_version: p.photo_version, p_assignment: assignment };
  assert.equal((await call("authorize_fleet_pickup_photo", args)).photo_path, p.photo_path);
  for (const changes of [{ p_assignment: randomUUID() }, { p_version: p.photo_version+1 }, { p_photo: randomUUID() }, { p_external: trip.rows[1].external_request_id }]) assert.equal(await call("authorize_fleet_pickup_photo", { ...args, ...changes }), null);
 });
 await test("Front Desk only, current version and current assignment are required for renewal", async () => {
  await assert.rejects(queue(randomUUID(), 2, assignment, f.users.manager), /FLEET_FORBIDDEN/);
  await assert.rejects(queue(randomUUID(), 1), /FLEET_REQUEST_STALE/);
  await assert.rejects(queue(randomUUID(), 2, randomUUID()), /FLEET_ASSIGNMENT_NOT_ACTIVE/);
 });
 let id; let renewalLease;
 await test("concurrent renewal clicks reuse one durable command and stable idempotency payload", async () => {
  const second = await suite.connect(); try {
   const ids = await Promise.all([queue(), call("queue_fleet_tracking_renewal", { p_actor: f.users.front_desk, p_link: row.link_id, p_key: randomUUID(), p_expected: 2, p_assignment: assignment }, second)]); assert.equal(ids[0], ids[1]); id = ids[0];
  } finally { await second.end(); }
  assert.equal(await queue(id), id); await assert.rejects(queue(id, 3), /FLEET_EVENT_CONFLICT/);
  renewalLease = randomUUID(); const c = await claim(id, renewalLease); validate("TrackingRenewal", c.payload); assert.deepEqual(c.payload, { event_id: id, expected_request_version: 2, assignment_reference: assignment }); assert.equal(await claim(id), null);
 });
 await test("failed renewal backs off and exact retry retains original version, key and assignment", async () => {
  assert.equal(await finish(id, renewalLease, null, "FLEET_RENEWAL_UNCERTAIN"), "FAILED"); assert.equal(await claim(id), null);
  await db.query("update fleet_tracking_renewals set next_attempt_at=now() where id=$1", [id]); renewalLease = randomUUID();
  const c = await claim(id, renewalLease); assert.equal(c.payload.event_id, id); assert.equal(c.payload.expected_request_version, 2); assert.equal((await command(id)).attempts, 2);
 });
 await test("stale finisher lease cannot write a renewal result", async () => {
  assert.equal(await finish(id, randomUUID(), active(3)), "NEEDS_REVIEW"); assert.equal((await read()).partner_version, "2"); assert.equal((await command(id)).state, "SENDING");
 });
 let renewed;
 await test("renewal accepts a higher snapshot, rotates link and commits inbox before success", async () => {
  renewed = active(3); validate("RenewalSuccess", { success: true, outcome: "renewed", data: renewed });
  assert.equal(await finish(id, renewalLease, renewed), "SUCCEEDED"); assert.equal((await read()).guest_safety.tracking.url, renewed.tracking.url); assert.equal((await receive(renewed)).duplicate, true); assert.equal(await claim(id), null);
 });
 await test("callback before a lost HTTP result can retry exactly without rotating another token", async () => {
  const next = await queue(randomUUID(), 3); const token = randomUUID(); await claim(next, token); const s = active(4);
  await receive(s); await finish(next, token, null, "FLEET_RENEWAL_UNCERTAIN");
  await db.query("update fleet_tracking_renewals set next_attempt_at=now() where id=$1", [next]); const retry = randomUUID();
  assert.equal((await claim(next, retry)).payload.expected_request_version, 3); assert.equal(await queue(next, 3), next);
  assert.equal(await finish(next, retry, s), "SUCCEEDED"); assert.equal((await read()).partner_version, "4");
 });
 await test("same token or wrong assignment ACK rolls back and keeps operation unresolved", async () => {
  const next = await queue(randomUUID(), 4); const token = randomUUID(); await claim(next, token);
  await assert.rejects(finish(next, token, active(5, { tracking: (await read()).guest_safety.tracking })), /FLEET_RENEWAL_RESULT_CONFLICT/);
  await assert.rejects(finish(next, token, active(5, { assignment_reference: randomUUID() })), /FLEET_RENEWAL_RESULT_CONFLICT/);
  assert.equal((await command(next)).state, "SENDING"); await finish(next, token, null, "INVALID_ACK", true);
 });
 await test("older renewal response cannot replace a newer completion or restore tracking", async () => {
  const next = await queue(randomUUID(), 4); const token = randomUUID(); await claim(next, token);
  await receive(snapshot(6, { status: "COMPLETED" })); assert.equal((await read()).guest_safety, null);
  assert.equal(await finish(next, token, active(5)), "SUCCEEDED"); assert.equal((await read()).partner_status, "COMPLETED"); assert.equal((await read()).guest_safety, null);
  await assert.rejects(queue(randomUUID(), 6), /FLEET_ASSIGNMENT_NOT_ACTIVE/);
 });
 await test("new legacy PMS events are refused; only immutable previously stored legacy replays are acknowledged", async () => {
  const fresh = { event_id: randomUUID(), source_system: "PMS", external_request_id: row.external_request_id, fleet_reference: "123", request_version: 1, status: "RECEIVED" };
  await assert.rejects(call("replay_fleet_transport_status", { p_event: fresh }), /FLEET_LEGACY_EVENT_NOT_FOUND/);
  await call("receive_fleet_transport_status", { p_event: fresh }); assert.equal((await call("replay_fleet_transport_status", { p_event: fresh })).duplicate, true);
  await assert.rejects(call("replay_fleet_transport_status", { p_event: { ...fresh, status: "ASSIGNED" } }), /FLEET_EVENT_CONFLICT/);
 });
 await test("fare evidence and corrections never create a folio charge", async () => {
  const s = snapshot(7, { status: "COMPLETED", fare: { fare_amount_minor: 12345, currency: "PHP", fare_version: 2, fare_reference: randomUUID(), fare_revision_id: randomUUID(), previous_fare_revision_id: randomUUID(), previous_fare_version: 1, correction_reason: "Corrected synthetic amount" } });
  validate("StatusSnapshot", s); await receive(s); assert.equal((await db.query("select payload->'wire_snapshot'->'fare'->>'fare_amount_minor' amount from fleet_transport_inbox where event_id=$1", [s.event_id])).rows[0].amount, "12345");
  assert.equal((await db.query("select count(*)::int n from folio_charges where reservation_id=$1", [trip.reservation])).rows[0].n, 0);
 });
 await test("browser roles have no renewal table or writer privileges", async () => {
  await db.query("set role authenticated"); try {
   await assert.rejects(db.query("select * from fleet_tracking_renewals"), /permission denied/);
   await assert.rejects(db.query("select claim_fleet_tracking_renewal(null,null)"), /permission denied/);
   await assert.rejects(db.query("select authorize_fleet_pickup_photo(null,null,1,null)"), /permission denied/);
  } finally { await db.query("reset role"); }
 });
 console.log(`Fleet supplied wire: ${passed} real PostgreSQL cases passed.`);
} finally { await suite.close(); }
