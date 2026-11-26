// Real Front Office workflow checks against the disposable local migration replay.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
const q = async (query, values) => (await db.query(query, values)).rows;
const result = async (client, name, args) => (await rpc(client, name, args))[0]?.[name];

try {
  const { guest, type, users, tag } = await hotelFixture(db, 2);
  const other = await hotelFixture(db, 1);
  const dates = (await q("select (hotel_today()+3)::text as arrival, (hotel_today()+4)::text as departure"))[0];
  const actor = users.front_desk;
  const create = {
    p_actor: actor, p_key: randomUUID(), p_guest_id: guest, p_guest_name: null, p_email: null, p_phone: null,
    p_stay_phone: "+639171234568", p_room_type: type, p_check_in: dates.arrival, p_check_out: dates.departure,
    p_guest_count: 1, p_source: "Phone", p_requests: "Extra pillow", p_arrival: "16:00", p_quoted_total: 100,
  };
  await q("update guests set phone=$1 where id=$2", ["+639171234567", guest]);
  const search = await rpc(db, "hotel_staff_booking_guests", { p_actor: actor, p_query: `${tag}@example.invalid` });
  assert.deepEqual(search.map(row => row.id), [guest]);
  await assert.rejects(rpc(db, "hotel_staff_booking_guests", { p_actor: users.housekeeping, p_query: tag }), /HOTEL_FORBIDDEN/);

  const parallel = await suite.connect();
  let booking;
  try {
    const [first, replay] = await Promise.all([result(db, "hotel_staff_booking_create", create), result(parallel, "hotel_staff_booking_create", create)]);
    assert.deepEqual(first, replay);
    booking = first.reservation_id;
  } finally { await parallel.end(); }
  assert.deepEqual((await q("select guest_id,guest_phone,source,total from reservations where id=$1", [booking]))[0], {
    guest_id: guest, guest_phone: "+639171234568", source: "Phone", total: "100.00",
  });
  assert.equal((await q("select count(*)::int as n from invoices where reservation_id=$1", [booking]))[0].n, 1);
  assert.equal((await q("select phone from guests where id=$1", [guest]))[0].phone, "+639171234567");
  assert.equal((await result(db, "hotel_staff_booking_result", { p_actor: actor, p_key: create.p_key })).reservation_id, booking);
  assert.equal(await result(db, "hotel_staff_booking_result", { p_actor: other.users.front_desk, p_key: create.p_key }), null);
  await assert.rejects(result(db, "hotel_staff_booking_create", { ...create, p_stay_phone: "+639171234569" }), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(result(db, "hotel_staff_booking_create", { ...create, p_key: randomUUID(), p_quoted_total: 50 }), /BOOKING_QUOTE_CHANGED/);
  await assert.rejects(result(db, "hotel_staff_booking_create", {
    ...create, p_key: randomUUID(), p_guest_id: null, p_guest_name: "Another guest", p_email: `${tag}@example.invalid`, p_phone: "+639171234568",
  }), /GUEST_SELECTION_REQUIRED/);
  console.log("PASS guest identity, quote, scoped recovery, and concurrent booking retry");

  const readiness = await result(db, "hotel_staff_arrival_readiness", { p_actor: actor, p_reservation_ids: `{${booking}}` });
  assert.ok(readiness[booking].checkIn.includes("ROOM_REQUIRED"));
  const edit = { p_actor: actor, p_guest_id: guest, p_expected: { phone: "+639171234567", address: null, preferences: null }, p_phone: "+639171234569", p_address: null, p_preferences: "Extra pillows" };
  await result(db, "hotel_staff_edit_guest_profile", edit);
  await result(db, "hotel_staff_edit_guest_profile", edit);
  await assert.rejects(result(db, "hotel_staff_edit_guest_profile", { ...edit, p_preferences: "Higher floor" }), /GUEST_PROFILE_CHANGED/);
  assert.equal((await q("select count(*)::int as n from audit_logs where entity_id=$1 and action='update_guest_profile'", [guest]))[0].n, 1);
  await result(db, "front_desk_update_guest", { p_reservation_id: booking, p_phone: "+639171234560", p_expected_arrival: null, p_operational_notes: null, p_staff_user_id: actor });
  assert.equal((await q("select phone from guests where id=$1", [guest]))[0].phone, "+639171234569");
  assert.equal((await q("select guest_phone from reservations where id=$1", [booking]))[0].guest_phone, "+639171234560");
  console.log("PASS readiness and versioned profile edits stay separate from reservation contact");

  const closure = { p_actor: actor, p_reservation_id: booking, p_status: "cancelled", p_reason_code: "travel_disruption", p_reason: "Travel disruption" };
  await result(db, "hotel_staff_close_reservation", closure);
  await result(db, "hotel_staff_close_reservation", { ...closure, p_reason_code: "duplicate_booking" });
  assert.deepEqual((await q("select status,cancellation_reason_code from reservations where id=$1", [booking]))[0], {
    status: "cancelled", cancellation_reason_code: "travel_disruption",
  });
  console.log("PASS cancellation reason is retained across settlement retries");

  const incomplete = (await q("insert into guests(name) values('Guest with missing contact') returning id"))[0].id;
  const missingContact = { ...create, p_key: randomUUID(), p_guest_id: incomplete, p_stay_phone: null };
  await assert.rejects(result(db, "hotel_staff_booking_create", missingContact), /INVALID_GUEST_DETAILS/);
  const withContact = await result(db, "hotel_staff_booking_create", { ...missingContact, p_email: `${tag}-stay@example.invalid`, p_stay_phone: "+639171234567" });
  assert.equal((await q("select guest_email from reservations where id=$1", [withContact.reservation_id]))[0].guest_email, `${tag}-stay@example.invalid`);
  assert.deepEqual((await q("select email,phone from guests where id=$1", [incomplete]))[0], { email: null, phone: null });
  console.log("PASS missing profile contact can be supplied for one stay");
} finally {
  await suite.close();
}
