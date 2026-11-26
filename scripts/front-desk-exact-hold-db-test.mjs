import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

export async function verifyExactHoldAssignment({ db }) {
  const fixture = await hotelFixture(db, 2);
  const [heldRoom, otherRoom] = fixture.rooms;
  const { rows: [stay] } = await db.query(`
    insert into reservations(guest_id, guest_name, room_type, status, check_in, check_out, total)
    values($1, 'Synthetic Front Desk', $2, 'confirmed', hotel_today()+2, hotel_today()+4, 200)
    returning id, check_in::text as arrival, check_out::text as departure`, [fixture.guest, fixture.type]);
  const eligibleRooms = async () => {
    const rooms = await rpc(db, "front_desk_eligible_room_inventory", { p_reservation_id: stay.id });
    return rooms.filter(room => room.room_type_name === fixture.type).map(room => room.room_id);
  };
  const assignHeldRoom = () => rpc(db, "front_desk_assign_room", {
    p_reservation_id: stay.id,
    p_room_id: heldRoom.id,
    p_reason: null,
    p_staff_user_id: fixture.users.front_desk,
  });
  const assignment = async () => {
    const { rows: [state] } = await db.query(`
      select r.room_id, (select count(*)::int from reservation_room_assignments a
        where a.reservation_id=r.id and a.status='active') as active_assignments
      from reservations r where r.id=$1`, [stay.id]);
    return state;
  };

  assert.deepEqual(await eligibleRooms(), [heldRoom.id, otherRoom.id]);
  const [{ create_exact_booking_hold: token }] = await rpc(db, "create_exact_booking_hold", {
    p_user_id: fixture.users.guest,
    p_room_id: heldRoom.id,
    p_details: {
      roomType: fixture.type, checkIn: stay.arrival, checkOut: stay.departure, guests: 1,
      firstName: "Synthetic", lastName: "Guest", email: "exact-hold@example.invalid",
      mobile: "+639170000079", address: "Synthetic test address",
    },
  });
  assert.deepEqual(await eligibleRooms(), [otherRoom.id]);
  await assert.rejects(assignHeldRoom, { message: "EXACT_ROOM_UNAVAILABLE", detail: "ROOM_HELD_FOR_GUEST" });
  assert.deepEqual(await assignment(), { room_id: null, active_assignments: 0 });

  const { rows: [expired] } = await db.query(`
    update booking_holds set expires_at=clock_timestamp()-interval '1 second'
    where token=$1 returning status, reservation_id`, [token]);
  assert.deepEqual(expired, { status: "active", reservation_id: null });
  assert.deepEqual(await eligibleRooms(), [heldRoom.id, otherRoom.id]);
  await assignHeldRoom();
  assert.deepEqual(await assignment(), { room_id: heldRoom.id, active_assignments: 1 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = await hotelTestDatabase();
  try {
    await verifyExactHoldAssignment(suite);
    console.log("PASS exact hold eligibility, atomic assignment conflict, and expiry");
  } finally {
    await suite.close();
  }
}
