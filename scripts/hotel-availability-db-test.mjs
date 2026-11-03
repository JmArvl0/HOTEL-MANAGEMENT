// Run alone after the backend migration replay. Each run owns and drops a clone.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const testDb = await hotelTestDatabase();
const { db } = testDb;
const migration = "supabase/migrations/20261103130000_hotel_nightly_availability.sql";
let failed = 0;
let passed = 0;
const test = async (name, run) => {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
};
try {
  const beforeHousekeeping = (await db.query("select pg_get_functiondef('housekeeping_complete_task(text,jsonb,text,uuid)'::regprocedure) body")).rows[0].body;
  if (!process.argv.includes("--baseline")) {
    await db.query(fs.readFileSync(migration, "utf8"));
  } else if ((await db.query("select to_regprocedure('hotel_available_units(text,date,date,jsonb,text,uuid,timestamptz)') fn")).rows[0].fn) {
    throw new Error("--baseline requires a template replayed before the nightly-availability migration");
  }
  const { start, mid, end } = (await db.query("select (hotel_today()+60)::text start,(hotel_today()+61)::text mid,(hotel_today()+62)::text end")).rows[0];
  const stay = async (f, checkIn, checkOut, room = null) => {
    const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,identity_status) values($1,$2,'Test guest',$3,$4,$5,'confirmed',100,'verified') returning id", [f.guest, f.users.guest, f.type, checkIn, checkOut])).rows[0].id;
    if (room) await db.query("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,$3,$4,'active')", [reservation, room, checkIn, checkOut]);
    return reservation;
  };
  const stagger = async f => { await stay(f, start, mid, f.rooms[0].id); await stay(f, mid, end, f.rooms[0].id); };
  const holdArgs = f => ({ p_user_id: f.users.guest, p_room_type: f.type, p_check_in: start, p_check_out: end, p_guest_count: 1, p_first_name: "Test", p_last_name: "Guest", p_email: `${f.tag}@example.invalid`, p_mobile: "09123456789" });
  const hold = async (f, client = db) => (await rpc(client, "create_booking_hold", holdArgs(f)))[0].create_booking_hold;
  const staffArgs = f => ({ p_guest_name: "Test guest", p_email: `${f.tag}@example.invalid`, p_phone: "09123456789", p_room_type: f.type, p_check_in: start, p_check_out: end, p_guest_count: 1, p_source: "Front Desk", p_special_requests: "", p_expected_arrival: "15:00", p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk });
  const manual = async (f, token) => rpc(db, "submit_reservation_deposit", { p_token: token, p_user_id: f.users.guest, p_payment_method: "manual_gcash", p_payment_reference: `test-${randomUUID()}`, p_proof_storage_path: `submitted/${token}/${randomUUID()}.png`, p_proof_original_name: "test.png", p_proof_mime_type: "image/png", p_proof_size_bytes: 8 });

  await test("staggered assigned stays leave one continuously free room for a new hold", async () => {
    const f = await hotelFixture(db); await stagger(f);
    assert.ok(await hold(f));
  });
  await test("Front Desk uses nightly capacity", async () => {
    const f = await hotelFixture(db); await stagger(f);
    assert.ok((await rpc(db, "front_desk_create_reservation", staffArgs(f)))[0].reservation_id);
  });
  await test("Front Desk respects outstanding website holds", async () => {
    const f = await hotelFixture(db, 1); await hold(f);
    await assert.rejects(rpc(db, "front_desk_create_reservation", staffArgs(f)), /ROOM_TYPE_UNAVAILABLE/);
  });
  await test("manual conversion and accounting verification exclude their own claim", async () => {
    const f = await hotelFixture(db); const token = await hold(f); await stagger(f);
    const reservation = (await manual(f, token))[0].reservation_id;
    const payment = (await db.query("select id from payments where reservation_id=$1", [reservation])).rows[0].id;
    await rpc(db, "verify_reservation_deposit", { p_payment_id: payment, p_staff_user_id: f.users.accounting });
    assert.equal((await db.query("select status from reservations where id=$1", [reservation])).rows[0].status, "confirmed");
    assert.equal((await manual(f, token))[0].reservation_id, reservation);
  });
  await test("gateway submission and settlement agree on staggered stays", async () => {
    const f = await hotelFixture(db); const token = await hold(f); await stagger(f);
    const reference = `test-${randomUUID()}`;
    const reservation = (await rpc(db, "submit_gateway_deposit", { p_token: token, p_user_id: f.users.guest, p_gateway_ref: reference }))[0].reservation_id;
    const payment = (await db.query("select id from payments where reservation_id=$1", [reservation])).rows[0].id;
    await rpc(db, "confirm_gateway_payment", { p_payment_id: payment, p_gateway_ref: reference, p_webhook_id: `test-${randomUUID()}` });
    assert.equal((await db.query("select status from reservations where id=$1", [reservation])).rows[0].status, "confirmed");
  });
  await test("two concurrent final-unit holds have one winner", async () => {
    const f = await hotelFixture(db, 1); const other = await testDb.connect();
    try {
      const results = await Promise.allSettled([hold(f), hold(f, other)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.match(results.find(result => result.status === "rejected").reason.message, /ROOM_TYPE_UNAVAILABLE/);
    } finally { await other.end(); }
  });
  await test("Front Desk and website cannot both claim the final unit", async () => {
    const f = await hotelFixture(db, 1); const other = await testDb.connect();
    try {
      const results = await Promise.allSettled([rpc(db, "front_desk_create_reservation", staffArgs(f)), hold(f, other)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.match(results.find(result => result.status === "rejected").reason.message, /ROOM_TYPE_UNAVAILABLE/);
    } finally { await other.end(); }
  });
  for (const managerReview of [false, true]) await test(`reservation modification ${managerReview ? "request/review/execution" : "self-service"} uses nightly capacity`, async () => {
    const f = await hotelFixture(db);
    const reservation = await stay(f, start, end);
    await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Test',100,0,100,'unpaid')", [reservation]);
    if (managerReview) await db.query("update reservations set operational_policy_snapshot=jsonb_set(operational_policy_snapshot,'{selfServiceModificationDays}','999') where id=$1", [reservation]);
    await stagger(f);
    const result = (await rpc(db, "customer_request_reservation_change", { p_user_id: f.users.guest, p_reservation_id: reservation, p_check_in: start, p_check_out: end, p_room_type: f.type, p_guests: 1, p_special_requests: "Isolated modification", p_reason: "Isolated inventory regression", p_idempotency_key: randomUUID() }))[0].customer_request_reservation_change;
    assert.equal(result.status, managerReview ? "pending" : "executed");
    if (managerReview) {
      const approval = (await db.query("select id,version from manager_approval_requests where id=$1", [result.managerApprovalId])).rows[0];
      await rpc(db, "review_manager_approval", { p_approval_id: approval.id, p_decision: "approve", p_reason: "Isolated review", p_expected_version: approval.version, p_manager_user_id: f.users.manager });
      await rpc(db, "front_desk_execute_manager_approval", { p_approval_id: approval.id, p_room_id: null, p_staff_user_id: f.users.front_desk });
      assert.equal((await db.query("select execution_status from manager_approval_requests where id=$1", [approval.id])).rows[0].execution_status, "executed");
    }
    const updated = (await db.query("select check_in::text,check_out::text,total,nightly_rates from reservations where id=$1", [reservation])).rows[0];
    assert.equal(updated.check_in, start); assert.equal(updated.check_out, end);
    assert.equal(Number(updated.total), 200); assert.equal(updated.nightly_rates.length, 2);
  });
  if (!process.argv.includes("--baseline")) {
    // Execute the actual TS inventory function. Only unused I/O/pricing imports
    // are isolated; the arithmetic and its date/status predicates are production.
    const actualRequire = createRequire(import.meta.url);
    const compiled = ts.transpileModule(fs.readFileSync("lib/booking.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function("exports", "require", compiled)(exports, name => name.startsWith("@/") ? { supabase: null } : actualRequire(name));
    const scenarios = [
      { name: "empty demand", reservations: [], holds: [], expected: 2 },
      { name: "staggered stays", reservations: [[start, mid], [mid, end]], holds: [], expected: 1 },
      { name: "staggered holds", reservations: [], holds: [[start, mid], [mid, end]], expected: 1 },
      { name: "mixed staggered demand", reservations: [[start, mid]], holds: [[mid, end]], expected: 1 },
      { name: "busiest night sold out", reservations: [[start, end]], holds: [[mid, end]], expected: 0 },
      { name: "expired website pending", reservations: [[start, end, "pending", "Website", "expired"]], holds: [], expected: 2 },
      { name: "live website pending", reservations: [[start, end, "pending", "Website", "live"]], holds: [], expected: 1 },
      { name: "staff pending without deadline", reservations: [[start, end, "pending", "Front Desk"]], holds: [], expected: 1 },
      { name: "cancelled stay", reservations: [[start, end, "cancelled"]], holds: [], expected: 2 },
      { name: "checkout adjacency", reservations: [[mid, end]], holds: [], checkOut: mid, expected: 2 },
      { name: "expired hold", reservations: [], holds: [[start, end, "active", "expired"]], expected: 2 },
      { name: "submitted hold", reservations: [], holds: [[start, end, "payment_submitted"]], expected: 1 },
      { name: "converted hold", reservations: [[start, end]], holds: [[start, end, "payment_submitted", "live", "converted"]], expected: 1 },
      { name: "zero inventory", reservations: [], holds: [], capacity: 0, expected: 0 },
    ];
    for (const scenario of scenarios) await test(`SQL/TypeScript parity: ${scenario.name}`, async () => {
      const f = await hotelFixture(db, scenario.capacity ?? 2);
      const clock = (await db.query("select now() evaluated,hotel_today()::text today")).rows[0];
      const evaluated = clock.evaluated.toISOString();
      const expiry = flag => new Date(clock.evaluated.getTime() + (flag === "expired" ? -60000 : 60000)).toISOString();
      const reservations = [];
      const reservationIds = [];
      for (const [check_in, check_out, status = "confirmed", source = "Front Desk", deadline] of scenario.reservations) {
        const payment_due_at = deadline ? expiry(deadline) : null;
        reservationIds.push((await db.query("insert into reservations(guest_id,guest_name,room_type,check_in,check_out,status,source,total,payment_due_at) values($1,'Parity',$2,$3,$4,$5,$6,100,$7) returning id", [f.guest, f.type, check_in, check_out, status, source, payment_due_at])).rows[0].id);
        reservations.push({ room_type: f.type, check_in, check_out, status, source, payment_due_at });
      }
      const holds = [];
      for (const [check_in, check_out, status = "active", expiration = "live", converted] of scenario.holds) {
        const expires_at = expiry(expiration);
        const reservation_id = converted ? reservationIds[0] : null;
        await db.query("insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,first_name,last_name,email,mobile,status,expires_at,reservation_id) values($1,$2,$3,$4,1,100,100,100,'Test','Guest','parity@example.invalid','09123456789',$5,$6,$7)", [f.users.guest, f.type, check_in, check_out, status, expires_at, reservation_id]);
        holds.push({ room_type: f.type, check_in, check_out, status, expires_at, reservation_id });
      }
      const checkOut = scenario.checkOut ?? end;
      const sql = (await db.query("select hotel_available_units($1,$2,$3,null,null,null,$4) units", [f.type, start, checkOut, evaluated])).rows[0].units;
      const typescript = exports.countAvailableUnits(f.type, { checkIn: start, checkOut, now: evaluated, today: clock.today }, { rooms: f.rooms.map(room => ({ ...room, type: f.type, status: "available", housekeeping: "clean" })), reservations, holds });
      assert.equal(sql, scenario.expected); assert.equal(typescript, sql);
    });
    await test("migration preserves Housekeeping, caller grants and is replayable", async () => {
      assert.equal((await db.query("select pg_get_functiondef('housekeeping_complete_task(text,jsonb,text,uuid)'::regprocedure) body")).rows[0].body, beforeHousekeeping);
      const targets = ["create_booking_hold", "front_desk_create_reservation", "submit_reservation_deposit", "submit_gateway_deposit", "verify_reservation_deposit", "confirm_gateway_payment", "customer_request_reservation_change", "review_manager_approval", "front_desk_execute_manager_approval"];
      const rows = (await db.query("select p.proname,p.prosrc,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1)", [targets])).rows;
      assert.equal(rows.length, targets.length);
      for (const row of rows) { assert.match(row.prosrc, /hotel_available_units\(/); assert.equal(row.anon, false); assert.equal(row.authenticated, false); assert.equal(row.service, true); }
      await db.query(fs.readFileSync(migration, "utf8"));
    });
  }
  console.log(`Availability SQL: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
} finally { await testDb.close(); }
