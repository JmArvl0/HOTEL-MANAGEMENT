// Real persistence QA on a dedicated loopback-only cluster. Never loads .env.
// Start PostgreSQL on 127.0.0.1:55441 as cash_data_qa; no hosted target accepted.
// Each run creates a new scratch database and preserves it for read-back review.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connection = { host: "127.0.0.1", port: 55441, user: "cash_data_qa", connectionTimeoutMillis: 5000 };
const database = `cash_data_qa_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ ...connection, database: "postgres" });
await admin.connect();
try {
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await admin.query(`create role ${role}${role === "service_role" ? " bypassrls" : ""}`);
  }
  await admin.query(`create database ${database}`);
} finally { await admin.end(); }
const db = new pg.Client({ ...connection, database });
await db.connect();
const checks = [], findings = [];
const q = (sql, args = []) => db.query(sql, args);
const row = async (sql, args = []) => (await q(sql, args)).rows[0];
const test = async (name, fn) => {
  try { await fn(); checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, result: "FAIL", error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
async function rpc(name, args) {
  assert.match(name, /^[a-z_]+$/);
  await q("set role service_role");
  try { return (await row(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) value`, args)).value; }
  finally { await q("reset role"); }
}
const users = Object.fromEntries(["front_desk", "accounting", "guest", "manager", "other"].map(role => [role, randomUUID()]));
const reservation = `CASH-QA-${randomUUID().slice(0, 8)}`;
const invoice = `${reservation}-I`;
const paymentKey = randomUUID(), closeKey = randomUUID(), handover = randomUUID();
let shift, payment, refundId, readBack, replayCount = 0;
try {
  await q(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    try {
      await q(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
      await q("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [file.split("_")[0], file]); replayCount++;
    } catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
  }
  console.log(`PASS replayed ${replayCount} repository migrations into new scratch database`);
  // Supabase supplies platform default table privileges. A raw PostgreSQL cluster
  // needs their read equivalent; application tables/functions remain migration-owned.
  await q("grant usage on schema public to service_role; grant select on all tables in schema public to service_role");
  for (const [role, id] of Object.entries(users)) await q("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,$3,$4,'offline-test-placeholder',true,'active')", [id, `${id}@example.invalid`, `Cash QA ${role}`, role === "other" ? "front_desk" : role]);
  await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Fictional cash QA guest','Test',current_date+30,current_date+31,'confirmed',5000)", [reservation, users.guest]);
  await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Fictional cash QA guest',5000,5000,'unpaid')", [invoice, reservation]);

  await test("cash payment without drawer leaves no payment or receipt", async () => {
    const key = randomUUID();
    await assert.rejects(rpc("hms_collect_payment", [reservation, 2000, "cash", null, key, users.front_desk, false]), /CASH_SHIFT_REQUIRED/);
    assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [key])).n, 0);
    assert.equal((await row("select count(*)::int n from financial_documents where idempotency_key=$1", [key])).n, 0);
  });
  await test("open saves opener, float, default location and audit", async () => {
    shift = (await rpc("accounting_open_cash_shift", [users.front_desk, null, 1000])).shiftId;
    const stored = await row("select * from cash_shifts where id=$1", [shift]);
    assert.equal(stored.staff_user_id, users.front_desk); assert.equal(Number(stored.opening_amount), 1000);
    assert.equal(stored.location, "Front Desk"); assert.equal(stored.status, "open"); assert.equal(stored.actual_cash, null);
    assert.equal((await row("select count(*)::int n from audit_logs where entity_id=$1 and action='open_cash_shift'", [shift])).n, 1);
  });
  await test("second drawer and unauthorized opening are rejected", async () => {
    await assert.rejects(rpc("accounting_open_cash_shift", [users.other, "QA second", 0]), /CASH_SHIFT_ALREADY_OPEN/);
    await assert.rejects(rpc("accounting_open_cash_shift", [users.guest, "QA forbidden", 0]), /CASH_SHIFT_FORBIDDEN/);
  });
  await test("cash collection saves payment linked to drawer, folio and receipt", async () => {
    payment = await rpc("hms_collect_payment", [reservation, 2000, "cash", null, paymentKey, users.front_desk, false]);
    const stored = await row("select * from payments where id=$1", [payment.payment_id]);
    assert.equal(stored.cash_shift_id, shift); assert.equal(stored.invoice_id, invoice); assert.equal(stored.reservation_id, reservation);
    assert.equal(stored.received_by, users.front_desk); assert.equal(stored.status, "paid"); assert.equal(Number(stored.amount), 2000);
    assert.equal(Number((await row("select paid from invoices where id=$1", [invoice])).paid), 2000);
    const receipt = await row("select * from financial_documents where payment_id=$1", [payment.payment_id]);
    assert.ok(receipt); assert.equal(receipt.document_type, "receipt"); assert.equal(receipt.reservation_id, reservation); assert.ok(payment.receipt);
  });
  await test("same payment retry creates exactly one payment and receipt", async () => {
    const again = await rpc("hms_collect_payment", [reservation, 2000, "cash", null, paymentKey, users.front_desk, false]);
    assert.equal(again.payment_id, payment.payment_id);
    assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [paymentKey])).n, 1);
    assert.equal((await row("select count(*)::int n from financial_documents where idempotency_key=$1", [paymentKey])).n, 1);
  });
  await test("noncash collection is saved but excluded from the drawer", async () => {
    const card = await rpc("hms_collect_payment", [reservation, 500, "card", "QA-CARD-ONLY", randomUUID(), users.front_desk, false]);
    assert.equal((await row("select cash_shift_id from payments where id=$1", [card.payment_id])).cash_shift_id, null);
  });
  await test("receipt failure rolls back payment and folio together without orphan data", async () => {
    const key = randomUUID();
    const before = await row("select paid,balance from invoices where id=$1", [invoice]);
    await q(`alter table financial_documents add constraint cash_qa_receipt_failure check(idempotency_key <> '${key}'::uuid) not valid`);
    try {
      await assert.rejects(rpc("hms_collect_payment", [reservation, 25, "cash", null, key, users.front_desk, false]), /cash_qa_receipt_failure/);
      assert.equal((await row("select count(*)::int n from payments where idempotency_key=$1", [key])).n, 0);
      assert.equal((await row("select count(*)::int n from financial_documents where idempotency_key=$1", [key])).n, 0);
      assert.deepEqual(await row("select paid,balance from invoices where id=$1", [invoice]), before);
    } finally { await q("alter table financial_documents drop constraint cash_qa_receipt_failure"); }
  });
  await test("handover saves cash source and receiver; acknowledgement and resolution persist", async () => {
    await rpc("submit_shift_handover", [users.front_desk, handover, "Review drawer count after close", "cash_shift", shift, users.other]);
    await rpc("act_shift_handover", [users.other, handover, 1, "acknowledge", null]);
    let stored = await row("select * from shift_handovers where id=$1", [handover]);
    assert.equal(stored.source_id, shift); assert.equal(stored.follow_up_user_id, users.other); assert.equal(stored.acknowledged_by, users.other); assert.equal(stored.resolved_at, null);
    await rpc("act_shift_handover", [users.other, handover, 2, "resolve", "QA count reviewed"]);
    stored = await row("select * from shift_handovers where id=$1", [handover]);
    assert.ok(stored.resolved_at); assert.equal(stored.resolution, "QA count reviewed"); assert.equal(stored.version, 3);
    assert.equal((await row("select staff_user_id from cash_shifts where id=$1", [shift])).staff_user_id, users.front_desk);
  });
  await test("invalid-source and cross-department handovers create no orphan row", async () => {
    const id = randomUUID();
    await assert.rejects(rpc("submit_shift_handover", [users.front_desk, id, "Invalid cash source", "cash_shift", randomUUID(), users.other]), /INVALID_HANDOVER_SOURCE/);
    await assert.rejects(rpc("submit_shift_handover", [users.front_desk, id, "Cross department", "cash_shift", shift, users.accounting]), /HANDOVER_FORBIDDEN/);
    assert.equal((await row("select count(*)::int n from shift_handovers where id=$1", [id])).n, 0);
  });
  await test("refund persists to refund/payment/attempt/audit tables; drawer-link gap reproduced", async () => {
    refundId = randomUUID();
    await q("insert into refund_requests(id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status) values($1,$2,$3,'QA eligible refund',2000,1250,250,'pending')", [refundId, reservation, invoice]);
    await rpc("process_refund", [refundId, users.accounting, "QA-REFUND-250"]);
    const refund = await row("select * from payments where idempotency_key=$1", [refundId]);
    assert.equal(refund.purpose, "refund"); assert.equal(refund.method, "manual_refund"); assert.equal(Number(refund.amount), 250); assert.equal(refund.cash_shift_id, null);
    assert.equal((await row("select status from refund_requests where id=$1", [refundId])).status, "processed");
    assert.equal((await row("select count(*)::int n from refund_attempts where refund_request_id=$1", [refundId])).n, 1);
    findings.push({ id: "CASH-DATA-01", severity: "high", summary: "Normal refund processing writes manual_refund with null cash_shift_id; Cash out/refund rows in the drawer do not receive that refund. Actual cash payout from the drawer cannot be classified by the current refund form." });
  });
  await test("other cashier and unexplained shortage cannot close or alter payments", async () => {
    await assert.rejects(rpc("accounting_close_cash_shift", [shift, 2750, "Independent QA count", randomUUID(), users.other]), /CASH_SHIFT_FORBIDDEN/);
    await assert.rejects(rpc("accounting_close_cash_shift", [shift, 2750, "", randomUUID(), users.front_desk]), /VARIANCE_EXPLANATION_REQUIRED/);
    assert.equal((await row("select status from cash_shifts where id=$1", [shift])).status, "open");
    assert.equal(Number((await row("select amount from payments where id=$1", [payment.payment_id])).amount), 2000);
  });
  await test("close persists recorded count, expected, shortage, notes, retry key and audit", async () => {
    const result = await rpc("accounting_close_cash_shift", [shift, 2750, "QA independent count; refund not drawer-linked", closeKey, users.front_desk]);
    assert.equal(result.expectedCash, 3000); assert.equal(result.actualCash, 2750); assert.equal(result.variance, -250);
    const stored = await row("select * from cash_shifts where id=$1", [shift]);
    assert.equal(stored.status, "closed"); assert.ok(stored.closed_at); assert.equal(stored.close_idempotency_key, closeKey);
    assert.equal(stored.close_notes, "QA independent count; refund not drawer-linked");
    assert.equal((await row("select count(*)::int n from audit_logs where entity_id=$1 and action='close_cash_shift'", [shift])).n, 1);
  });
  await test("same close retry does not duplicate its audit or change the original count", async () => {
    await rpc("accounting_close_cash_shift", [shift, 2750, "QA independent count; refund not drawer-linked", closeKey, users.front_desk]);
    assert.equal((await row("select count(*)::int n from audit_logs where entity_id=$1 and action='close_cash_shift'", [shift])).n, 1);
    await assert.rejects(rpc("accounting_close_cash_shift", [shift, 2740, "Changed count", closeKey, users.front_desk]), /IDEMPOTENCY_CONFLICT/);
  });
  await test("reconcile enforces role and explanation then saves reviewer without erasing shortage", async () => {
    await assert.rejects(rpc("accounting_reconcile_cash_shift", [shift, users.front_desk, "QA review"]), /RECONCILIATION_FORBIDDEN/);
    await assert.rejects(rpc("accounting_reconcile_cash_shift", [shift, users.accounting, ""]), /VARIANCE_EXPLANATION_REQUIRED/);
    await rpc("accounting_reconcile_cash_shift", [shift, users.accounting, "QA reviewed original shortage"]);
    const stored = await row("select * from cash_shifts where id=$1", [shift]);
    assert.equal(stored.status, "reconciled"); assert.equal(Number(stored.variance), -250); assert.equal(Number(stored.actual_cash), 2750);
    assert.equal(stored.reconciled_by, users.accounting); assert.ok(stored.reconciled_at); assert.equal(stored.reconciliation_notes, "QA reviewed original shortage");
  });
  await test("cash-shift reconciliation does not create statement reconciliation or edit guest payments", async () => {
    assert.equal((await row("select count(*)::int n from payment_reconciliations")).n, 0);
    assert.equal(Number((await row("select amount from payments where id=$1", [payment.payment_id])).amount), 2000);
    assert.equal((await row("select count(*)::int n from audit_logs where entity_id=$1 and action='reconcile_cash_shift'", [shift])).n, 1);
  });
  await test("new server connection reads committed drawer, handover and receipt", async () => {
    const reader = new pg.Client({ ...connection, database }); await reader.connect();
    try {
      await reader.query("set role service_role");
      assert.equal((await reader.query("select status from cash_shifts where id=$1", [shift])).rows[0].status, "reconciled");
      assert.equal((await reader.query("select resolution from shift_handovers where id=$1", [handover])).rows[0].resolution, "QA count reviewed");
      assert.equal((await reader.query("select count(*)::int n from financial_documents where payment_id=$1", [payment.payment_id])).rows[0].n, 1);
      readBack = {
        drawer: (await reader.query("select id,location,opening_amount,status,expected_cash,actual_cash,variance,close_notes,reconciliation_notes from cash_shifts where id=$1", [shift])).rows[0],
        payment: (await reader.query("select id,invoice_id,reservation_id,cash_shift_id,amount,status,method,purpose from payments where id=$1", [payment.payment_id])).rows[0],
        refund: (await reader.query("select amount,method,purpose,status,cash_shift_id from payments where idempotency_key=$1", [refundId])).rows[0],
        handover: (await reader.query("select source_type,source_id,summary,resolution,version from shift_handovers where id=$1", [handover])).rows[0],
      };
    } finally { await reader.end(); }
  });
  await test("all recorded cash/payment/handover audit destinations exist", async () => {
    const actions = (await q("select action from audit_logs where entity_id=any($1::text[])", [[shift, handover, payment.payment_id, refundId]])).rows.map(r => r.action);
    for (const action of ["open_cash_shift", "collect_payment", "close_cash_shift", "reconcile_cash_shift", "handover_submitted", "handover_acknowledge", "handover_resolve", "process_refund"]) assert.ok(actions.includes(action), action);
  });
} finally {
  await db.end();
  fs.mkdirSync(".tmp/cash-data-qa", { recursive: true });
  fs.writeFileSync(".tmp/cash-data-qa/results.json", JSON.stringify({ database, host: connection.host, port: connection.port, replayCount, checks, findings, readBack, fixture: { shift, reservation, invoice, handover, paymentId: payment?.payment_id }, generatedAt: new Date().toISOString() }, null, 2));
}
console.log(`${checks.filter(x => x.result === "PASS").length}/${checks.length} SQL checks pass; ${findings.length} observed product gap(s).`);
if (checks.some(x => x.result === "FAIL")) process.exitCode = 1;
