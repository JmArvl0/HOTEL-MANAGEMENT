// Isolated PostgreSQL regression harness. Never reads .env or connects remotely.
// Start the disposable local server documented in docs/plans/2026-11-02-backend-remediation.md.
import fs from "node:fs";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const connection = { host: "127.0.0.1", port: 55432, user: "backend_audit", database: "postgres", connectionTimeoutMillis: 5000 };
const admin = new pg.Client(connection);
await admin.connect();
await admin.query("drop database if exists backend_remediation_test with (force)");
await admin.query("create database backend_remediation_test");
await admin.end();
const db = new pg.Client({ ...connection, database: "backend_remediation_test" });
await db.connect();
try {
  await db.query(`
    do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
    end$$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
  `);
  const remediation = "20261102010000_backend_audit_remediation.sql";
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && !(process.argv.includes("--baseline") && f === remediation)).sort();
  // The hosted project already applied the recovered remote history. Test that
  // real upgrade order as well as a clean chronological installation.
  const pending = new Set([remediation, "20261103130000_hotel_nightly_availability.sql", "20261103140000_hotel_operations.sql", "20261103150000_hotel_operating_day.sql"]);
  const replay = process.argv.includes("--upgrade-order") ? [...files.filter(f => !pending.has(f)), ...files.filter(f => pending.has(f))] : files;
  for (const file of replay) {
    try {
      await db.query(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
      await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [file.split("_")[0], file]);
    } catch (error) {
      console.error(`Migration replay failed: ${file}: ${error.message}`);
      throw error;
    }
  }
  console.log("PASS replayed repository migrations");
  let failed = 0;
  const test = async (name, run) => {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  };
  const call = async (name, args) => {
    const keys = Object.keys(args);
    assert.match(name, /^[a-z_]+$/);
    for (const key of keys) assert.match(key, /^p_[a-z_]+$/);
    return (await db.query(`select * from public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")})`, Object.values(args).map((v) => v !== null && typeof v === "object" ? JSON.stringify(v) : v))).rows;
  };
  const fixture = async () => {
    const tag = randomUUID().slice(0, 8);
    const users = {};
    for (const role of ["guest", "front_desk", "housekeeping", "accounting", "admin"]) {
      users[role] = randomUUID();
      await db.query("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,$3,$4,$5,true,'active')", [users[role], `${tag}-${role}@example.invalid`, `Audit ${role}`, role, "offline-test-hash-placeholder"]);
    }
    const guest = (await db.query("insert into guests(name,email,user_account_id,loyalty_points) values('Audit Guest',$1,$2,1000) returning id", [`${tag}@example.invalid`, users.guest])).rows[0].id;
    const type = `Audit-${tag}`;
    const typeId = (await db.query("insert into room_types(name,description,max_guests,beds,base_rate) values($1,'Audit',2,'Twin',100) returning id", [type])).rows[0].id;
    const room = (await db.query("insert into rooms(number,floor,type,rate) values($1,1,$2,100) returning id", [`A-${tag}`, type])).rows[0].id;
    const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,identity_status) values($1,$2,'Audit',$3,current_date+60,current_date+62,'confirmed',200,'verified') returning id", [guest, users.guest, type])).rows[0].id;
    const invoice = (await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Audit',200,0,200,'unpaid') returning id", [reservation])).rows[0].id;
    return { users, guest, type, typeId, room, reservation, invoice };
  };
  await test("B-008 migration-only schema contains room_is_sellable", async () => {
    assert.ok((await db.query("select to_regprocedure('public.room_is_sellable(text,date,jsonb)') fn")).rows[0].fn);
  });
  // Isolate other baseline failures from B-008; this helper is fixture-only.
  if (!(await db.query("select to_regprocedure('public.room_is_sellable(text,date,jsonb)') fn")).rows[0].fn) {
    const snapshot = fs.readFileSync("supabase/schema.sql", "utf8");
    const start = snapshot.indexOf('CREATE OR REPLACE FUNCTION "public"."room_is_sellable"');
    await db.query(snapshot.slice(start, snapshot.indexOf("$$;", start) + 3));
  }
  await test("B-001 guest cannot cancel a NULL-owner reservation", async () => {
    const f = await fixture();
    await db.query("update reservations set user_id=null where id=$1", [f.reservation]);
    await assert.rejects(call("cancel_reservation", { p_reservation_id: f.reservation, p_actor_user_id: f.users.guest, p_reason: "Offline ownership regression" }), /RESERVATION_OWNERSHIP_REQUIRED/);
  });
  await test("B-003 failed OTP attempts survive separate RPC transactions", async () => {
    const f = await fixture(); const id = randomUUID();
    await call("auth_otp_issue", { p_user_id: f.users.guest, p_challenge_id: id, p_code_verifier: "correct-verifier", p_ttl_seconds: 300, p_cooldown_seconds: 30 });
    for (let i = 0; i < 3; i++) {
      try { await call("auth_otp_verify", { p_challenge_id: id, p_code_verifier: "incorrect-verifier", p_max_attempts: 3 }); }
      catch (error) { if (!error.message.includes("OTP_INCORRECT")) throw error; }
    }
    const row = (await db.query("select attempt_count,invalidated_at from auth_otp_challenges where id=$1", [id])).rows[0];
    assert.equal(row.attempt_count, 3); assert.ok(row.invalidated_at);
  });
  await test("B-004 self-service recovery cannot reactivate a suspended account", async () => {
    const f = await fixture();
    await db.query("update user_accounts set active=false,account_status='suspended' where id=$1", [f.users.guest]);
    const hash = randomUUID(); const path = `recovery-selfies/${randomUUID()}.png`;
    const tok = (await db.query("insert into account_recovery_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour') returning id", [f.users.guest, hash])).rows[0].id;
    await db.query("insert into password_reset_logs(user_id,token_id,email,selfie_url) values($1,$2,'audit@example.invalid',$3)", [f.users.guest, tok, path]);
    await assert.rejects(call("complete_account_recovery", { p_token_hash: hash, p_password_hash: "x".repeat(60), p_selfie_path: path }), /RECOVERY_ACCOUNT_INACTIVE/);
  });
  await test("B-006 opening a cash shift succeeds", async () => {
    const f = await fixture();
    const rows = await call("accounting_open_cash_shift", { p_staff_user_id: f.users.front_desk, p_location: "Offline test", p_opening_amount: 100 });
    assert.equal(rows[0].accounting_open_cash_shift.status, "open");
    const shift = rows[0].accounting_open_cash_shift.shiftId;
    await call("record_staff_payment", { p_reservation_id: f.reservation, p_amount: 10, p_method: "cash", p_reference: null,
      p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk, p_allow_overpayment: false, p_allow_unattributed_cash: false });
    const closed = (await call("accounting_close_cash_shift", { p_shift_id: shift, p_actual_cash: 110, p_notes: "Offline test", p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk }))[0].accounting_close_cash_shift;
    assert.equal(Number(closed.variance), 0);
    const reopened = (await call("accounting_open_cash_shift", { p_staff_user_id: f.users.front_desk, p_location: "Offline reopened", p_opening_amount: 110 }))[0].accounting_open_cash_shift;
    assert.equal(reopened.status, "open");
    await call("accounting_close_cash_shift", { p_shift_id: reopened.shiftId, p_actual_cash: 110, p_notes: "Offline cleanup", p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk });
  });
  const createHold = async (f) => (await call("create_booking_hold", {
    p_user_id: f.users.guest, p_room_type: f.type,
    p_check_in: (await db.query("select (current_date+80)::text d")).rows[0].d,
    p_check_out: (await db.query("select (current_date+82)::text d")).rows[0].d,
    p_guest_count: 1, p_first_name: "Audit", p_last_name: "Guest", p_email: "audit@example.invalid", p_mobile: "0000000000",
  }))[0].create_booking_hold;
  const addPlan = async (f, start, end) => db.query("insert into room_rate_plans(room_type_id,name,start_date,end_date,days_of_week,nightly_rate,status,reason,proposed_by) values($1,'Offline rate',current_date+$2::int,current_date+$3::int,127,150,'active','Audit',$4)", [f.typeId, start, end, f.users.admin]);
  await test("B-007 holds support two different nightly prices", async () => {
    const f = await fixture(); await addPlan(f, 81, 81);
    const hold = await createHold(f);
    const row = (await db.query("select subtotal,nightly_rate from booking_holds where token=$1", [hold])).rows[0];
    assert.equal(Number(row.subtotal), 250); assert.equal(row.nightly_rate, null);
  });
  await test("B-011 gateway accepts valid seasonal rates and freezes their breakdown", async () => {
    const f = await fixture(); await addPlan(f, 80, 81); const hold = await createHold(f);
    const rows = await call("submit_gateway_deposit", { p_token: hold, p_user_id: f.users.guest, p_gateway_ref: `offline-${randomUUID()}` });
    const row = (await db.query("select nightly_rates from reservations where id=$1", [rows[0].reservation_id])).rows[0];
    assert.equal(row.nightly_rates.length, 2);
  });
  await test("B-012 direct check-in rejects an administratively inactive room", async () => {
    const f = await fixture(); await db.query("update rooms set administratively_active=false where id=$1", [f.room]);
    await db.query("update reservations set check_in=current_date,check_out=current_date+1,operational_policy_snapshot=jsonb_build_object('earlyCheckInAllowed',true,'validIdRequired',false) where id=$1", [f.reservation]);
    await db.query("update invoices set amount=0,balance=0 where id=$1", [f.invoice]);
    await assert.rejects(call("front_desk_check_in", { p_reservation_id: f.reservation, p_room_id: f.room, p_staff_user_id: f.users.front_desk }), /ROOM_INACTIVE|ROOM_NOT_READY/);
  });
  await test("B-013 pending deposit cannot be changed by loyalty redemption", async () => {
    const f = await fixture(); await db.query("update reservations set status='pending' where id=$1", [f.reservation]);
    await assert.rejects(call("redeem_loyalty_points", { p_guest_id: f.guest, p_points: 10, p_reservation_id: f.reservation, p_user_id: f.users.guest, p_idempotency_key: randomUUID() }), /LOYALTY_FOLIO_CLOSED/);
  });
  await test("B-014 one PHP 10000 stay does not unlock PHP 20000 Gold", async () => {
    const f = await fixture(); await db.query("update reservations set total=10000,status='checked_out' where id=$1", [f.reservation]);
    const row = (await db.query("select lifetime_spend,loyalty_tier from guests where id=$1", [f.guest])).rows[0];
    assert.equal(Number(row.lifetime_spend), 10000); assert.equal(row.loyalty_tier, "silver");
  });
  await test("B-015 excess redemption leaves the guest points untouched", async () => {
    const f = await fixture();
    await assert.rejects(call("redeem_loyalty_points", { p_guest_id: f.guest, p_points: 500, p_reservation_id: f.reservation, p_user_id: f.users.guest, p_idempotency_key: randomUUID() }), /LOYALTY_EXCEEDS_BALANCE/);
    assert.equal((await db.query("select loyalty_points from guests where id=$1", [f.guest])).rows[0].loyalty_points, 1000);
  });
  await test("B-022 recovery rejects a selfie staged for another token", async () => {
    const f = await fixture(); const hash = randomUUID();
    await db.query("insert into account_recovery_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')", [f.users.guest, hash]);
    await assert.rejects(call("complete_account_recovery", { p_token_hash: hash, p_password_hash: "x".repeat(60), p_selfie_path: `recovery-selfies/${randomUUID()}.png` }), /SELFIE_REQUIRED/);
  });
  const manualSubmit = (f, hold, path) => call("submit_reservation_deposit", {
    p_token: hold, p_user_id: f.users.guest, p_payment_method: "manual_gcash",
    p_payment_reference: `offline-${randomUUID()}`, p_proof_storage_path: path,
    p_proof_original_name: "offline.png", p_proof_mime_type: "image/png", p_proof_size_bytes: 8,
  });
  await test("B-010 payments cannot attach deletable staging paths", async () => {
    const f = await fixture(); const hold = await createHold(f);
    await db.query("update hotel_operational_policies set deposit_method='manual' where key='default'");
    await assert.rejects(manualSubmit(f, hold, `pending/${hold}/${randomUUID()}.png`), /PROOF_REQUIRED/);
  });
  await test("B-017 deposit OFF rejects a new manual submission", async () => {
    const f = await fixture(); const hold = await createHold(f);
    await db.query("update hotel_operational_policies set deposit_method='off' where key='default'");
    await assert.rejects(manualSubmit(f, hold, `submitted/${hold}/${randomUUID()}.png`), /DEPOSIT_METHOD_UNAVAILABLE/);
    await db.query("update hotel_operational_policies set deposit_method='manual' where key='default'");
  });
  await test("B-012 gateway settlement cannot count a deactivated room", async () => {
    const f = await fixture(); const hold = await createHold(f); const ref = `offline-${randomUUID()}`;
    const submitted = (await call("submit_gateway_deposit", { p_token: hold, p_user_id: f.users.guest, p_gateway_ref: ref }))[0];
    await db.query("update rooms set administratively_active=false where id=$1", [f.room]);
    const payment = (await db.query("select id from payments where reservation_id=$1", [submitted.reservation_id])).rows[0].id;
    await assert.rejects(call("confirm_gateway_payment", { p_payment_id: payment, p_gateway_ref: ref, p_webhook_id: `offline-${randomUUID()}` }), /ROOM_TYPE_UNAVAILABLE/);
  });
  await test("B-023 express check-in rejects expired early approval", async () => {
    const f = await fixture(); const hash = randomUUID().replaceAll("-", "").repeat(2);
    await db.query("update reservations set room_id=$2,check_in=(now() at time zone 'UTC')::date,check_out=(now() at time zone 'UTC')::date+1,early_check_in_approved_until=now()-interval '1 hour',operational_policy_snapshot=jsonb_build_object('hotelTimezone','UTC','checkInTime','24:00','earlyCheckInAllowed',false) where id=$1", [f.reservation, f.room]);
    await db.query("update invoices set amount=0,balance=0 where id=$1", [f.invoice]);
    await db.query("insert into qr_tokens(token_hash,resource_type,resource_id,purpose) values($1,'reservation',$2,'check_in')", [hash, f.reservation]);
    await assert.rejects(call("express_qr_self_check_in", { p_qr_token_hash: hash, p_user_id: f.users.guest }), /SELF_CHECKIN_TOO_EARLY/);
  });
  const inventoryFixture = async () => {
    const f = await fixture();
    await db.query("update reservations set room_id=$2,room_number=(select number from rooms where id=$2) where id=$1", [f.reservation, f.room]);
    const item = (await db.query("insert into inventory(name,category,unit,quantity) values('Audit towel','Linen','piece',2) returning id")).rows[0].id;
    const requests = [];
    for (let i = 0; i < 2; i++) requests.push((await db.query("insert into guest_requests(reservation_id,guest_id,request,department,request_type,approval_status,inventory_item_id) values($1,$2,'Offline stock request','housekeeping','extra_towels','approved',$3) returning id", [f.reservation, f.guest, item])).rows[0].id);
    return { ...f, item, requests };
  };
  await test("B-016 alternate fulfillment deducts stock and records one movement", async () => {
    const f = await inventoryFixture();
    await call("staff_progress_guest_request", { p_request_id: f.requests[0], p_action: "complete", p_staff_user_id: f.users.housekeeping });
    assert.equal(Number((await db.query("select quantity from inventory where id=$1", [f.item])).rows[0].quantity), 1);
    assert.equal(Number((await db.query("select count(*) n from inventory_movements where item_id=$1 and direction='consumption'", [f.item])).rows[0].n), 1);
  });
  await test("B-016 concurrent fulfillment cannot lose a stock decrement", async () => {
    const f = await inventoryFixture();
    const other = new pg.Client({ ...connection, database: "backend_remediation_test" }); await other.connect();
    try {
      await Promise.all(f.requests.map((id, i) => (i ? other : db).query("select staff_progress_guest_request($1,'complete',$2)", [id, f.users.housekeeping])));
      assert.equal(Number((await db.query("select quantity from inventory where id=$1", [f.item])).rows[0].quantity), 0);
      assert.equal(Number((await db.query("select count(*) n from inventory_movements where item_id=$1 and direction='consumption'", [f.item])).rows[0].n), 2);
    } finally { await other.end(); }
  });
  await test("B-016 task completion consumes once and attributes the movement", async () => {
    const f = await inventoryFixture();
    const task = (await db.query("select id from housekeeping_tasks where guest_request_id=$1", [f.requests[0]])).rows[0].id;
    await call("housekeeping_start_task", { p_task_id: task, p_staff_user_id: f.users.housekeeping });
    await call("housekeeping_complete_task", { p_task_id: task, p_checklist: {}, p_notes: "Offline regression", p_staff_user_id: f.users.housekeeping });
    const stock = (await db.query("select quantity from inventory where id=$1", [f.item])).rows[0];
    const movements = (await db.query("select recorded_by from inventory_movements where source_id=$1", [f.requests[0]])).rows;
    assert.equal(Number(stock.quantity), 1); assert.equal(movements.length, 1);
    assert.equal(movements[0].recorded_by, f.users.housekeeping);
  });
  await test("B-016 insufficient stock rolls back fulfillment", async () => {
    const f = await inventoryFixture(); await db.query("update inventory set quantity=0 where id=$1", [f.item]);
    // The recovered remote completion guard runs before the legacy after-trigger.
    await assert.rejects(call("staff_progress_guest_request", { p_request_id: f.requests[0], p_action: "complete", p_staff_user_id: f.users.housekeeping }), /STOCK_INSUFFICIENT/);
    assert.equal((await db.query("select status from guest_requests where id=$1", [f.requests[0]])).rows[0].status, "open");
  });
  await test("B-004/B-022 administrator onboarding still accepts its bound selfie", async () => {
    const f = await fixture(); const hash = randomUUID(); const path = `recovery-selfies/${randomUUID()}.png`;
    await db.query("update user_accounts set active=false,account_status='inactive',recovery_required=true where id=$1", [f.users.guest]);
    await db.query("insert into account_recovery_tokens(user_id,token_hash,expires_at,created_by) values($1,$2,now()+interval '1 hour',$3)", [f.users.guest, hash, f.users.admin]);
    await call("stage_recovery_selfie", { p_token_hash: hash, p_path: path, p_ip_address: null, p_user_agent: "Offline test" });
    await call("complete_account_recovery", { p_token_hash: hash, p_selfie_path: path, p_password_hash: "x".repeat(60) });
    const account = (await db.query("select active,recovery_required from user_accounts where id=$1", [f.users.guest])).rows[0];
    assert.equal(account.active, true); assert.equal(account.recovery_required, false);
    await assert.rejects(call("stage_recovery_selfie", { p_token_hash: hash, p_path: `recovery-selfies/${randomUUID()}.png`, p_ip_address: null, p_user_agent: null }), /RECOVERY_TOKEN_INVALID/);
  });
  await test("B-021 invalid predictions record failure without partial completed runs", async () => {
    const before = Number((await db.query("select count(*) n from analytics_model_runs where status='completed'")).rows[0].n);
    const rows = await call("persist_analytics_generation", { p_models: [{ modelType: "occupancy", modelVersion: "offline", parameters: {}, predictions: [{ prediction_type: "occupancy", target_date: "not-a-date", target_resource_type: "hotel", predicted_value: 1, risk_level: "low", data_quality: "limited", metadata: {} }] }] });
    assert.equal(rows[0].persist_analytics_generation.error, "ANALYTICS_PERSIST_FAILED");
    assert.equal(Number((await db.query("select count(*) n from analytics_model_runs where status='completed'")).rows[0].n), before);
    assert.equal(Number((await db.query("select count(*) n from analytics_model_runs where status='failed'")).rows[0].n), 1);
  });
  await test("B-021 concurrent generation has one atomic winner", async () => {
    const other = new pg.Client({ ...connection, database: "backend_remediation_test" }); await other.connect();
    try {
      const models = JSON.stringify([{ modelType: "occupancy", modelVersion: "offline", parameters: {}, predictions: [] }]);
      const outcomes = await Promise.allSettled([db.query("select persist_analytics_generation($1::jsonb)", [models]), other.query("select persist_analytics_generation($1::jsonb)", [models])]);
      assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
      assert.match(outcomes.find((x) => x.status === "rejected").reason.message, /ANALYTICS_COOLDOWN/);
    } finally { await other.end(); }
  });
  console.log(`SQL regression failures: ${failed}`);
  process.exitCode = failed ? 1 : 0;
} finally { await db.end(); }
