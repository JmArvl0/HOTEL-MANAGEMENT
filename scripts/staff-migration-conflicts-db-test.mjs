// Real PostgreSQL acceptance tests. Start a disposable cluster on loopback port
// 55468 with role migration_qa. This script creates and drops its own databases.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const connection = { host: "127.0.0.1", port: 55468, user: "migration_qa", connectionTimeoutMillis: 5000 };
const admin = new pg.Client({ ...connection, database: "postgres" });
const migrations = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort();
const additions = [
  "20261120010000_portal_request_inventory_link.sql",
  "20261120020000_deduplicate_financial_documents.sql",
];
const prior = files.filter(name => name < additions[0]);
const versions = files.map(name => name.split("_")[0]);
assert.equal(new Set(versions).size, versions.length, "Every migration has a unique version");
assert.ok(additions.every(name => files.includes(name)));

const one = async (db, query, values = []) => (await db.query(query, values)).rows[0];
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function isolated(run) {
  const name = `staff_migration_qa_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`create database ${name}`);
  const db = new pg.Client({ ...connection, database: name });
  try {
    await db.connect();
    await db.query(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key, name text);
    `);
    const withSecondConnection = async operation => {
      const second = new pg.Client({ ...connection, database: name });
      await second.connect();
      try { return await operation(second); } finally { await second.end(); }
    };
    await run(db, withSecondConnection);
  } finally {
    await db.end();
    await admin.query(`drop database ${name} with (force)`);
  }
}

async function replay(db, list) {
  for (const name of list) {
    try {
      await db.query(await readFile(new URL(name, migrations), "utf8"));
      await db.query("insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)", [name.slice(0, 14), name.slice(15, -4)]);
    } catch (error) {
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  }
}

async function fixture(db) {
  const ids = {};
  for (const role of ["guest", "front_desk", "accounting", "housekeeping", "manager"]) {
    ids[role] = randomUUID();
    await db.query("insert into user_accounts(id,email,name,role,password_hash) values($1,$2,'Local QA',$3,'fixture-only')",
      [ids[role], `${role}@example.invalid`, role]);
  }
  await db.query("update hotel_operational_policies set vat_rate_bp=1200,service_charge_bp=1000 where key='default'");
  await db.query("insert into room_types(name,description,max_guests,beds,base_rate) values('QA Suite','Local QA',2,'Twin',1000)");
  const { id: guest } = await one(db, "insert into guests(name,email,user_account_id) values('Local QA guest','guest-stay@example.invalid',$1) returning id", [ids.guest]);
  async function stay() {
    const { id: reservation } = await one(db, `
      insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total)
      values($1,$2,'Local QA guest','QA Suite',hotel_today()+1,hotel_today()+2,'confirmed',1000) returning id
    `, [guest, ids.guest]);
    const { id: invoice } = await one(db, `
      insert into invoices(reservation_id,guest_name,amount,balance,status)
      values($1,'Local QA guest',1000,1000,'unpaid') returning id
    `, [reservation]);
    return { reservation, invoice };
  }
  await db.query(`
    insert into inventory(id,name,category,quantity,reorder_point,unit)
    values('QA-STOCK-A','QA towels A','Amenities',10,1,'pieces'),('QA-STOCK-B','QA towels B','Amenities',10,1,'pieces');
    update guest_request_catalog set inventory_item_id='QA-STOCK-A' where value='extra_towels';
  `);
  return { ids, primary: await stay(), secondary: await stay(), unrelated: await stay() };
}

const request = (db, user, stay, key, description = "More towels", types = ["extra_towels"], details = {}) =>
  one(db, "select * from customer_submit_guest_requests($1,$2,$3,$4,$5,$6)", [user, stay.reservation, types, description, details, key]);
const payment = (db, stay, status = "paid") => one(db, `
  insert into payments(invoice_id,reservation_id,amount,method,purpose,status,reference)
  values($1,$2,300,'card','stay_payment',$3,$4) returning id
`, [stay.invoice, stay.reservation, status, `QA-${randomUUID()}`]);
const issue = async (db, user, type, target, key = randomUUID()) =>
  (await one(db, "select accounting_generate_document($1,$2,$3,$4,$5) as document",
    [type, type === "folio" ? target : null, type === "receipt" ? target : null, key, user])).document;
const count = async (db, sql, values) => (await one(db, sql, values)).total;

try {
  await admin.connect();
  assert.deepEqual(await one(admin, "select current_user as actor, inet_server_port() as port"), { actor: "migration_qa", port: 55468 });
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  end $$;`);

  await test("clean replay applies every existing and additive migration", () => isolated(async db => {
    await replay(db, files);
    assert.equal(await count(db, "select count(*)::int total from supabase_migrations.schema_migrations"), files.length);
    console.log(`Clean replay: ${files.length} migrations`);
  }));

  await isolated(async (db, withSecondConnection) => {
    await replay(db, prior);
    const { ids, primary, secondary, unrelated } = await fixture(db);
    const legacyKey = randomUUID();
    const legacyRequest = await request(db, ids.guest, primary, legacyKey);
    const { id: settled } = await payment(db, primary);
    const { id: unpaid } = await payment(db, secondary, "pending_verification");
    await db.query("insert into folio_charges(invoice_id,reservation_id,description,amount) values($1,$2,'Original charge description',80)", [primary.invoice, primary.reservation]);
    await db.query("update invoices set terminal_settlement=$2 where id=$1", [primary.invoice, { originalAmount: 1300 }]);
    const legacyReceipt = await issue(db, ids.front_desk, "receipt", settled);
    await issue(db, ids.accounting, "receipt", settled);
    const legacyFolio = await issue(db, ids.accounting, "folio", primary.reservation);
    const previousDocuments = (await db.query("select * from financial_documents order by id")).rows;
    assert.equal(previousDocuments.length, 3);

    await test("upgrade applies two migrations and preserves existing documents and request links", async () => {
      await replay(db, additions);
      assert.deepEqual((await db.query("select * from financial_documents order by id")).rows, previousDocuments);
      assert.equal((await one(db, "select inventory_item_id from guest_requests where id=$1", [legacyRequest.id])).inventory_item_id, null);
      assert.equal(await count(db, "select count(*)::int total from supabase_migrations.schema_migrations"), prior.length + additions.length);
      console.log(`Upgrade replay: ${prior.length} applied + ${additions.length} pending`);
    });

    await test("portal request stamps the stock link and keeps request fingerprint and historical retries", async () => {
      const batch = randomUUID();
      const created = await request(db, ids.guest, primary, batch);
      const row = await one(db, "select inventory_item_id,request_fingerprint from guest_requests where id=$1", [created.id]);
      assert.equal(row.inventory_item_id, "QA-STOCK-A");
      assert.match(row.request_fingerprint, /^[0-9a-f]{32}$/);
      await db.query("update guest_request_catalog set inventory_item_id='QA-STOCK-B' where value='extra_towels'");
      assert.deepEqual(await request(db, ids.guest, primary, batch), created);
      assert.deepEqual(await request(db, ids.guest, primary, legacyKey), legacyRequest);
      assert.equal((await one(db, "select inventory_item_id from guest_requests where id=$1", [created.id])).inventory_item_id, "QA-STOCK-A");
      assert.equal((await one(db, "select inventory_item_id from guest_requests where id=$1", [legacyRequest.id])).inventory_item_id, null);
      await assert.rejects(request(db, ids.guest, primary, batch, "Changed description"), /RETRY_PAYLOAD_CONFLICT/);
      await assert.rejects(request(db, ids.guest, secondary, batch), /RETRY_PAYLOAD_CONFLICT/);
      await assert.rejects(request(db, ids.manager, primary, batch), /CUSTOMER_ACCESS_REQUIRED/);
      assert.equal(await count(db, "select count(*)::int total from guest_requests where batch_id=$1", [batch]), 1);
      await db.query("select front_desk_review_guest_request_batch($1,$2,'approve',null)", [ids.front_desk, batch]);
      await db.query("select staff_progress_guest_request($1,'complete',$2)", [created.id, ids.housekeeping]);
      const stock = await one(db, "select item_id,quantity from inventory_movements where source_type='guest_request' and source_id=$1", [created.id]);
      assert.equal(stock.item_id, "QA-STOCK-A");
      assert.equal(Number(stock.quantity), 1);
    });

    await test("concurrent portal retries insert once, and inactive catalog rows never stamp stock", async () => {
      const batch = randomUUID();
      await withSecondConnection(async second => {
        const [first, repeated] = await Promise.all([request(db, ids.guest, secondary, batch), request(second, ids.guest, secondary, batch)]);
        assert.deepEqual(first, repeated);
        assert.equal((await one(db, "select inventory_item_id from guest_requests where id=$1", [first.id])).inventory_item_id, "QA-STOCK-B");
      });
      assert.equal(await count(db, "select count(*)::int total from guest_requests where batch_id=$1", [batch]), 1);
      await db.query("update guest_request_catalog set active=false where value='extra_towels'");
      const inactive = await request(db, ids.guest, secondary, randomUUID());
      assert.equal((await one(db, "select inventory_item_id from guest_requests where id=$1", [inactive.id])).inventory_item_id, null);
    });

    await test("receipt returns the canonical historical document and preserves existing duplicate rows", async () => {
      const reused = await issue(db, ids.front_desk, "receipt", settled);
      assert.equal(reused.documentId, legacyReceipt.documentId);
      assert.deepEqual(reused.snapshot, legacyReceipt.snapshot);
      assert.equal(await count(db, "select count(*)::int total from financial_documents where payment_id=$1", [settled]), 2);
      await assert.rejects(issue(db, ids.accounting, "receipt", unpaid), /PAYMENT_NOT_SETTLED/);
      await assert.rejects(issue(db, ids.manager, "receipt", settled), /DOCUMENT_FORBIDDEN/);
    });

    await test("folio compares full contents while prior retry keys keep the original snapshot", async () => {
      const retryKey = randomUUID();
      const reused = await issue(db, ids.accounting, "folio", primary.reservation, retryKey);
      assert.equal(reused.documentId, legacyFolio.documentId);
      assert.equal(reused.snapshot.originalFolioAmount, 1300);
      assert.equal(reused.snapshot.taxBreakdown.vatRateBp, 1200);
      assert.equal(reused.snapshot.taxBreakdown.serviceChargeBp, 1000);
      assert.deepEqual(reused.snapshot.terminalSettlement, { originalAmount: 1300 });
      await db.query("update folio_charges set description='Corrected charge description' where invoice_id=$1", [primary.invoice]);
      const changed = await issue(db, ids.accounting, "folio", primary.reservation);
      assert.notEqual(changed.documentId, legacyFolio.documentId);
      assert.equal(changed.snapshot.folioAmount, legacyFolio.snapshot.folioAmount);
      assert.equal(changed.snapshot.charges[0].description, "Corrected charge description");
      assert.equal((await issue(db, ids.accounting, "folio", primary.reservation, retryKey)).documentId, legacyFolio.documentId);
      await assert.rejects(issue(db, ids.accounting, "folio", secondary.reservation, retryKey), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(issue(db, ids.accounting, "receipt", settled, retryKey), /IDEMPOTENCY_CONFLICT/);
    });

    for (const [type, target] of [["receipt", (await payment(db, secondary)).id], ["folio", unrelated.reservation]]) {
      await test(`concurrent ${type} issuance with different keys creates one document and one issuance audit`, () =>
        withSecondConnection(async second => {
          const [first, repeated] = await Promise.all([issue(db, ids.front_desk, type, target), issue(second, ids.accounting, type, target)]);
          assert.equal(first.documentId, repeated.documentId);
          assert.deepEqual(first.snapshot, repeated.snapshot);
          const docs = await count(db, `
            select count(*)::int total from financial_documents
            where document_type=$1 and (case when $1='receipt' then payment_id::text else reservation_id end)=$2
          `, [type, target]);
          assert.equal(docs, 1);
          assert.equal(await count(db, "select count(*)::int total from audit_logs where action='generate_financial_document' and entity_id=$1", [first.documentId]), 1);
        }));
    }

    await test("a shared request key can only bind to one source under concurrent issuance", () =>
      withSecondConnection(async second => {
        const key = randomUUID();
        const results = await Promise.allSettled([
          issue(db, ids.accounting, "folio", secondary.reservation, key),
          issue(second, ids.front_desk, "folio", unrelated.reservation, key),
        ]);
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const rejected = results.find(result => result.status === "rejected");
        assert.match(rejected.reason.message, /IDEMPOTENCY_CONFLICT/);
      }));

    await test("staff collection and retry still return one payment and its receipt", async () => {
      const key = randomUUID();
      const inputs = [unrelated.reservation, `QA-collection-${key}`, key, ids.front_desk];
      const collect = async () => (await one(db, "select hms_collect_payment($1,75,'card',$2,$3,$4) as result", inputs)).result;
      const first = await collect();
      const repeated = await collect();
      assert.equal(first.payment_id, repeated.payment_id);
      assert.equal(first.receipt.documentId, repeated.receipt.documentId);
      assert.equal(first.receipt.snapshot.payments[0].amount, 75);
      assert.equal(await count(db, "select count(*)::int total from payments where idempotency_key=$1", [key]), 1);
      assert.equal(await count(db, "select count(*)::int total from financial_documents where payment_id=$1", [first.payment_id]), 1);
    });

    await test("service role can call both RPCs and replay keys have no direct API grants", async () => {
      const rpcs = ["public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid)", "public.accounting_generate_document(text,text,uuid,uuid,uuid)"];
      for (const rpc of rpcs) {
        const grants = await one(db, `
          select has_function_privilege('service_role',$1,'execute') as service,
            has_function_privilege('anon',$1,'execute') as anon,
            has_function_privilege('authenticated',$1,'execute') as authenticated
        `, [rpc]);
        assert.deepEqual(grants, { service: true, anon: false, authenticated: false });
      }
      assert.deepEqual(await one(db, `
        select has_table_privilege('service_role','public.financial_document_replay_keys','select') as service,
          has_table_privilege('authenticated','public.financial_document_replay_keys','select') as authenticated,
          relrowsecurity as rls from pg_class where oid='public.financial_document_replay_keys'::regclass
      `), { service: false, authenticated: false, rls: true });
    });
  });
  console.log(`${passed} PostgreSQL scenarios passed.`);
} finally {
  await admin.end();
}
