// Real SQL replay against an isolated loopback PostgreSQL cluster only.
// Start port 55443 with user transactions_qa; never load a configured .env.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connection = { host: "127.0.0.1", port: 55443, user: "transactions_qa", connectionTimeoutMillis: 5000 };
const name = `transactions_qa_${randomUUID().replaceAll("-", "")}`;
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
  const targetFile = "20261116010000_recompute_confirmed_demo_invoice_balances.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort();
  for (const file of files.filter(file => file !== targetFile)) {
    try { await q(fs.readFileSync(`supabase/migrations/${file}`, "utf8")); }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
  }
  const correction = fs.readFileSync(`supabase/migrations/${targetFile}`, "utf8");
  await q(correction); // Fresh installations must skip the legacy seed correction.
  console.log(`PASS replayed ${files.length} migrations; empty database was unchanged`);

  const guest = randomUUID();
  await q("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,'demo@example.invalid','Demo Guest','guest','offline-placeholder',true,'active')", [guest]);
  const fixtures = [
    ["INV-7799", "RSV-1048", 26700, 8900, 17800, "partial"],
    ["INV-7800", "RSV-1045", 23200, 23200, 0, "paid"],
    ["INV-7801", "RSV-1047", 12800, 6400, 6400, "partial"],
  ];
  for (const [invoice, reservation, amount, paid, balance, status] of fixtures) {
    await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Demo Guest','Test',current_date-2,current_date-1,'checked_out',$3)", [reservation, guest, amount]);
    await q("insert into invoices(id,reservation_id,guest_name,amount,paid,balance,status,created_at) values($1,$2,'Demo Guest',$3,$4,$5,$6,'2026-08-25T16:13:46.438314+00:00')", [invoice, reservation, amount, paid, balance, status]);
  }
  await q("update invoices set paid=6401 where id='INV-7801'");
  await assert.rejects(q(correction), /DEMO_INVOICE_STATE_CHANGED/);
  let rows = (await q("select id,paid from invoices where id in ('INV-7799','INV-7800','INV-7801') order by id")).rows;
  assert.deepEqual(rows.map(row => Number(row.paid)), [8900, 23200, 6401]);
  assert.equal((await q("select count(*)::int n from audit_logs where action='recompute_confirmed_demo_invoice'")).rows[0].n, 0);
  console.log("PASS changed fixture aborts all three corrections atomically");

  await q("update invoices set paid=6400 where id='INV-7801'");
  await q(correction);
  rows = (await q("select id,amount,paid,balance,status from invoices where id in ('INV-7799','INV-7800','INV-7801') order by id")).rows;
  assert.deepEqual(rows.map(row => [Number(row.paid), Number(row.balance), row.status]), [[0, 26700, "unpaid"], [0, 23200, "unpaid"], [0, 12800, "unpaid"]]);
  assert.equal((await q("select count(*)::int n from audit_logs where action='recompute_confirmed_demo_invoice'")).rows[0].n, 3);
  console.log("PASS authoritative recompute cleared unsupported paid totals with three audit entries");
} finally {
  if (db) await db.end();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
