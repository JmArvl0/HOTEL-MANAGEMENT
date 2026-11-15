// Real PostgreSQL integration and race tests. Loopback clone only, no .env.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
const peer = await suite.connect();
let passed = 0;
const q = async (sql, args = [], client = db) => (await client.query(sql, args)).rows;
const one = async (sql, args = [], client = db) => (await q(sql, args, client))[0];
const call = async (name, args, client = db) => (await rpc(client, name, args))[0][name];
const test = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
try {
  if (!(await one("select to_regclass('public.workforce_employee_links') present")).present) await db.query(fs.readFileSync("supabase/migrations/20261115090000_workforce_availability.sql", "utf8"));
  await db.query("set statement_timeout='10s'"); await peer.query("set statement_timeout='10s'");
  const f = await hotelFixture(db, 3);
  const second = (await hotelFixture(db, 1)).users.housekeeping;
  const c = (await one("select row_to_json(c) c from workforce_integration_settings c")).c;
  const config = (auto, version) => call("hotel_configure_workforce", { p_actor: f.users.owner, p_source: c.source_system, p_property: c.property_id, p_auto: auto, p_version: version, p_reason: "Reviewed local integration test" });
  const link = (user, employee) => call("hotel_link_workforce_employee", { p_actor: f.users.owner, p_user: user, p_employee: employee, p_link: null, p_reason: "Reviewed test employee mapping" });
  const stamp = () => Date.now();
  const event = (employeeId, version, extra = {}) => ({ contract: "haven-workforce-v1", eventId: randomUUID(), sourceSystem: c.source_system, propertyId: c.property_id,
    employeeId, version, observedAt: new Date(stamp()-1000).toISOString(), validUntil: new Date(stamp()+9*60_000).toISOString(), employmentActive: true, department: "housekeeping", attendance: "clocked_in",
    shift: { startsAt: new Date(stamp()-3600_000).toISOString(), endsAt: new Date(stamp()+3600_000).toISOString() }, ...extra });
  const receive = (e, client = db) => call("hotel_receive_workforce_availability", { p_event: e }, client);
  const status = async user => (await one("select hotel_workforce_status($1) status", [user])).status;
  const insertTask = async (room, client = db, extra = {}) => (await one("insert into housekeeping_tasks(room_id,room_number,task,task_type,source_type,source_id,status) values($1,$2,'Test checkout','checkout_cleaning',$3,$4,'pending') returning id", [room.id,room.number,extra.source ?? "checkout",randomUUID()], client)).id;

  await test("default off and explicit reviewed employee mapping", async () => {
    assert.equal(c.auto_assign_checkout, false);
    assert.equal(await status(f.users.housekeeping), "unmapped");
    await assert.rejects(call("hotel_link_workforce_employee", { p_actor: f.users.manager, p_user: f.users.housekeeping, p_employee: "QA-A", p_link: null, p_reason: "Manager cannot grant mapping" }), /FORBIDDEN/);
    await link(f.users.housekeeping, "QA-A"); await link(second, "QA-B");
    assert.equal(await status(f.users.housekeeping), "awaiting_sync");
    await assert.rejects(link(second, "QA-A"), /unique|duplicate/);
    await assert.rejects(link(f.users.guest, "QA-G"), /INVALID_ACCOUNT/);
  });
  let first;
  await test("authenticated contract evidence is versioned, scoped, and idempotent", async () => {
    first=event("QA-A", 1); await receive(first);
    assert.equal(await status(f.users.housekeeping), "on_duty");
    const saved = await one("select received_at from workforce_availability a join workforce_employee_links l on l.id=a.link_id where l.user_id=$1", [f.users.housekeeping]);
    assert.equal((await receive(first)).replayed, true);
    assert.equal((await one("select received_at from workforce_availability a join workforce_employee_links l on l.id=a.link_id where l.user_id=$1", [f.users.housekeeping])).received_at.toISOString(), saved.received_at.toISOString());
    await assert.rejects(receive({ ...first, attendance: "clocked_out" }), /EVENT_CONFLICT/);
    await assert.rejects(receive(event("missing",1)), /MAPPING_NOT_FOUND/);
    await assert.rejects(receive({ ...event("QA-A",2), propertyId:"another-hotel" }), /SOURCE_MISMATCH/);
    await assert.rejects(receive(event("QA-A",2,{validUntil:new Date(stamp()+3600_000).toISOString()})), /INVALID_EVENT/);
    await assert.rejects(receive(event("QA-A",2,{observedAt:new Date(stamp()+120_000).toISOString()})), /INVALID_EVENT/);
  });
  await test("older events cannot undo clock-out or extend eligibility", async () => {
    await receive(event("QA-A",3,{attendance:"clocked_out"}));
    assert.equal((await receive(event("QA-A",2))).outcome,"ignored_stale_version");
    assert.equal(await status(f.users.housekeeping),"off_duty");
    await assert.rejects(receive(event("QA-A",3)),/VERSION_CONFLICT/);
  });
  await test("leave, break, inactive employment, mismatched departments and expired evidence are ineligible",async()=>{
    let v=4;
    for(const [extra,expected] of [[{attendance:"on_leave"},"on_leave"],[{attendance:"on_break"},"on_break"],[{employmentActive:false},"inactive"],[{department:"maintenance"},"department_mismatch"],
      [{shift:null},"outside_shift"],[{shift:{startsAt:new Date(stamp()-7200_000).toISOString(),endsAt:new Date(stamp()-3600_000).toISOString()}},"outside_shift"],
    ]) {
      await receive(event("QA-A",v++,extra)); assert.equal(await status(f.users.housekeeping),expected);
    }
    const staleUser=(await hotelFixture(db,1)).users.housekeeping;
    await link(staleUser,"QA-STALE");
    await receive(event("QA-STALE",1,{observedAt:new Date(stamp()-1200_000).toISOString(),validUntil:new Date(stamp()-600_000).toISOString()}));
    assert.equal(await status(staleUser),"stale");
    await assert.rejects(receive(event("QA-A",100,{observedAt:new Date(stamp()-120_000).toISOString()})),/INVALID_OBSERVATION_ORDER/);
    await receive(event("QA-A",v++));
    await q("update user_accounts set active=false where id=$1",[f.users.housekeeping]); assert.equal(await status(f.users.housekeeping),"inactive");
    await q("update user_accounts set active=true where id=$1",[f.users.housekeeping]);
    await receive(event("QA-A",v++,{attendance:"clocked_out"}));
  });
  let queued;
  await test("no eligible staff leaves checkout pending and fresh clock-in assigns backlog",async()=>{
    await config(true,c.version); queued=await insertTask(f.rooms[0]);
    assert.equal((await one("select status from housekeeping_tasks where id=$1",[queued])).status,"pending");
    await receive(event("QA-A",30));
    assert.equal((await one("select assigned_user_id from housekeeping_tasks where id=$1",[queued])).assigned_user_id,f.users.housekeeping);
    assert.equal((await one("select assignment_method from housekeeping_task_assignments where task_id=$1",[queued])).assignment_method,"workforce_auto");
    const audit=await one("select after_data from audit_logs where action='housekeeping_workforce_auto_assign' and entity_id=$1",[queued]);
    assert.equal(audit.after_data.workloadBefore,0); assert.equal(audit.after_data.sourceVersion,30);
  });
  await test("lowest unfinished workload wins and only checkout tasks are automatic",async()=>{
    await receive(event("QA-B",1));
    const task=await insertTask(f.rooms[1]); assert.equal((await one("select assigned_user_id from housekeeping_tasks where id=$1",[task])).assigned_user_id,second);
    const manual=await insertTask(f.rooms[2],db,{source:"manual"}); assert.equal((await one("select assigned_user_id from housekeeping_tasks where id=$1",[manual])).assigned_user_id,null);
  });
  await test("concurrent automatic checkouts balance tied staff without duplicate histories",async()=>{
    const ids=await Promise.all([insertTask(f.rooms[0]),insertTask(f.rooms[1],peer)]);
    const assigned=await q("select assigned_user_id from housekeeping_tasks where id=any($1)",[ids]);
    assert.equal(new Set(assigned.map(r=>r.assigned_user_id)).size,2);
    assert.equal(Number((await one("select count(*) n from housekeeping_task_assignments where task_id=any($1)",[ids])).n),2);
    const retry=event("QA-A",31); await receive(retry); await receive(retry);
    assert.equal(Number((await one("select count(*) n from housekeeping_task_assignments where task_id=any($1)",[ids])).n),2);
  });
  await test("random tie picks remain inside the minimum-workload eligible pool",async()=>{
    const tasks=[];
    for(let i=0;i<12;i++) tasks.push(await insertTask(f.rooms[0]));
    const loads=await q("select assigned_user_id,count(*)::int n from housekeeping_tasks where id=any($1) group by assigned_user_id",[tasks]);
    assert.equal(loads.length,2); assert.ok(loads.every(l=>l.n===6));
  });
  await test("checkout through inspection preserves room-readiness safeguards",async()=>{
    const flow=await hotelFixture(db,1); const room=flow.rooms[0];
    const reservation=(await one("insert into reservations(guest_id,user_id,guest_name,room_id,room_number,room_type,check_in,check_out,status,total) values($1,$2,'QA Guest',$3,$4,$5,hotel_today()-1,hotel_today()+1,'checked_in',0) returning id",[flow.guest,flow.users.guest,room.id,room.number,flow.type])).id;
    await q("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'QA Guest',0,0,0,'paid')",[reservation]);
    await q("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,hotel_today()-1,hotel_today()+1,'active')",[reservation,room.id]);
    await q("update rooms set status='occupied' where id=$1",[room.id]); await q("update hotel_operational_policies set housekeeping_inspection_required=true where key='default'");
    await call("front_desk_checkout",{p_reservation_id:reservation,p_staff_user_id:flow.users.front_desk});
    const t=await one("select * from housekeeping_tasks where source_type='checkout' and source_id=$1",[reservation]);
    assert.equal(t.status,"assigned"); assert.ok(t.assigned_user_id);
    assert.equal((await one("select housekeeping from rooms where id=$1",[room.id])).housekeeping,"dirty");
    await call("housekeeping_start_task",{p_task_id:t.id,p_staff_user_id:t.assigned_user_id});
    await call("housekeeping_complete_task",{p_task_id:t.id,p_checklist:{bed_and_linen:true,bathroom:true,amenities:true,safety_check:true},p_notes:"QA cleaned",p_staff_user_id:t.assigned_user_id});
    assert.equal((await one("select housekeeping from rooms where id=$1",[room.id])).housekeeping,"inspection");
    await call("housekeeping_inspect_task",{p_task_id:t.id,p_result:"passed",p_reason:null,p_idempotency_key:randomUUID(),p_staff_user_id:t.assigned_user_id});
    const state=await one("select status,housekeeping from rooms where id=$1",[room.id]); assert.equal(state.status,"available"); assert.equal(state.housekeeping,"clean");
  });
  await test("staff can read only own evidence and cannot write integration state",async()=>{
    const own=await call("hotel_workforce_snapshot",{p_actor:f.users.housekeeping}); assert.equal(own.staff.length,1); assert.equal(own.canManage,false);
    const manager=await call("hotel_workforce_snapshot",{p_actor:f.users.manager}); assert.ok(manager.staff.length>1); assert.equal(manager.canManage,false);
    await assert.rejects(call("hotel_workforce_snapshot",{p_actor:f.users.guest}),/FORBIDDEN/);
    const grants=await q("select has_function_privilege('authenticated','hotel_receive_workforce_availability(jsonb)','execute') allowed,has_table_privilege('authenticated','workforce_availability','select') readable");
    assert.equal(grants[0].allowed,false); assert.equal(grants[0].readable,false);
    assert.equal((await one("select has_table_privilege('service_role','workforce_availability','update') allowed")).allowed,false);
  });
  await test("recovery-required accounts and shift-end boundaries never establish eligibility",async()=>{
    await q("update user_accounts set recovery_required=true where id=$1",[f.users.housekeeping]);
    assert.equal(await status(f.users.housekeeping),"inactive");
    await q("update user_accounts set recovery_required=false where id=$1",[f.users.housekeeping]);
    await receive(event("QA-A",40,{shift:{startsAt:new Date(stamp()-3600_000).toISOString(),endsAt:new Date(stamp()-1).toISOString()}}));
    assert.equal(await status(f.users.housekeeping),"outside_shift");
    await receive(event("QA-A",41));
  });
  await test("explicit disable preserves evidence but stops automatic checkout assignments",async()=>{
    const current=(await one("select version from workforce_integration_settings")).version;
    await config(false,current);
    const task=await insertTask(f.rooms[0]);
    assert.equal((await one("select assigned_user_id from housekeeping_tasks where id=$1",[task])).assigned_user_id,null);
    await assert.rejects(config(true,current),/SETTINGS_CONFLICT/);
    await assert.rejects(call("hotel_configure_workforce",{p_actor:f.users.owner,p_source:"other-system",p_property:c.property_id,p_auto:false,p_version:current+1,p_reason:"Invalid remapping test"}),/MAPPING_CONFLICT/);
  });
  await test("unlink revokes eligibility and remapping requires fresh evidence",async()=>{
    const l=await one("select id from workforce_employee_links where user_id=$1",[f.users.housekeeping]);
    await call("hotel_link_workforce_employee",{p_actor:f.users.owner,p_user:f.users.housekeeping,p_employee:null,p_link:l.id,p_reason:"Reviewed revoke test"});
    assert.equal(await status(f.users.housekeeping),"unmapped"); await link(f.users.housekeeping,"QA-A");
    assert.equal(await status(f.users.housekeeping),"awaiting_sync"); await receive(first); assert.equal(await status(f.users.housekeeping),"awaiting_sync");
    assert.equal((await receive(event("QA-A",2))).outcome,"ignored_stale_version");
    assert.equal(await status(f.users.housekeeping),"awaiting_sync");
    assert.ok((await one("select count(*)::int n from housekeeping_task_assignments where assigned_user_id=$1",[f.users.housekeeping])).n>0);
  });
  console.log(`PASS ${passed} Workforce PostgreSQL scenarios`);
} finally { await peer.end(); await suite.close(); }
