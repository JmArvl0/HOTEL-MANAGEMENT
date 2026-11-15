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
 const revoke = (r,expected=2,confirm=false,actor=f.users.front_desk) => call("queue_fleet_tracking_revocation", {p_actor:actor,p_link:r.link_id,p_expected:expected,p_confirm_conflict:confirm});
 const state = async r => (await db.query("select * from fleet_tracking_revocations where link_id=$1",[r.link_id])).rows[0];
 const claimRevoke = (r,lease=randomUUID(),client=db) => call("claim_fleet_tracking_revocation",{p_link:r.link_id,p_lease:lease},client);
 const finishRevoke = (r,lease,status,s=null,retry=null) => call("finish_fleet_tracking_revocation",{p_link:r.link_id,p_lease:lease,p_state:status,p_snapshot:s,p_event:s?canonical(s):null,p_error:status==='SUCCEEDED'?null:'SYNTHETIC',p_retry_after:retry});
 const accept = async t => {for(const r of t.rows){const token=randomUUID();await call("claim_fleet_transport",{p_id:r.id,p_lease:token});const s=snapshot(1,{},r);validate("Acceptance",{success:true,data:s});await call("finish_fleet_contract_create",{p_id:r.id,p_lease:token,p_reference:'123',p_snapshot:s,p_event:canonical(s),p_error:null,p_review:false});const assigned=active(2,{external_request_id:r.external_request_id,external_booking_id:r.external_request_id,round_trip_reference:r.payload.round_trip_reference,leg_kind:r.payload.leg_kind});await receive(assigned);}};
 await accept(trip);
 await test("withdrawal and its durable operations roll back with invalid profile details",async()=>{
  await assert.rejects(call('save_transport_ride_profile',{p_actor:f.users.guest,p_request:trip.id,p_expected_version:1,p_details:{...trip.details,sharingEnabled:false,luggageCount:21}}));
  assert.equal((await db.query('select count(*)::int n from fleet_tracking_revocations')).rows[0].n,0);
 });
 await test("guest sharing withdrawal atomically queues both attempted round-trip legs",async()=>{
  await call('save_transport_ride_profile',{p_actor:f.users.guest,p_request:trip.id,p_expected_version:1,p_details:{...trip.details,sharingEnabled:false}});
  for(const r of trip.rows){assert.equal((await state(r)).state,'PENDING');assert.equal((await state(r)).expected_version,2);}
  assert.equal((await read()).guest_safety,null);
 });
 await test("re-consent cannot discard withdrawal or restore a renewable public link",async()=>{
  await call('save_transport_ride_profile',{p_actor:f.users.guest,p_request:trip.id,p_expected_version:2,p_details:{...trip.details,sharingEnabled:true}});
  assert.equal((await state(row)).state,'PENDING');assert.equal((await read()).guest_safety,null);
  await assert.rejects(call('queue_fleet_tracking_revocation',{p_actor:f.users.guest,p_link:row.link_id,p_expected:2,p_confirm_conflict:false}),/FLEET_FORBIDDEN/);
 });
 let lease=randomUUID();
 await test("concurrent claims allow only one lease and preserve exact DELETE version",async()=>{
  const second=await suite.connect();try{const results=await Promise.all([claimRevoke(row,lease),claimRevoke(row,randomUUID(),second)]);assert.equal(results.filter(Boolean).length,1);assert.equal(results.find(Boolean).expectedVersion,2);lease=(await state(row)).lease_id;}finally{await second.end();}
 });
 await test("lost HTTP result backs off, honors Retry-After, and reuses the same version",async()=>{
  const retry=new Date(Date.now()+7200000).toISOString();assert.equal(await finishRevoke(row,lease,'FAILED',null,retry),'FAILED');assert.ok(new Date((await state(row)).next_attempt_at)>=new Date(retry));assert.equal(await claimRevoke(row),null);
  await db.query('update fleet_tracking_revocations set next_attempt_at=now() where link_id=$1',[row.link_id]);lease=randomUUID();assert.equal((await claimRevoke(row,lease)).expectedVersion,2);
 });
 await test("wrong source or tracking-bearing success rolls back the receipt",async()=>{
  await assert.rejects(finishRevoke(row,lease,'SUCCEEDED',active(4)),/FLEET_EVENT_CONFLICT/);
  await assert.rejects(finishRevoke(row,lease,'SUCCEEDED',snapshot(4,{external_request_id:'other'})),/FLEET_EVENT_CONFLICT/);
  assert.equal((await state(row)).state,'SENDING');
 });
 await test("stale lease cannot acknowledge another sender's response",async()=>{
  assert.equal(await finishRevoke(row,randomUUID(),'SUCCEEDED',snapshot(4)),'NEEDS_REVIEW');assert.equal((await state(row)).state,'SENDING');
 });
 await test("already-revoked current snapshot may be newer than the original DELETE version",async()=>{
  const s=active(4,{tracking:null});assert.equal(await finishRevoke(row,lease,'SUCCEEDED',s),'SUCCEEDED');assert.equal((await state(row)).expected_version,2);assert.equal((await receive(s)).duplicate,true);assert.equal(await claimRevoke(row),null);
 });
 const back=trip.rows[1];let token=randomUUID();await claimRevoke(back,token);
 await test("409 stores evidence and blocks retries until explicit reviewed version confirmation",async()=>{
  const current=active(5,{external_request_id:back.external_request_id,external_booking_id:back.external_request_id,leg_kind:back.payload.leg_kind});assert.equal(await finishRevoke(back,token,'CONFLICT',current),'CONFLICT');assert.equal((await state(back)).conflict_version,5);assert.equal(await claimRevoke(back),null);
  await assert.rejects(revoke(back,5),/FLEET_REVOCATION_REVIEW_REQUIRED/);await assert.rejects(revoke(back,4,true),/FLEET_REVOCATION_REVIEW_REQUIRED/);await revoke(back,5,true);token=randomUUID();assert.equal((await claimRevoke(back,token)).expectedVersion,5);
  assert.equal(await finishRevoke(back,token,'SUCCEEDED',snapshot(6,{},back)),'SUCCEEDED');
 });
 const manual=await create();await accept(manual);const m=manual.rows[0];
 await test("Front Desk can revoke one leg while preserving the other leg's tracking",async()=>{
  await assert.rejects(revoke(m,2,false,f.users.manager),/FLEET_FORBIDDEN/);await assert.rejects(revoke(m,1),/FLEET_REQUEST_STALE/);await revoke(m);const l=(await db.query('select guest_safety from fleet_transport_links where id=$1',[m.link_id])).rows[0];assert.equal(l.guest_safety.tracking,null);assert.ok((await db.query('select guest_safety from fleet_transport_links where id=$1',[manual.rows[1].link_id])).rows[0].guest_safety.tracking);
 });
 await test("later higher assignment callback cannot resurrect withdrawn tracking",async()=>{
  const s=active(3,{external_request_id:m.external_request_id,external_booking_id:m.external_request_id,round_trip_reference:manual.id,leg_kind:m.payload.leg_kind});assert.equal((await receive(s)).outcome,'APPLIED');const l=(await db.query('select * from fleet_transport_links where id=$1',[m.link_id])).rows[0];assert.equal(l.guest_safety.tracking,null);assert.equal(l.guest_safety.vehicle.plate_number,'QA 1234');
  await assert.rejects(call('queue_fleet_tracking_renewal',{p_actor:f.users.front_desk,p_link:m.link_id,p_key:randomUUID(),p_expected:3,p_assignment:assignment}),/FLEET_SHARING_REVOKED/);
 });
 await test("revocation can finish for a known completed leg",async()=>{
  await receive(snapshot(4,{external_request_id:m.external_request_id,external_booking_id:m.external_request_id,round_trip_reference:manual.id,leg_kind:m.payload.leg_kind,status:'COMPLETED'}));const tok=randomUUID();await claimRevoke(m,tok);assert.equal(await finishRevoke(m,tok,'SUCCEEDED',snapshot(5,{status:'COMPLETED'},m)),'SUCCEEDED');assert.equal((await db.query('select guest_safety from fleet_transport_links where id=$1',[m.link_id])).rows[0].guest_safety,null);
 });
 const uncertain=await create(false);const u=uncertain.rows[0];const sendToken=randomUUID();await call('claim_fleet_transport',{p_id:u.id,p_lease:sendToken});
 await test("withdrawal racing a lost create ACK queues version discovery instead of guessing",async()=>{
  await call('save_transport_ride_profile',{p_actor:f.users.guest,p_request:uncertain.id,p_expected_version:1,p_details:{...uncertain.details,sharingEnabled:false}});assert.equal((await state(u)).expected_version,null);const tok=randomUUID();assert.equal((await claimRevoke(u,tok)).expectedVersion,null);const s=snapshot(1,{},u);assert.equal(await call('resolve_fleet_revocation_version',{p_link:u.link_id,p_lease:tok,p_snapshot:s,p_event:canonical(s)}),1);assert.equal((await state(u)).expected_version,1);assert.equal(await finishRevoke(u,tok,'SUCCEEDED',snapshot(2,{},u)),'SUCCEEDED');
 });
 await test("no-attempt prepared legs do not invent a remote revocation",async()=>{
  assert.equal(await state(uncertain.rows[1]),undefined);
 });
 await test("browser roles cannot access revocation records or service writers",async()=>{
  await db.query('set role authenticated');try{await assert.rejects(db.query('select * from fleet_tracking_revocations'),/permission denied/);await assert.rejects(db.query('select claim_fleet_tracking_revocation(null,null)'),/permission denied/);}finally{await db.query('reset role');}
 });
 await test("tracking lifecycle never adds a transportation charge",async()=>{
  assert.equal((await db.query("select count(*)::int n from folio_charges where reservation_id=$1",[trip.reservation])).rows[0].n,0);
 });
 console.log(`Fleet revocation: ${passed} real PostgreSQL cases passed.`);
} finally { await suite.close(); }
