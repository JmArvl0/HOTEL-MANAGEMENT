// Isolated PostgreSQL regression harness. Never reads .env or connects remotely.
// Run against a disposable cluster with user backend_audit, loopback port 55433.
// Initialize with PostgreSQL initdb; start with pg_ctl -o "-p 55433 -h 127.0.0.1".
import fs from "node:fs";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const connection = { host: "127.0.0.1", port: 55433, user: "backend_audit", database: "postgres", connectionTimeoutMillis: 5000 };
const admin = new pg.Client(connection);
await admin.connect();
await admin.query("drop database if exists cancellation_folio_test with (force)");
await admin.query("create database cancellation_folio_test");
await admin.end();
const db = new pg.Client({ ...connection, database: "cancellation_folio_test" });
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
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && !(process.argv.includes("--baseline") && f.includes("cancellation_folio_settlement"))).sort();
  // The hosted project already applied the recovered remote history. Test that
  // real upgrade order as well as a clean chronological installation.
  const pending = new Set([remediation, "20261103130000_hotel_nightly_availability.sql", "20261103140000_hotel_operations.sql", "20261103150000_hotel_operating_day.sql", "20261103160000_cancellation_folio_settlement.sql"]);
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

  const setup = async (days, deposit = 5000, extra = 0) => {
    const f = await fixture();
    await db.query("update reservations set check_in=(now() at time zone 'Asia/Manila')::date+$2::int,check_out=(now() at time zone 'Asia/Manila')::date+$2::int+2,total=10000 where id=$1", [f.reservation, days]);
    await db.query("update invoices set amount=10000,balance=10000 where id=$1", [f.invoice]);
    for (const [amount,purpose] of [[deposit,'reservation_deposit'],[extra,'stay_payment']]) if(amount) await db.query("insert into payments(invoice_id,reservation_id,amount,method,purpose,status) values($1,$2,$3,'manual_gcash',$4,'paid')",[f.invoice,f.reservation,amount,purpose]);
    await db.query("select sync_invoice_financials($1)",[f.invoice]);return f;
  };
  const cancel = f => call('cancel_reservation',{p_reservation_id:f.reservation,p_actor_user_id:f.users.guest,p_reason:'Guest cancelled'});
  const invoice = async f => (await db.query('select * from invoices where id=$1',[f.invoice])).rows[0];
  for(const [days,fee,credit] of [[20,0,5000],[10,2500,2500],[2,5000,0]]) await test(`cancellation ${days} days creates fee ${fee} and credit ${credit}`,async()=>{
    const f=await setup(days);const result=(await cancel(f))[0];const i=await invoice(f);
    assert.equal(Number(i.amount),fee);assert.equal(Number(i.balance),0);assert.equal(Number(i.credit_balance),credit);assert.equal(Number(result.eligible_refund),credit);
    const charges=(await db.query("select * from folio_charges where reservation_id=$1 and category='cancellation_fee'",[f.reservation])).rows;
    assert.equal(charges.length,fee?1:0);if(fee)assert.equal(Number(charges[0].amount),fee);
    assert.equal((await db.query("select count(*)::int n from financial_adjustments where reservation_id=$1 and reason like 'Unused reservation obligation%'",[f.reservation])).rows[0].n,1);
    await cancel(f);assert.equal((await db.query('select count(*)::int n from folio_charges where reservation_id=$1',[f.reservation])).rows[0].n,fee?1:0);
    if(credit){await call('process_refund',{p_refund_id:result.refund_request_id,p_staff_user_id:f.users.accounting,p_reference:'Offline refund'});await call('process_refund',{p_refund_id:result.refund_request_id,p_staff_user_id:f.users.accounting,p_reference:'Offline refund'});assert.equal(Number((await invoice(f)).credit_balance),0);assert.equal(Number((await invoice(f)).balance),0);}
  });
  await test('advance stay payments become refundable credit after deposit fee',async()=>{const f=await setup(10,5000,2000);assert.equal(Number((await cancel(f))[0].eligible_refund),4500);});
  await test('unverified funds never create a fee or refundable credit',async()=>{const f=await setup(2,0);await db.query("insert into payments(invoice_id,reservation_id,amount,method,purpose,status) values($1,$2,5000,'manual_gcash','reservation_deposit','pending_verification')",[f.invoice,f.reservation]);await cancel(f);assert.equal(Number((await invoice(f)).amount),0);assert.equal(Number((await invoice(f)).credit_balance),0);});
  await test('no-show posts collected deposit once and releases room obligation',async()=>{const f=await setup(-1,3000,1000);const args={p_reservation_id:f.reservation,p_staff_user_id:f.users.front_desk,p_reason:'Did not arrive'};await call('mark_reservation_no_show',args);await call('mark_reservation_no_show',args);const i=await invoice(f);assert.equal(Number(i.amount),3000);assert.equal(Number(i.credit_balance),1000);assert.equal((await db.query("select count(*)::int n from folio_charges where reservation_id=$1 and category='no_show_fee'",[f.reservation])).rows[0].n,1);});
  await test('no-show cannot be posted before cutoff',async()=>{const f=await setup(2);await assert.rejects(call('mark_reservation_no_show',{p_reservation_id:f.reservation,p_staff_user_id:f.users.front_desk,p_reason:'Too early'}),/NO_SHOW_CUTOFF_NOT_REACHED/);assert.equal(Number((await invoice(f)).amount),10000);});
  await test('refund execution rejects cash above available folio credit',async()=>{const f=await setup(10);const rr=(await cancel(f))[0];await db.query('update refund_requests set eligible_amount=3000 where id=$1',[rr.refund_request_id]);await assert.rejects(call('process_refund',{p_refund_id:rr.refund_request_id,p_staff_user_id:f.users.accounting,p_reference:'Invalid'}),/REFUND_EXCEEDS_FOLIO_CREDIT/);});
  await test('approved refund exception records fee waiver before payout',async()=>{
    const f=await setup(2);await cancel(f);const manager=randomUUID();await db.query("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,'Manager','manager','offline',true,'active')",[manager,`${manager}@example.invalid`]);
    const approval=(await call('request_manager_approval',{p_request_type:'refund_exception',p_related_entity_type:'reservation',p_related_entity_id:f.reservation,p_reservation_id:f.reservation,p_guest_request_id:null,p_department:'accounting',p_severity:'normal',p_reason:'Approved goodwill refund',p_requested_action:{amount:2000},p_staff_user_id:f.users.accounting}))[0].request_manager_approval;
    const reviewed=(await call('review_manager_approval',{p_approval_id:approval,p_decision:'approve',p_reason:'Goodwill approved',p_expected_version:1,p_manager_user_id:manager}))[0].review_manager_approval;
    await call('process_refund',{p_refund_id:reviewed.refundRequestId,p_staff_user_id:f.users.accounting,p_reference:'Exception refund'});
    const i=await invoice(f);assert.equal(Number(i.amount),3000);assert.equal(Number(i.paid),3000);assert.equal(Number(i.credit_balance),0);assert.equal((await db.query("select count(*)::int n from financial_adjustments where reservation_id=$1 and transaction_type='reversal'",[f.reservation])).rows[0].n,1);
  });
  await test('policy snapshots survive later global policy changes',async()=>{
    const f=await setup(10);await db.query("update hotel_operational_policies set cancellation_partial_refund_basis_points=2500 where key='default'");
    try{assert.equal(Number((await cancel(f))[0].eligible_refund),2500);}finally{await db.query("update hotel_operational_policies set cancellation_partial_refund_basis_points=5000 where key='default'");}
  });
  await test('settlement metadata and internal helper are protected',async()=>{
    const f=await setup(2);await cancel(f);
    await assert.rejects(db.query("update invoices set terminal_settlement='{}'::jsonb where id=$1",[f.invoice]),/TERMINAL_SETTLEMENT_IMMUTABLE/);
    assert.equal((await db.query("select has_function_privilege('service_role','settle_terminal_folio(text,uuid,numeric,integer,jsonb,text)','execute') allowed")).rows[0].allowed,false);
    await assert.rejects(call('cancel_reservation',{p_reservation_id:f.reservation,p_actor_user_id:f.users.accounting,p_reason:'Unauthorized cancellation'}),/CANCELLATION_FORBIDDEN/);
  });
  await test('concurrent cancellations post one fee and one refund request',async()=>{
    const f=await setup(10);const clients=[new pg.Client({...connection,database:'cancellation_folio_test'}),new pg.Client({...connection,database:'cancellation_folio_test'})];
    await Promise.all(clients.map(c=>c.connect()));
    try{await Promise.all(clients.map(c=>c.query("select * from cancel_reservation($1,$2,'Concurrent cancellation')",[f.reservation,f.users.guest])));}finally{await Promise.all(clients.map(c=>c.end()));}
    assert.equal((await db.query('select count(*)::int n from folio_charges where reservation_id=$1',[f.reservation])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from refund_requests where reservation_id=$1',[f.reservation])).rows[0].n,1);
  });
  await test('daily reports classify posted cancellation and no-show fees',async()=>{
    const f=await setup(2);await call('hotel_operating_day_activate',{p_actor:f.users.accounting});await cancel(f);
    const n=await setup(-1,3000);await call('mark_reservation_no_show',{p_reservation_id:n.reservation,p_staff_user_id:n.users.front_desk,p_reason:'No arrival'});
    const metrics=(await db.query('select hotel_daily_metrics(hotel_today()) m')).rows[0].m;
    assert.equal(Number(metrics.cancellationFees),5000);assert.equal(Number(metrics.noShowFees),3000);
    assert.equal(metrics.unreconciledInvoices.includes(f.invoice),false);
  });
  await test('cancellation preserves independently posted transportation charges',async()=>{
    const f=await setup(10);
    await db.query("insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by) values($1,$2,'Assigned pickup','transportation',500,$3)",[f.invoice,f.reservation,f.users.front_desk]);
    await db.query('update invoices set amount=amount+500 where id=$1',[f.invoice]);
    const result=(await cancel(f))[0];assert.equal(Number((await invoice(f)).amount),3000);assert.equal(Number(result.eligible_refund),2000);
  });
  await test('residual service balance can be collected after operational closure',async()=>{
    const f=await setup(2,5000);
    await db.query("insert into folio_charges(invoice_id,reservation_id,description,category,amount) values($1,$2,'Pickup','transportation',500)",[f.invoice,f.reservation]);await db.query('update invoices set amount=amount+500 where id=$1',[f.invoice]);await cancel(f);
    assert.equal(Number((await invoice(f)).balance),500);
    await call('record_staff_payment',{p_reservation_id:f.reservation,p_amount:500,p_method:'gcash',p_reference:'Residual pickup fee',p_idempotency_key:randomUUID(),p_staff_user_id:f.users.accounting,p_allow_overpayment:false,p_allow_unattributed_cash:false});assert.equal(Number((await invoice(f)).balance),0);
  });
  await test('issued folio snapshots include original obligation and explicit fee',async()=>{
    const f=await setup(10);await cancel(f);
    const document=(await call('accounting_generate_document',{p_document_type:'folio',p_reservation_id:f.reservation,p_payment_id:null,p_idempotency_key:randomUUID(),p_staff_user_id:f.users.accounting}))[0].accounting_generate_document.snapshot;
    assert.equal(Number(document.originalFolioAmount),10000);assert.equal(Number(document.folioAmount),2500);assert.equal(document.terminalSettlement.kind,'cancellation_fee');assert.equal(document.charges[0].category,'cancellation_fee');assert.equal(Number(document.adjustments[0].amount),10000);
  });
  await test('half-cent deposit policies derive the fee from rounded refund',async()=>{
    const f=await setup(10,0.03);const rr=(await cancel(f))[0];assert.equal(Number((await invoice(f)).amount),0.01);assert.equal(Number(rr.eligible_refund),0.02);
  });
  if(failed)process.exitCode=1;
} finally {await db.end();}
