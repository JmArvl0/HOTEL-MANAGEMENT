import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";
const suite = await hotelTestDatabase();
const { db } = suite;
let passed = 0, failed = 0;
const test = async (name, run) => { try { await run(); passed++; console.log(`PASS ${name}`); } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); } };
try {
  for (const file of ["20261103140000_hotel_operations.sql", "20261103150000_hotel_operating_day.sql"]) {
    const applied=(await db.query("select 1 from supabase_migrations.schema_migrations where version=$1",[file.split("_")[0]])).rowCount;
    if(!applied&&!process.argv.includes("--baseline"))await db.query(fs.readFileSync(`supabase/migrations/${file}`,"utf8"));
  }
  const f = await hotelFixture(db, 2);
  const reservation = (await db.query("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,guests,status,total,nightly_rates) values($1,$2,'Test guest',$3,hotel_today()+1,hotel_today()+3,2,'confirmed',200,jsonb_build_array(jsonb_build_object('date',(hotel_today()+1)::text,'rate',100),jsonb_build_object('date',(hotel_today()+2)::text,'rate',100))) returning id", [f.guest, f.users.guest, f.type])).rows[0].id;
  const invoice = (await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Test',200,0,200,'unpaid') returning id", [reservation])).rows[0].id;
  await test("party updates preserve booking account, enforce capacity, version and retries", async () => {
    const key = randomUUID();
    const args = { p_reservation_id: reservation, p_members: [{ guestId: f.guest, role: "primary" }, { name: "Companion", role: "accompanying" }], p_expected_version: 0, p_key: key, p_actor: f.users.front_desk };
    const result = (await rpc(db, "hotel_party_update", args))[0].hotel_party_update;
    assert.equal(result.version, 1); assert.equal(result.members.length, 2);
    assert.deepEqual((await rpc(db, "hotel_party_update", args))[0].hotel_party_update, result);
    const companion=result.members.find(member=>member.role==="accompanying");
    await assert.rejects(rpc(db,"hotel_party_update",{...args,p_key:randomUUID(),p_expected_version:1,p_members:[{guestId:companion.guestId,role:"primary"},{guestId:f.guest,role:"accompanying"}]}),/PRIMARY_STAYING_GUEST_LOCKED/);
    await assert.rejects(rpc(db, "hotel_party_update", { ...args, p_key: randomUUID() }), /STALE_VERSION/);
    await assert.rejects(rpc(db, "hotel_party_update", { ...args, p_key: randomUUID(), p_expected_version: 1, p_members: [...args.p_members, { name: "Excess", role: "accompanying" }] }), /PARTY_CAPACITY/);
    await assert.rejects(rpc(db, "hotel_party_update", { ...args, p_key: randomUUID(), p_expected_version: 1, p_actor: f.users.housekeeping }), /FORBIDDEN/);
    assert.equal((await db.query("select user_id from reservations where id=$1", [reservation])).rows[0].user_id, f.users.guest);
    await assert.rejects(db.query("update reservations set guests=1 where id=$1", [reservation]), /PARTY_CAPACITY/);
  });
  await test("handover isolates departments and keeps archive separate from resolution", async () => {
    const created = (await rpc(db, "hotel_handover_save", { p_id: null, p_version: 0, p_body: { text: "Inspect the room", assignedRole: "housekeeping", roomId: f.rooms[0].id }, p_key: randomUUID(), p_actor: f.users.front_desk }))[0].hotel_handover_save;
    assert.equal(created.status, "open");
    const visible = (await rpc(db, "hotel_handover_list", { p_actor: f.users.housekeeping, p_archived: false }))[0].hotel_handover_list;
    assert.ok(visible.items.some(row => row.id === created.id));
    const other = (await rpc(db, "hotel_handover_list", { p_actor: f.users.accounting, p_archived: false }))[0].hotel_handover_list;
    assert.ok(!other.items.some(row => row.id === created.id));
    const update = { p_id: created.id, p_version: 1, p_body: { text: created.text, assignedRole: "housekeeping", status: "resolved", archived: false }, p_key: randomUUID(), p_actor: f.users.housekeeping };
    const resolved = (await rpc(db, "hotel_handover_save", update))[0].hotel_handover_save;
    assert.equal(resolved.status, "resolved"); assert.equal(resolved.archived, false);
    const history=(await rpc(db,"hotel_handover_history",{p_id:created.id,p_actor:f.users.housekeeping}))[0].hotel_handover_history;
    assert.equal(history.length,2);
    await assert.rejects(rpc(db,"hotel_handover_history",{p_id:created.id,p_actor:f.users.accounting}),/FORBIDDEN/);
    await assert.rejects(rpc(db, "hotel_handover_save", { ...update, p_key: randomUUID() }), /STALE_VERSION/);
    const archive=(await rpc(db,"hotel_handover_save",{...update,p_version:resolved.version,p_key:randomUUID(),p_body:{...update.p_body,archived:true}}))[0].hotel_handover_save;
    assert.equal(archive.archived,true);assert.equal(archive.status,"resolved");
    const reopened=(await rpc(db,"hotel_handover_save",{...update,p_version:archive.version,p_key:randomUUID(),p_body:{...update.p_body,archived:false,status:"open"}}))[0].hotel_handover_save;
    assert.equal(reopened.archived,false);assert.equal(reopened.status,"open");
  });
  await test("readiness names the actual missing gates without changing reservation", async () => {
    const result = (await rpc(db, "hotel_reservation_readiness", { p_reservation_id: reservation, p_actor: f.users.front_desk }))[0].hotel_reservation_readiness;
    assert.ok(result.checkIn.includes("BALANCE_DUE")); assert.ok(result.checkIn.includes("IDENTITY_REQUIRED")); assert.ok(result.checkIn.includes("ROOM_REQUIRED"));
    await assert.rejects(rpc(db, "hotel_reservation_readiness", { p_reservation_id: reservation, p_actor: f.users.housekeeping }), /FORBIDDEN/);
  });
  await test("room diary records a move from today without claiming the new room on earlier nights", async () => {
    await db.query("update reservations set status='confirmed',room_id=$2,room_number=$3,check_in=hotel_today()-1,check_out=hotel_today()+1 where id=$1", [reservation, f.rooms[0].id, f.rooms[0].number]);
    await db.query("update rooms set status='occupied' where id=$1", [f.rooms[0].id]);
    await db.query("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,hotel_today()-1,hotel_today()+1,'active')", [reservation, f.rooms[0].id]);
    await db.query("update reservations set status='checked_in' where id=$1",[reservation]);
    assert.equal((await db.query("select 1 from front_desk_eligible_room_inventory($1) where room_id=$2",[reservation,f.rooms[1].id])).rowCount,1,"in-house move picker must expose ready replacement rooms");
    const id = (await rpc(db, "front_desk_change_room", { p_reservation_id: reservation, p_new_room_id: f.rooms[1].id, p_reason: "Test room move", p_staff_user_id: f.users.front_desk }))[0].front_desk_change_room;
    const segment = (await db.query("select check_in=hotel_today() correct,effective_from=hotel_today() effective from reservation_room_assignments where id=$1", [id])).rows[0];
    assert.equal(segment.correct, true); assert.equal(segment.effective, true);
    assert.ok((await db.query("select id from reservation_room_assignments where reservation_id=$1 and room_id=$2 and effective_from=hotel_today()-1 and effective_to=hotel_today()",[reservation,f.rooms[0].id])).rowCount===1);
  });
  await test("fee catalog freezes server price and rejects stale catalog versions", async () => {
    const fee = (await rpc(db, "hotel_fee_save", { p_code: `T-${f.tag}`, p_name: "Test fee", p_amount: 125.50, p_active: true, p_version: 0, p_actor: f.users.accounting }))[0].hotel_fee_save;
    const conflictingKey=randomUUID();
    await rpc(db,"post_folio_charge",{p_reservation_id:reservation,p_description:"Generic charge",p_category:"incidental",p_amount:1,p_idempotency_key:conflictingKey,p_staff_user_id:f.users.front_desk});
    await assert.rejects(rpc(db,"hotel_fee_post",{p_reservation_id:reservation,p_code:fee.code,p_quantity:1,p_version:fee.version,p_key:conflictingKey,p_actor:f.users.front_desk}),/IDEMPOTENCY_CONFLICT/);
    const args = { p_reservation_id: reservation, p_code: fee.code, p_quantity: 2, p_version: fee.version, p_key: randomUUID(), p_actor: f.users.front_desk };
    const charge = (await rpc(db, "hotel_fee_post", args))[0].hotel_fee_post;
    assert.equal(Number(charge.amount), 251);
    assert.deepEqual((await rpc(db, "hotel_fee_post", args))[0].hotel_fee_post, charge);
    await rpc(db, "hotel_fee_save", { p_code: fee.code, p_name: "Updated", p_amount: 150, p_active: true, p_version: fee.version, p_actor: f.users.accounting });
    await assert.rejects(rpc(db, "hotel_fee_post", { ...args, p_key: randomUUID() }), /STALE_FEE/);
    assert.equal(Number((await db.query("select amount from folio_charges where id=$1", [charge.chargeId])).rows[0].amount), 251);
  });
  await test("operating day activates explicitly without backfilling history", async () => {
    await assert.rejects(rpc(db, "hotel_operating_day_activate", { p_actor: f.users.front_desk }), /FORBIDDEN/);
    const result = (await rpc(db, "hotel_operating_day_activate", { p_actor: f.users.accounting }))[0].hotel_operating_day_activate;
    assert.equal(result.active, true);
    assert.equal((await db.query("select operating_date from invoices where id=$1", [invoice])).rows[0].operating_date, null);
  });
  await test("close waits for a real posting transaction and stamps the following posting on the next day",async()=>{
    await db.query("update reservations set status='cancelled' where status in('pending','confirmed','checked_in')");
    await db.query("update cash_shifts set status='closed',closed_at=coalesce(closed_at,now()),reconciled_at=now()");
    await db.query("select sync_invoice_financials(id) from invoices");
    await db.query("update hotel_operational_policies set operating_date=hotel_today()-2 where key='default'");
    const preview=(await rpc(db,"hotel_night_audit_preview",{p_actor:f.users.accounting}))[0].hotel_night_audit_preview;
    assert.equal(preview.blockers.length,0,JSON.stringify(preview.blockers));
    const peer=await suite.connect();const peerPid=(await peer.query("select pg_backend_pid() pid")).rows[0].pid;
    let close;
    await db.query("begin");
    try{
      await db.query("select hotel_lock_operating_day()");
      await db.query("insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,verified_at) values($1,$2,50,'PHP','manual_gcash','Isolated posting','stay_payment','paid',now())",[invoice,reservation]);
      await db.query("select sync_invoice_financials($1)",[invoice]);
      close=rpc(peer,"hotel_night_audit_close",{p_date:preview.businessDate,p_version:preview.version,p_key:randomUUID(),p_actor:f.users.accounting});
      // Attach a rejection handler while proving the lock wait with PostgreSQL state.
      close.catch(()=>{});
      const deadline=Date.now()+5000;
      while(!(await db.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[peerPid])).rowCount){
        if(Date.now()>deadline)throw Error("Close did not wait on the posting lock");
        await new Promise(resolve=>setTimeout(resolve,10));
        await db.query("select pg_stat_clear_snapshot()");
      }
      await db.query("commit");
      const saved=(await close)[0].hotel_night_audit_close;
      assert.equal(Number(saved.snapshot.received),50);
      const after=(await db.query("insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,verified_at) values($1,$2,25,'PHP','manual_gcash','Following posting','stay_payment','paid',now()) returning operating_date::text",[invoice,reservation])).rows[0];
      assert.notEqual(after.operating_date,preview.businessDate);
      await db.query("select sync_invoice_financials($1)",[invoice]);
      assert.equal(Number((await db.query("select snapshot->>'received' received from hotel_night_audits where business_date=$1",[preview.businessDate])).rows[0].received),50);
    }finally{await db.query("rollback");if(close)await close.catch(()=>{});await peer.end();}
  });
  await test("a failed snapshot insert leaves both operating date and close history unchanged",async()=>{
    const preview=(await rpc(db,"hotel_night_audit_preview",{p_actor:f.users.accounting}))[0].hotel_night_audit_preview;
    await db.query("create function test_close_failure() returns trigger language plpgsql as $$begin raise exception 'ISOLATED_CLOSE_FAILURE';end$$; create trigger test_close_failure after insert on hotel_night_audits for each row execute function test_close_failure()");
    try{await assert.rejects(rpc(db,"hotel_night_audit_close",{p_date:preview.businessDate,p_version:preview.version,p_key:randomUUID(),p_actor:f.users.accounting}),/ISOLATED_CLOSE_FAILURE/);
      assert.equal((await db.query("select operating_date::text operating_day from hotel_operational_policies where key='default'")).rows[0].operating_day,preview.businessDate);
      assert.equal((await db.query("select 1 from hotel_night_audits where business_date=$1",[preview.businessDate])).rowCount,0);
    }finally{await db.query("drop trigger test_close_failure on hotel_night_audits;drop function test_close_failure()");}
  });
  await test("daily reconciliation separates booked nights, live rooms, frozen accrual, receipts and refunds",async()=>{
    const period=(await db.query("select (hotel_today()-2)::text previous_day,(hotel_today()-1)::text current_day,hotel_today()::text calendar_day")).rows[0];
    for(const [status,rate] of [["checked_out",125],["checked_out",150],["cancelled",999],["no_show",999]]){
      await db.query("insert into reservations(guest_id,guest_name,room_type,check_in,check_out,status,total,nightly_rates) values($1,'Metrics test',$2,$3::date,$4::date,$5,$6::numeric,jsonb_build_array(jsonb_build_object('date',($3::date)::text,'rate',$6::numeric)))",[f.guest,f.type,period.previous_day,period.current_day,status,rate]);
    }
    const previous=(await db.query("select hotel_daily_metrics($1) metrics",[period.previous_day])).rows[0].metrics;
    assert.equal(previous.bookedNights,2);assert.equal(Number(previous.roomAccrual),275);assert.equal(Number(previous.received),50);assert.equal(Number(previous.refunds),0);
    assert.equal(previous.liveOccupiedRooms,Number((await db.query("select count(*) n from rooms where status='occupied'")).rows[0].n));
    await db.query("insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,verified_at) values($1,$2,5,'PHP','manual_gcash','Isolated refund','refund','paid',now())",[invoice,reservation]);
    await db.query("select sync_invoice_financials($1)",[invoice]);
    const current=(await db.query("select hotel_daily_metrics($1) metrics",[period.current_day])).rows[0].metrics;
    assert.equal(Number(current.received),25);assert.equal(Number(current.refunds),5);assert.equal(Number(current.netReceipts),20);assert.equal(Number(current.roomAccrual),0);
    const unknown=(await db.query("insert into reservations(guest_id,guest_name,room_type,check_in,check_out,status,total) values($1,'Unresolved rates',$2,$3,$4,'checked_out',100) returning id",[f.guest,f.type,period.current_day,period.calendar_day])).rows[0].id;
    const broken=(await rpc(db,"hotel_night_audit_preview",{p_actor:f.users.accounting}))[0].hotel_night_audit_preview;
    assert.equal(broken.metrics.roomAccrual,null);assert.ok(broken.blockers.some(b=>b.code==="FROZEN_RATES_REQUIRED"));
    await db.query("update reservations set status='cancelled' where id=$1",[unknown]);
    const frontDesk=(await rpc(db,"hotel_night_audit_preview",{p_actor:f.users.front_desk}))[0].hotel_night_audit_preview;
    assert.equal(frontDesk.metrics,null);assert.equal(frontDesk.recentCloses.length,0);
    const clock=(await rpc(db,"hotel_operating_day",{p_actor:f.users.housekeeping}))[0].hotel_operating_day;
    assert.equal(clock.calendarDate,period.calendar_day);assert.equal(clock.businessDate,period.current_day);assert.equal(clock.lagging,true);
  });
  await test("a room move and a competing allocation cannot claim the same physical nights",async()=>{
    const race=await hotelFixture(db,2);
    const staying=(await db.query("insert into reservations(guest_id,guest_name,room_type,room_id,room_number,check_in,check_out,status,total) values($1,'Test guest',$2,$3,$4,hotel_today()-1,hotel_today()+1,'confirmed',0) returning id",[race.guest,race.type,race.rooms[0].id,race.rooms[0].number])).rows[0].id;
    await db.query("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,hotel_today()-1,hotel_today()+1,'active')",[staying,race.rooms[0].id]);
    await db.query("update reservations set status='checked_in' where id=$1",[staying]);await db.query("update rooms set status='occupied' where id=$1",[race.rooms[0].id]);
    const arriving=(await db.query("insert into reservations(guest_id,guest_name,room_type,check_in,check_out,status,total) values($1,'Test guest',$2,hotel_today(),hotel_today()+1,'confirmed',0) returning id",[race.guest,race.type])).rows[0].id;
    const peer=await suite.connect();try{
      const results=await Promise.allSettled([rpc(db,"front_desk_change_room",{p_reservation_id:staying,p_new_room_id:race.rooms[1].id,p_reason:"Race move",p_staff_user_id:race.users.front_desk}),rpc(peer,"front_desk_assign_room",{p_reservation_id:arriving,p_room_id:race.rooms[1].id,p_reason:"Race allocation",p_staff_user_id:race.users.front_desk})]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(Number((await db.query("select count(*) n from reservation_room_assignments where room_id=$1 and status='active' and check_in<hotel_today()+1 and check_out>hotel_today()",[race.rooms[1].id])).rows[0].n),1);
    }finally{await peer.end();}
  });
  await test("early checkout ends the recorded room segment without repricing planned stay dates",async()=>{
    const early=await hotelFixture(db,1);
    const stay=(await db.query("insert into reservations(guest_id,guest_name,room_type,room_id,room_number,check_in,check_out,status,total) values($1,'Test guest',$2,$3,$4,hotel_today()-1,hotel_today()+1,'confirmed',200) returning id",[early.guest,early.type,early.rooms[0].id,early.rooms[0].number])).rows[0].id;
    await db.query("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,hotel_today()-1,hotel_today()+1,'active')",[stay,early.rooms[0].id]);
    await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Test guest',200,0,200,'unpaid')",[stay]);
    await db.query("update reservations set status='checked_in' where id=$1",[stay]);await db.query("update rooms set status='occupied' where id=$1",[early.rooms[0].id]);
    await db.query("update reservations set nightly_rates=jsonb_build_array(jsonb_build_object('date',(hotel_today()-1)::text,'rate',100),jsonb_build_object('date',hotel_today()::text,'rate',100)) where id=$1",[stay]);
    await rpc(db,"record_staff_payment",{p_reservation_id:stay,p_amount:200,p_method:"manual_gcash",p_reference:"Isolated early-checkout payment",p_idempotency_key:randomUUID(),p_staff_user_id:early.users.front_desk});
    await rpc(db,"front_desk_checkout",{p_reservation_id:stay,p_staff_user_id:early.users.front_desk});
    assert.equal((await db.query("select effective_to=hotel_today() ended from reservation_room_assignments where reservation_id=$1",[stay])).rows[0].ended,true);
    assert.equal((await db.query("select check_out=hotel_today()+1 planned from reservations where id=$1",[stay])).rows[0].planned,true);
  });
  await test("night audit blocks unresolved operations and closes atomically once after resolution", async () => {
    // Remove only this clone's fixture blockers; nothing here can reach hosted data.
    await db.query("update reservations set status='cancelled' where status in('pending','confirmed','checked_in')");
    await db.query("update cash_shifts set status='closed',closed_at=now(),reconciled_at=now() where status='open'");
    await db.query("update cash_shifts set reconciled_at=now() where status='closed'");
    await db.query("update hotel_operational_policies set operating_date=hotel_today()-1 where key='default'");
    await db.query("select sync_invoice_financials(id) from invoices");
    const preview = (await rpc(db, "hotel_night_audit_preview", { p_actor: f.users.accounting }))[0].hotel_night_audit_preview;
    assert.equal(preview.blockers.length, 0, JSON.stringify(preview.blockers));
    const args = { p_date: preview.businessDate, p_version: preview.version, p_key: randomUUID(), p_actor: f.users.accounting };
    const peer = await suite.connect();
    try {
      await test("close refuses a concurrent operational write without freezing a mixed assessment",async()=>{
        await peer.query("begin");
        try{
          await peer.query("update rooms set housekeeping=housekeeping where id=$1",[f.rooms[0].id]);
          await assert.rejects(rpc(db,"hotel_night_audit_close",args),/OPERATIONS_CHANGED_RETRY/);
          assert.equal((await db.query("select operating_date::text business_date from hotel_operational_policies where key='default'")).rows[0].business_date,preview.businessDate);
          assert.equal((await db.query("select 1 from hotel_night_audits where business_date=$1",[preview.businessDate])).rowCount,0);
        }finally{await peer.query("rollback");}
      });
      const competingArgs = { ...args, p_key: randomUUID() };
      const attempts = await Promise.allSettled([rpc(db, "hotel_night_audit_close", args), rpc(peer, "hotel_night_audit_close", competingArgs)]);
      assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
      const saved = (await rpc(db, "hotel_night_audit_close", attempts[0].status === "fulfilled" ? args : competingArgs))[0].hotel_night_audit_close;
      assert.ok(saved.snapshot);
      assert.equal(Number((await db.query("select count(*) n from hotel_night_audits where business_date=$1", [preview.businessDate])).rows[0].n), 1);
      await assert.rejects(db.query("update hotel_night_audits set snapshot='{}' where business_date=$1", [preview.businessDate]), /IMMUTABLE/);
    } finally { await peer.end(); }
  });
  console.log(`Hotel operations: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
} finally { await suite.close(); }
