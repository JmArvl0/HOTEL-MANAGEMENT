import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

export async function verifyExtensionReplay({ db, connect }) {
  const { rows: [permissions] } = await db.query(`
    select has_function_privilege('authenticated', 'public.front_desk_extend_stay(text,date,text,uuid,uuid)', 'EXECUTE') as direct_call,
      has_table_privilege('anon', 'public.front_desk_extension_receipts', 'SELECT') as anonymous_receipt,
      has_table_privilege('authenticated', 'public.front_desk_extension_receipts', 'SELECT') as direct_receipt`);
  assert.deepEqual(permissions, { direct_call: false, anonymous_receipt: false, direct_receipt: false });

  const fixture = await hotelFixture(db, 2);
  const peer = await hotelFixture(db, 0);
  const { rows: [dates] } = await db.query(
    "select (hotel_today()+2)::text as first, (hotel_today()+3)::text as second, (hotel_today()+4)::text as third",
  );
  const stays = [];
  for (const room of fixture.rooms) {
    const { rows: [stay] } = await db.query(`
      insert into reservations(guest_id, guest_name, room_type, room_id, room_number, status, check_in, check_out, total)
      values($1, 'Synthetic extension guest', $2, $3, $4, 'checked_in', hotel_today()-1, hotel_today()+1, 200)
      returning id`, [fixture.guest, fixture.type, room.id, room.number]);
    await db.query(`insert into invoices(reservation_id, guest_name, amount, paid, balance, status)
      values($1, 'Synthetic extension guest', 200, 0, 200, 'unpaid')`, [stay.id]);
    await db.query(`insert into reservation_room_assignments(reservation_id, room_id, check_in, check_out, assigned_by)
      select id, room_id, check_in, check_out, $2 from reservations where id=$1`, [stay.id, fixture.users.front_desk]);
    stays.push(stay.id);
  }
  const payload = {
    p_reservation_id: stays[0], p_new_check_out: dates.first, p_reason: "Synthetic additional night",
    p_idempotency_key: randomUUID(), p_staff_user_id: fixture.users.front_desk,
  };
  const extend = async (client, changes = {}) => (await rpc(client, "front_desk_extend_stay", { ...payload, ...changes }))[0];
  const other = await connect();
  try {
    const [original, simultaneous] = await Promise.all([extend(db), extend(other)]);
    assert.deepEqual(simultaneous, original);
    assert.equal(Number(original.additional_amount), 100);
    for (const changes of [
      { p_reason: "Synthetic different reason" },
      { p_new_check_out: dates.second },
      { p_staff_user_id: peer.users.front_desk },
      { p_reservation_id: stays[1] },
    ]) await assert.rejects(extend(db, changes), /EXTENSION_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(extend(db, { p_staff_user_id: fixture.users.manager }), /EXTENSION_FORBIDDEN/);

    const later = await extend(db, { p_new_check_out: dates.second, p_idempotency_key: randomUUID() });
    assert.ok(Number(later.new_balance) > Number(original.new_balance));
    assert.deepEqual(await extend(db, { p_reason: "  Synthetic additional night  " }), original);
    const { rows: [state] } = await db.query(`
      select r.check_out::text as stay_end, a.check_out::text as assignment_end,
        (select count(*)::int from folio_charges where idempotency_key=$2) as charges,
        (select octet_length(receipt.reason_digest) from front_desk_extension_receipts receipt
          join folio_charges charge on charge.id=receipt.charge_id where charge.idempotency_key=$2) as digest_bytes,
        (select count(*)::int from audit_logs where entity_id=r.id and action='extend_stay') as audit_events
      from reservations r join reservation_room_assignments a on a.reservation_id=r.id where r.id=$1`, [stays[0], payload.p_idempotency_key]);
    assert.deepEqual(state, { stay_end: dates.second, assignment_end: dates.second, charges: 1, digest_bytes: 32, audit_events: 2 });

    const collisionKey = randomUUID();
    const collisions = await Promise.allSettled([
      extend(db, { p_new_check_out: dates.third, p_idempotency_key: collisionKey }),
      extend(other, { p_reservation_id: stays[1], p_new_check_out: dates.third, p_idempotency_key: collisionKey }),
    ]);
    assert.equal(collisions.filter(outcome => outcome.status === "fulfilled").length, 1);
    const rejected = collisions.find(outcome => outcome.status === "rejected");
    assert.match(rejected.reason.message, /EXTENSION_IDEMPOTENCY_CONFLICT/);
    const { rows: [collision] } = await db.query("select count(*)::int as charges from folio_charges where idempotency_key=$1", [collisionKey]);
    assert.equal(collision.charges, 1);

    const legacyKey = randomUUID();
    await db.query(`insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source)
      select id,reservation_id,'Legacy extension fixture','extension',100,$2,$3,'hotel_operations'
      from invoices where reservation_id=$1`, [stays[0], fixture.users.front_desk, legacyKey]);
    await assert.rejects(extend(db, { p_idempotency_key: legacyKey }), /EXTENSION_IDEMPOTENCY_CONFLICT/);
  } finally {
    await other.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = await hotelTestDatabase();
  try {
    await verifyExtensionReplay(suite);
    console.log("PASS extension replay, request binding, role denial and concurrent use");
  } finally {
    await suite.close();
  }
}
