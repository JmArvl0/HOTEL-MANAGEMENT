// Disposable loopback PostgreSQL only. Never reads .env or a hosted connection.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connection = { host: "127.0.0.1", port: 55441, user: "cash_data_qa", connectionTimeoutMillis: 5000 };
const database = `cash_findings_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ ...connection, database: "postgres" });
await admin.connect();
for (const role of ["anon", "authenticated", "service_role"]) {
  if (!(await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await admin.query(`create role ${role}${role === "service_role" ? " bypassrls" : ""}`);
}
await admin.query(`create database ${database}`); await admin.end();
const db = new pg.Client({ ...connection, database }); await db.connect();
const q = (sql, args = []) => db.query(sql, args);
const row = async (sql, args = []) => (await q(sql, args)).rows[0];
const checks = [];
async function test(name, run) {
  try { await run(); checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, result: "FAIL", error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function rpc(name, args, client = db) {
  assert.match(name, /^[a-z_]+$/);
  await client.query("set role service_role");
  try { return (await client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value; }
  finally { await client.query("reset role"); }
}
const users = Object.fromEntries(["front_desk", "accounting", "guest", "manager", "other"].map(role => [role, randomUUID()]));
const reservation = `CASH-FIX-${randomUUID().slice(0, 8)}`, invoice = `${reservation}-I`;
let shift, draft, cashRefund;
async function refund(amount) {
  const id = randomUUID();
  await q("insert into refund_requests(id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status) values($1,$2,$3,'Fictional acceptance refund',2000,10000,$4,'pending')", [id, reservation, invoice, amount]);
  return id;
}
const context = () => rpc("cash_count_context", [shift, users.front_desk]);
const save = (count, basis, version, notes = "Acceptance count") => rpc("save_cash_count_draft", [shift, users.front_desk, count, notes, basis, version]);
async function named(name, args) {
  assert.match(name, /^[a-z_]+$/);
  const keys = Object.keys(args); for (const key of keys) assert.match(key, /^p_[a-z_]+$/);
  return (await q(`select * from public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")})`, Object.values(args))).rows[0];
}
async function settlement(days) {
  const stay = "SETTLE-" + randomUUID(), folio = stay + "-I";
  await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Fictional settlement guest','Test',(now() at time zone 'Asia/Manila')::date+$3::int,(now() at time zone 'Asia/Manila')::date+$3::int+2,'confirmed',10000)", [stay, users.guest, days]);
  await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Fictional settlement guest',10000,10000,'unpaid')", [folio, stay]);
  await q("insert into payments(invoice_id,reservation_id,amount,method,purpose,status) values($1,$2,5000,'manual_gcash','reservation_deposit','paid')", [folio, stay]);
  await q("select sync_invoice_financials($1)", [folio]);
  const cancelled = await named("cancel_reservation", { p_reservation_id: stay, p_actor_user_id: users.guest, p_reason: "Fictional acceptance cancellation" });
  return { stay, folio, cancelled };
}
try {
  await q(`create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  const migrations = fs.readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    try { await q(fs.readFileSync(`supabase/migrations/${name}`, "utf8")); await q("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [name.split("_")[0], name]); }
    catch (error) { throw new Error(`Migration ${name}: ${error.message}`); }
  }
  console.log(`PASS replayed ${migrations.length} migrations`);
  await q("grant usage on schema public to service_role; grant select on all tables in schema public to service_role");
  for (const [role, id] of Object.entries(users)) await q("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,$3,$4,'offline-test-placeholder',true,'active')", [id, `${id}@example.invalid`, `Fictional ${role}`, role === "other" ? "front_desk" : role]);
  await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Fictional test guest','Test',current_date+30,current_date+31,'confirmed',5000)", [reservation, users.guest]);
  await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Fictional test guest',5000,5000,'unpaid')", [invoice, reservation]);
  shift = (await rpc("accounting_open_cash_shift", [users.front_desk, "Acceptance drawer", 1000])).shiftId;
  await rpc("hms_collect_payment", [reservation, 2000, "cash", null, randomUUID(), users.front_desk, false]);

  await test("count save persists independently and rejects another operator", async () => {
    const current = await context();
    assert.equal(Number(current.expectedCash), 3000); assert.equal(current.draft, null);
    await assert.rejects(rpc("cash_count_context", [shift, users.other]), /CASH_SHIFT_FORBIDDEN/);
    draft = await save(3000, current.basis, 0);
    assert.equal(Number(draft.actualCash), 3000); assert.equal(Number(draft.version), 1); assert.ok(draft.closeKey);
    const reader = new pg.Client({ ...connection, database }); await reader.connect();
    try { assert.equal((await rpc("cash_count_context", [shift, users.front_desk], reader)).draft.closeKey, draft.closeKey); }
    finally { await reader.end(); }
    const stored = await row("select status,actual_cash,expected_cash from cash_shifts where id=$1", [shift]);
    assert.equal(stored.status, "open"); assert.equal(stored.actual_cash, null); assert.equal(stored.expected_cash, null);
  });
  await test("draft versions reject cross-device overwrites", async () => {
    const current = await context();
    await assert.rejects(save(2990, current.basis, 0), /DRAFT_VERSION_CONFLICT/);
    draft = await save(3000, current.basis, draft.version);
    assert.equal(Number(draft.version), 2);
  });
  await test("same-net new movements invalidate the old physical count", async () => {
    const before = await context();
    await rpc("hms_collect_payment", [reservation, 10, "cash", null, randomUUID(), users.front_desk, false]);
    const id = await refund(10);
    await rpc("process_refund", [id, users.accounting, "CASH-SAME-NET", "cash", shift]);
    const after = await context();
    assert.equal(Number(after.expectedCash), Number(before.expectedCash)); assert.notEqual(after.basis, before.basis);
    assert.equal(after.draft.stale, true);
    await assert.rejects(save(3000, before.basis, draft.version), /CASH_ACTIVITY_CHANGED/);
    await assert.rejects(rpc("close_cash_count_draft", [shift, users.front_desk, draft.version, draft.closeKey]), /CASH_ACTIVITY_CHANGED/);
  });
  await test("cash refund persists its actual method, drawer, actor and audit", async () => {
    cashRefund = await refund(250);
    await rpc("process_refund", [cashRefund, users.accounting, "CASH-250", "cash", shift]);
    const payment = await row("select * from payments where idempotency_key=$1", [cashRefund]);
    assert.equal(payment.method, "cash"); assert.equal(payment.cash_shift_id, shift); assert.equal(payment.received_by, users.accounting);
    assert.equal((await row("select count(*)::int n from refund_attempts where refund_request_id=$1", [cashRefund])).n, 1);
    assert.equal((await row("select after_data from audit_logs where entity_id=$1 and action='process_refund'", [cashRefund])).after_data.cashShiftId, shift);
    assert.equal(Number((await context()).expectedCash), 2750);
  });
  await test("external payouts exclude drawers and invalid combinations create no payment", async () => {
    const id = await refund(50);
    await assert.rejects(rpc("process_refund", [id, users.accounting, "INVALID", "gcash", shift]), /REFUND_PAYOUT_INVALID/);
    await assert.rejects(rpc("process_refund", [id, users.accounting, "INVALID", "cash", null]), /REFUND_PAYOUT_INVALID/);
    await assert.rejects(rpc("process_refund", [id, users.front_desk, "INVALID", "cash", shift]), /REFUND_PROCESSING_FORBIDDEN/);
    assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [id])).n, 0);
    await rpc("process_refund", [id, users.accounting, "GCASH-50", "gcash", null]);
    assert.equal(Number((await context()).expectedCash), 2750);
    assert.equal((await row("select cash_shift_id from payments where idempotency_key=$1", [id])).cash_shift_id, null);
  });
  await test("failed refund audit rolls the full payout back", async () => {
    const id = await refund(25), before = await row("select paid,balance,credit_balance from invoices where id=$1", [invoice]);
    await q(`alter table audit_logs add constraint cash_fix_rollback check(entity_id <> '${id}') not valid`);
    try { await assert.rejects(rpc("process_refund", [id, users.accounting, "ROLLBACK-25", "cash", shift]), /cash_fix_rollback/); }
    finally { await q("alter table audit_logs drop constraint cash_fix_rollback"); }
    assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [id])).n, 0);
    assert.equal((await row("select count(*)::int n from refund_attempts where refund_request_id=$1", [id])).n, 0);
    assert.equal((await row("select status from refund_requests where id=$1", [id])).status, "pending");
    assert.deepEqual(await row("select paid,balance,credit_balance from invoices where id=$1", [invoice]), before);
    await q("delete from refund_requests where id=$1", [id]);
  });
  await test("saved fresh count closes at 2750 and exact retries work after close", async () => {
    const current = await context();
    draft = await save(2750, current.basis, current.draft?.version ?? 0);
    const result = await rpc("close_cash_count_draft", [shift, users.front_desk, draft.version, draft.closeKey]);
    assert.equal(Number(result.expectedCash), 2750); assert.equal(Number(result.actualCash), 2750); assert.equal(Number(result.variance), 0);
    assert.deepEqual(await rpc("close_cash_count_draft", [shift, users.front_desk, draft.version, draft.closeKey]), result);
    await rpc("process_refund", [cashRefund, users.accounting, "CASH-250", "cash", shift]);
    await assert.rejects(rpc("process_refund", [cashRefund, users.accounting, "CHANGED", "cash", shift]), /IDEMPOTENCY_CONFLICT/);
    const closedContext = await context(); assert.ok(closedContext.draft.invalidatedAt); assert.equal(closedContext.status, "closed");
    assert.equal((await row("select count(*)::int n from front_desk_reports")).n, 0);
    assert.equal((await row("select count(*)::int n from shift_handovers")).n, 0);
  });
  await test("insufficient drawer cash and legacy RPC bypasses are rejected", async () => {
    shift = (await rpc("accounting_open_cash_shift", [users.front_desk, "Small drawer", 1])).shiftId;
    const id = await refund(100);
    await assert.rejects(rpc("process_refund", [id, users.accounting, "NO-FUNDS", "cash", shift]), /INSUFFICIENT_DRAWER_CASH/);
    await assert.rejects(rpc("process_refund", [id, users.accounting, "LEGACY"]), /permission denied|REFUND_PAYOUT_REQUIRED/);
    await assert.rejects(rpc("accounting_close_cash_shift", [shift, 1, "Legacy", randomUUID(), users.front_desk]), /permission denied/);
    assert.equal((await row("select status from refund_requests where id=$1", [id])).status, "pending");
    await q("delete from refund_requests where id=$1", [id]);
  });
  await test("concurrent payout and close cannot omit a cash movement from a close snapshot", async () => {
    const current = await context(), saved = await save(1, current.basis, 0);
    const id = await refund(0.5);
    const payer = new pg.Client({ ...connection, database }), closer = new pg.Client({ ...connection, database });
    await payer.connect(); await closer.connect();
    try {
      await q("begin"); await q("select pg_advisory_xact_lock(hashtextextended('cash_shift_open',0))");
      const payout = rpc("process_refund", [id, users.accounting, "RACE-PAYOUT", "cash", shift], payer).then(value => ({ value }), error => ({ error: error.message }));
      const close = rpc("close_cash_count_draft", [shift, users.front_desk, saved.version, saved.closeKey], closer).then(value => ({ value }), error => ({ error: error.message }));
      const deadline = Date.now() + 5000;
      while ((await row("select count(*)::int n from pg_stat_activity where datname=$1 and lower(wait_event)='advisory' and pid<>pg_backend_pid()", [database])).n < 2) {
        if (Date.now() >= deadline) throw new Error("Concurrent requests did not reach the shared lock");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await q("commit");
      const [paid, closed] = await Promise.all([payout, close]);
      assert.ok(Boolean(paid.value) !== Boolean(closed.value));
      if (paid.value) {
        assert.match(closed.error, /CASH_ACTIVITY_CHANGED/);
        const fresh = await context(), count = await save(0.5, fresh.basis, fresh.draft.version);
        const result = await rpc("close_cash_count_draft", [shift, users.front_desk, count.version, count.closeKey]);
        assert.equal(Number(result.expectedCash), 0.5);
      } else {
        assert.match(paid.error, /CASH_SHIFT_REQUIRED/); assert.equal(Number(closed.value.expectedCash), 1);
        await q("delete from refund_requests where id=$1", [id]);
      }
    } finally { await q("rollback"); await payer.end(); await closer.end(); }
  });
  await test("concurrent refunds cannot spend the same drawer balance twice", async () => {
    shift = (await rpc("accounting_open_cash_shift", [users.front_desk, "Concurrent refunds", 1])).shiftId;
    const ids = [];
    for (let index = 0; index < 2; index++) {
      const stay = "RACE-" + randomUUID(), folio = stay + "-I", id = randomUUID();
      await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Fictional payout race','Test',current_date+30,current_date+31,'confirmed',5)", [stay, users.guest]);
      await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Fictional payout race',5,5,'unpaid')", [folio, stay]);
      await rpc("hms_collect_payment", [stay, 1, "card", "RACE-CARD-" + index, randomUUID(), users.front_desk, false]);
      await q("insert into refund_requests(id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status) values($1,$2,$3,'Fictional payout race',1,10000,0.75,'pending')", [id, stay, folio]);
      ids.push(id);
    }
    const clients = ids.map(() => new pg.Client({ ...connection, database }));
    await Promise.all(clients.map(client => client.connect()));
    try {
      const results = await Promise.all(ids.map((id, index) => rpc("process_refund", [id, users.accounting, "RACE-" + index, "cash", shift], clients[index]).then(value => ({ value }), error => ({ error: error.message }))));
      assert.equal(results.filter(result => result.value).length, 1);
      assert.match(results.find(result => result.error).error, /INSUFFICIENT_DRAWER_CASH/);
      assert.equal(Number((await context()).expectedCash), 0.25);
    } finally { await Promise.all(clients.map(client => client.end())); }
  });
  await test("new payout methods retain the actual terminal folio credit cap", async () => {
    const fixture = await settlement(10);
    assert.equal(Number(fixture.cancelled.eligible_refund), 2500);
    await q("update refund_requests set eligible_amount=3000 where id=$1", [fixture.cancelled.refund_request_id]);
    await assert.rejects(rpc("process_refund", [fixture.cancelled.refund_request_id, users.accounting, "CREDIT-CAP", "bank_transfer", null]), /REFUND_EXCEEDS_FOLIO_CREDIT/);
    assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [fixture.cancelled.refund_request_id])).n, 0);
  });
  await test("approved refund exception still reverses its fee and completes the approval exactly once", async () => {
    const fixture = await settlement(2);
    const approval = (await named("request_manager_approval", { p_request_type: "refund_exception", p_related_entity_type: "reservation", p_related_entity_id: fixture.stay, p_reservation_id: fixture.stay, p_guest_request_id: null, p_department: "accounting", p_severity: "normal", p_reason: "Fictional approved goodwill refund", p_requested_action: { amount: 2000 }, p_staff_user_id: users.accounting })).request_manager_approval;
    const reviewed = (await named("review_manager_approval", { p_approval_id: approval, p_decision: "approve", p_reason: "Fictional goodwill approved", p_expected_version: 1, p_manager_user_id: users.manager })).review_manager_approval;
    await rpc("process_refund", [reviewed.refundRequestId, users.accounting, "EXCEPTION-2000", "bank_transfer", null]);
    await rpc("process_refund", [reviewed.refundRequestId, users.accounting, "EXCEPTION-2000", "bank_transfer", null]);
    const stored = await row("select amount,paid,credit_balance from invoices where id=$1", [fixture.folio]);
    assert.equal(Number(stored.amount), 3000); assert.equal(Number(stored.paid), 3000); assert.equal(Number(stored.credit_balance), 0);
    assert.equal((await row("select count(*)::int n from financial_adjustments where reservation_id=$1 and transaction_type='reversal'", [fixture.stay])).n, 1);
    assert.equal((await row("select execution_status from manager_approval_requests where id=$1", [approval])).execution_status, "executed");
  });
} finally {
  await db.end(); fs.mkdirSync(".tmp/cash-findings-qa", { recursive: true });
  fs.writeFileSync(".tmp/cash-findings-qa/results.json", JSON.stringify({ database, checks, generatedAt: new Date().toISOString() }, null, 2));
}
console.log(`${checks.filter(check => check.result === "PASS").length}/${checks.length} real PostgreSQL checks passed`);
if (checks.some(check => check.result === "FAIL")) process.exitCode = 1;
