// Real SQL replay against a disposable loopback PostgreSQL cluster on port 55443.
// Never load the configured .env or run this against the linked database.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connection = { host: "127.0.0.1", port: 55443, user: "transactions_qa", connectionTimeoutMillis: 5000 };
const name = `frontdesk_qa_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ ...connection, database: "postgres" });
await admin.connect();
let db;
try {
  await admin.query(`create database ${name} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`);
  db = new pg.Client({ ...connection, database: name });
  await db.connect();
  const q = (sql, args = []) => db.query(sql, args);
  await q("set client_min_messages to warning");
  await q(`create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await q("select 1 from pg_roles where rolname=$1", [role])).rowCount)
      await q(`create role ${role}${role === "service_role" ? " bypassrls" : ""}`);
  }
  const targetFile = "20261116020000_retire_orphaned_demo_reservation.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort();
  for (const file of files.filter(file => file !== targetFile)) {
    try { await q(fs.readFileSync(`supabase/migrations/${file}`, "utf8")); }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
  }
  const correction = fs.readFileSync(`supabase/migrations/${targetFile}`, "utf8");
  await q(correction);
  assert.equal((await q("select count(*)::int n from audit_logs where action='retire_orphaned_demo_reservation'")).rows[0].n, 0);

  await q("insert into guests(id,name,loyalty_tier,loyalty_points,lifetime_spend) values('GST-2039','Demo Guest','gold',174,17400)");
  await q(`insert into reservations
    (id,guest_id,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,created_at,checked_out_at)
    values ('RSV-1046','GST-2039','Demo Guest','Garden Twin','2026-08-26','2026-08-29','checked_out','Phone',17400,0,0,'unpaid','2026-08-25T16:13:45.455004+00:00','2026-09-27T14:33:19.782+00:00')`);
  await q(`update reservation_guests set added_at='2026-11-03T10:49:50.311035+00:00',
    updated_at='2026-11-14T00:54:49.04689+00:00', attendance_status='departed',
    occupant_type='unknown' where reservation_id='RSV-1046'`);
  await q(`insert into guest_loyalty_ledger
    (id,guest_id,reservation_id,points,transaction_type,notes,created_at)
    values ('48afcafe-4de7-4169-bef1-4228dd36182e','GST-2039','RSV-1046',174,'earned',
      'Stay RSV-1046 x1','2026-09-27T14:33:21.999363+00:00')`);
  await q("update reservations set total=17401 where id='RSV-1046'");
  await assert.rejects(q(correction), /DEMO_RESERVATION_STATE_CHANGED/);
  assert.equal((await q("select count(*)::int n from reservations where id='RSV-1046'")).rows[0].n, 1);
  await q("update reservations set total=17400 where id='RSV-1046'");

  await q("insert into guest_requests(reservation_id,request,department) values('RSV-1046','Demo link','front_desk')");
  await assert.rejects(q(correction), /DEMO_RESERVATION_LINKED/);
  assert.equal((await q("select count(*)::int n from reservations where id='RSV-1046'")).rows[0].n, 1);
  await q("delete from guest_requests where reservation_id='RSV-1046'");

  await q("update guests set loyalty_points=175 where id='GST-2039'");
  await assert.rejects(q(correction), /DEMO_GUEST_LOYALTY_CHANGED/);
  await q("update guests set loyalty_points=174 where id='GST-2039'");

  await q(correction);
  const booking = (await q("select status,cancellation_reason,checked_out_at from reservations where id='RSV-1046'")).rows[0];
  assert.equal(booking.status, "cancelled");
  assert.match(booking.cancellation_reason, /Retired orphaned demo booking/);
  assert.equal(booking.checked_out_at, null);
  const guest = (await q("select loyalty_points,lifetime_spend,loyalty_tier from guests where id='GST-2039'")).rows[0];
  assert.equal(guest.loyalty_points, 0);
  assert.equal(Number(guest.lifetime_spend), 0);
  assert.equal(guest.loyalty_tier, "gold");
  const ledger = (await q("select transaction_type,points,reservation_id from guest_loyalty_ledger where guest_id='GST-2039' order by created_at")).rows;
  assert.deepEqual(ledger.map(row => [row.transaction_type, row.points, row.reservation_id]),
    [["earned", 174, "RSV-1046"], ["adjusted", -174, "RSV-1046"]]);
  const audit = (await q("select before_data,after_data from audit_logs where action='retire_orphaned_demo_reservation' and entity_id='RSV-1046'")).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].before_data.total, 17400);
  assert.equal(audit[0].after_data.status, "cancelled");
  await q(correction);
  assert.equal((await q("select count(*)::int n from audit_logs where action='retire_orphaned_demo_reservation'")).rows[0].n, 1);
  assert.equal((await q("select count(*)::int n from guest_loyalty_ledger where guest_id='GST-2039'")).rows[0].n, 2);
  console.log(`PASS ${files.length} migration replay; fixture archived and credit reversed once, altered and linked fixtures rejected`);
} finally {
  if (db) await db.end();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
