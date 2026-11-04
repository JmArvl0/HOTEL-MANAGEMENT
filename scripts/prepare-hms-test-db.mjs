// Dedicated loopback-only PostgreSQL cluster; never reads .env.local.
import fs from "node:fs";
import pg from "pg";
const base = { host: "127.0.0.1", port: 55439, user: process.env.ROLE_TEST_DB_USER || "haven_hms_test" };
const database = process.env.HMS_TEST_DATABASE || "hms_integrity_test";
if (!["hms_integrity_test", "hms_integrity_verify2"].includes(database)) throw new Error("Use a dedicated HMS scratch database.");
const admin = new pg.Client({ ...base, database: "postgres" });
await admin.connect();
try {
  if ((await admin.query("select 1 from pg_database where datname=$1", [database])).rowCount) throw new Error("HMS test database already exists; this script never drops data.");
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await admin.query(`create role ${role}${role === "service_role" ? " bypassrls" : ""}`);
  }
  await admin.query(`create database ${database} template template0`);
} finally { await admin.end(); }
const c = new pg.Client({ ...base, database });
await c.connect();
try {
  // Minimal local substitutes for Supabase platform-owned schemas. App business
  // tables, triggers and RPCs come exclusively from the real migration files.
  await c.query(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  let total = 0;
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && !["20261024140000", "20261103020000", "20261103040000", "20261103050000", "20261103060000"].includes(f.split("_")[0])).sort()) {
    await c.query("begin");
    try {
      await c.query(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
      await c.query("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [file.split("_")[0], file]);
      await c.query("commit"); total++;
    } catch (e) { await c.query("rollback"); throw new Error(`${file}: ${e.message}`); }
  }
  console.log(`Applied ${total} migrations to ${database} on loopback port 55439. Unrelated unfinished admin-password migration excluded.`);
} finally { await c.end(); }
