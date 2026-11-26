import assert from "node:assert/strict";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
try {
  const { users, guest, tag, type } = await hotelFixture(db, 0);
  const ids = [];
  for (let index = 0; index < 12; index++) {
    const row = await db.query(`insert into reservations
      (guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,created_at)
      values($1,$2,$3,$4,hotel_today()-60,hotel_today()-58,'checked_out',200,'2026-01-01T00:00:00Z') returning id,confirmation_number`,
    [guest, users.guest, `Fixture ${tag} ${index}`, type]);
    ids.push(row.rows[0]);
  }
  await db.query(`insert into invoices(reservation_id,guest_name,amount,paid,balance,status)
    values($1,'Test',200,200,0,'paid')`, [ids[0].id]);
  const rows = await db.query(`insert into reservations (guest_id,user_id,guest_name,room_type,check_in,check_out,status,total)
    values ($1,$2,$3,$4,hotel_today()-1,hotel_today()+1,'confirmed',200),
      ($1,$2,$3,$4,hotel_today()-3,hotel_today(),'checked_in',200) returning id,status`, [guest, users.guest, `Fixture ${tag} active`, type]);
  const date = (await db.query("select hotel_today()::text today")).rows[0].today;
  const query = { p_actor: users.front_desk, p_scope: "history", p_from: null, p_through: null,
    p_queue: "closed", p_closed: "checked_out", p_search: `Fixture ${tag}`, p_page: 1 };
  const call = async (changes = {}) => (await rpc(db, "hotel_front_office_booking_page", { ...query, ...changes }))[0].hotel_front_office_booking_page;
  const [first, second] = await Promise.all([call(), call({ p_page: 2 })]);
  assert.deepEqual([first.total, first.rows.length, second.page, second.rows.length], [12, 10, 2, 2]);
  const all = [...first.rows, ...second.rows];
  assert.equal(new Set(all.map(row => row.id)).size, 12);
  assert.equal(all.find(row => row.id === ids[0].id).folio_balance, 0);
  assert.equal(all.find(row => row.id === ids[1].id).folio_balance, null);
  assert.equal((await call({ p_page: 99 })).page, 2);
  const exact = await call({ p_search: `${ids[0].confirmation_number ?? ""}  ${ids[0].id}`.trim() });
  assert.equal(exact.rows[0]?.id, ids[0].id);
  console.log("PASS full history searches beyond the first page and preserves stable ordering and folio states");

  const current = await call({ p_scope: "window", p_from: date, p_through: date, p_queue: "all" });
  assert.equal(current.total, 1);
  assert.equal(current.rows[0].status, "confirmed");
  assert.ok(rows.rows.every(row => current.daily.some(daily => daily.id === row.id)));
  assert.equal((await call({ p_scope: "board" })).rows.length, 0);
  await assert.rejects(call({ p_actor: users.housekeeping }), /FORBIDDEN/);
  console.log("PASS current dates, overdue arrivals, due departures and role boundaries remain distinct");
} finally {
  await suite.close();
}
