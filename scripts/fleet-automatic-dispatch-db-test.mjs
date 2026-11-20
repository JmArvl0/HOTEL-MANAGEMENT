import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const isolated = await hotelTestDatabase();
const { db } = isolated;
const one = async (query, args = []) => (await db.query(query, args)).rows[0];
const call = async (name, args) => (await rpc(db, name, args))[0][name];

try {
  const fixture = await hotelFixture(db, 0);
  const profile = {
    travelerName: "Synthetic passenger",
    phone: "+12025550101",
    sharingEnabled: true,
    ridePreferences: ["QUIET_RIDE", "HELP_WITH_LUGGAGE"],
  };
  async function createStay(status = "confirmed", preferences = null) {
    return one(`insert into reservations
      (guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,source,confirmation_number,transportation_preferences)
      values($1,$2,$3,$4,hotel_today()+10,hotel_today()+12,$5,200,'Website',$6,$7)
      returning id,check_in::text,check_out::text`,
    [fixture.guest, fixture.users.guest, profile.travelerName, fixture.type, status, randomUUID(), preferences]);
  }
  const pickup = stay => ({ serviceType: "PICKUP", pickupLocation: "Test airport terminal S", pickupDate: stay.check_in, pickupTime: "14:00", passengerCount: 1 });
  const send = (actor, stay, ride = pickup(stay), contact = profile, key = randomUUID()) => call("submit_fleet_transportation_request", {
    p_actor: actor, p_reservation_id: stay.id, p_ride: ride, p_profile: contact, p_idempotency_key: key,
  });
  const outbox = id => db.query(`select o.id,o.payload,o.auto_dispatch,o.state,l.external_request_id from fleet_transport_outbox o
    join fleet_transport_links l on l.id=o.link_id where l.request_id=$1 order by l.leg`, [id]).then(result => result.rows);
  const charges = id => one("select count(*)::int as count,coalesce(sum(amount),0)::text as amount from folio_charges where reservation_id=$1 and category='transportation'", [id]);

  const selfService = await createStay();
  await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,$2,200,0,200,'unpaid')",
    [selfService.id, profile.travelerName]);
  const requestKey = randomUUID();
  await assert.rejects(send(fixture.users.manager, selfService), /CUSTOMER_ACCESS_REQUIRED/);
  await assert.rejects(send(fixture.users.guest, selfService, pickup(selfService), { ...profile, sharingEnabled: false }), /FLEET_PICKUP_CONSENT_REQUIRED/);
  const saved = await send(fixture.users.guest, selfService, pickup(selfService), profile, requestKey);
  assert.equal(saved.status, "REQUESTED");
  assert.deepEqual(await send(fixture.users.guest, selfService, pickup(selfService), profile, requestKey), saved);
  await assert.rejects(send(fixture.users.guest, selfService, pickup(selfService), { ...profile, ridePreferences: [] }, requestKey), /RETRY_PAYLOAD_CONFLICT/);
  const [leg] = await outbox(saved.id);
  assert.equal((await outbox(saved.id)).length, 1);
  assert.equal(leg.auto_dispatch, true);
  assert.equal(leg.payload.request.guest_phone, profile.phone);
  assert.deepEqual(leg.payload.request.ride_preferences, profile.ridePreferences);
  assert.equal((await charges(selfService.id)).count, 0);
  await assert.rejects(call("staff_transition_transportation_request", {
    p_request_id: saved.id, p_action: "REVIEW", p_details: {}, p_staff_user_id: fixture.users.front_desk, p_expected_version: 1,
  }), /TRANSPORTATION_USE_FLEET/);

  const lease = randomUUID();
  assert.ok(await call("claim_fleet_transport", { p_id: leg.id, p_lease: lease }));
  assert.equal(await call("claim_fleet_transport", { p_id: leg.id, p_lease: randomUUID() }), null);
  const sample = JSON.parse(readFileSync("docs/integrations/contracts/examples/acceptance.json", "utf8")).data;
  const snapshot = { ...sample, event_id: randomUUID(), external_request_id: leg.external_request_id,
    external_booking_id: leg.external_request_id, round_trip_reference: saved.id, leg_kind: "outbound",
    status: "COMPLETED", request_version: 1, occurred_at: new Date().toISOString(),
    fare: { fare_amount_minor: 32123, currency: "PHP", fare_version: 1, fare_reference: randomUUID(),
      fare_revision_id: randomUUID(), previous_fare_revision_id: null, previous_fare_version: null, correction_reason: null } };
  const event = { event_id: snapshot.event_id, source_system: "PMS", external_request_id: leg.external_request_id,
    external_booking_id: leg.external_request_id, fleet_reference: snapshot.fleet_reference,
    request_version: 1, status: "COMPLETED", assignment_active: false, assignment_reference: null,
    driver: null, vehicle: null, tracking: null, occurred_at: snapshot.occurred_at, wire_snapshot: snapshot };
  assert.equal(await call("finish_fleet_contract_create", {
    p_id: leg.id, p_lease: lease, p_reference: snapshot.fleet_reference, p_snapshot: snapshot, p_event: event, p_error: null, p_review: false,
  }), true);
  assert.equal((await charges(selfService.id)).count, 0);
  const fare = await call("get_transportation_fleet_fare", { p_request: saved.id });
  assert.equal(fare.quote.amountMinor, 32123);
  const confirm = () => call("post_confirmed_fleet_fare", { p_request: saved.id, p_actor: fixture.users.front_desk, p_revision: fare.quote.revision });
  assert.equal((await confirm()).alreadyConfirmed, false);
  assert.equal((await call("receive_haven_fleet_snapshot", { p_snapshot: snapshot, p_event: event })).duplicate, true);
  assert.equal((await confirm()).alreadyConfirmed, true);
  assert.deepEqual(await charges(selfService.id), { count: 1, amount: "321.23" });
  assert.equal((await one("select balance::text from invoices where reservation_id=$1", [selfService.id])).balance, "521.23");
  console.log("PASS guest pickup queues immediately and confirmed Fleet fare posts once across retries");

  const walkUp = await createStay();
  const roundTrip = { ...pickup(walkUp), serviceType: "ROUND_TRIP", returnLocation: "Test airport terminal W",
    returnDate: walkUp.check_out, returnTime: "12:00" };
  const staffRide = await send(fixture.users.front_desk, walkUp, roundTrip);
  const staffLegs = await outbox(staffRide.id);
  assert.equal(staffLegs.length, 2);
  assert.equal(new Set(staffLegs.map(row => row.payload.event_id)).size, 2);
  assert.equal((await one("select user_id from audit_logs where entity_id=$1 and action='front_desk_submit_transportation_request'", [staffRide.id])).user_id, fixture.users.front_desk);
  console.log("PASS walk-up ride uses the existing guest stay, staff audit and one payload per leg");

  const checkout = await createStay("pending", {
    ...pickup(selfService), pickupLocation: "Test airport terminal B",
    fleetOptions: { sharingEnabled: true, contactPhone: profile.phone, ridePreferences: ["HELP_WITH_LUGGAGE"] },
  });
  const countRides = () => one("select count(*)::int as count from transportation_requests where reservation_id=$1", [checkout.id]);
  assert.equal((await countRides()).count, 0);
  await assert.rejects(send(fixture.users.guest, checkout), /RESERVATION_NOT_REQUEST_READY/);
  await db.query("update reservations set status='confirmed' where id=$1", [checkout.id]);
  const filed = await one("select id from transportation_requests where reservation_id=$1", [checkout.id]);
  assert.ok(filed);
  const [checkoutLeg] = await outbox(filed.id);
  assert.equal(checkoutLeg.auto_dispatch, true);
  assert.equal(checkoutLeg.state, "PREPARED");
  assert.equal(checkoutLeg.payload.request.guest_name, profile.travelerName);
  assert.equal(checkoutLeg.payload.request.guest_phone, profile.phone);
  assert.deepEqual(checkoutLeg.payload.request.ride_preferences, ["HELP_WITH_LUGGAGE"]);
  await db.query("update reservations set status='confirmed' where id=$1", [checkout.id]);
  assert.equal((await countRides()).count, 1);
  assert.equal((await outbox(filed.id))[0].id, checkoutLeg.id);
  assert.ok(await call("claim_fleet_transport", { p_id: checkoutLeg.id, p_lease: randomUUID() }));
  console.log("PASS room booking queues Fleet only on confirmation and reuses the saved ride");
} finally {
  await isolated.close();
}
