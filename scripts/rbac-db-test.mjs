// Uses the disposable loopback cluster and the migration replay fixture.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const { db, connect, close } = await hotelTestDatabase();
try {
  const { tag, users, guest, rooms, type } = await hotelFixture(db);
  for (const role of ["admin", "maintenance"]) {
    users[role] = randomUUID();
    await db.query("insert into user_accounts(id,email,name,role,password_hash) values($1,$2,$3,$4,$5)", [
      users[role], `${tag}-${role}@example.invalid`, `Test ${role}`, role, "offline-test-placeholder",
    ]);
  }
  const stay = async (status) => (await db.query(
    "insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total,room_id,room_number) values($1,$2,'Test guest',$3,current_date+5,current_date+6,$4,100,$5,$6) returning id",
    [guest, users.guest, type, status, rooms[1].id, rooms[1].number],
  )).rows[0].id;
  const reservation = await stay("confirmed");
  const cancelled = await stay("cancelled");
  const request = async (department, status = "approved") => (await db.query(
    "insert into guest_requests(reservation_id,guest_id,request,department,approval_status) values($1,$2,'Fixture request',$3,$4) returning id",
    [reservation, guest, department, status],
  )).rows[0].id;
  const cleaningRequest = await request("housekeeping");
  const repairRequest = await request("maintenance");
  const pending = await request("housekeeping", "pending");
  const deskRequest = await request("front_desk");

  const file = async (role, action, overrides = {}) => (await rpc(db, "request_manager_approval", {
    p_request_type: action,
    p_related_entity_type: "reservation",
    p_related_entity_id: reservation,
    p_reservation_id: reservation,
    p_guest_request_id: null,
    p_department: role,
    p_severity: "normal",
    p_reason: "Synthetic audit fixture",
    p_requested_action: {},
    p_staff_user_id: users[role],
    ...overrides,
  }))[0].request_manager_approval;
  const approval = async (id) => (await db.query("select * from manager_approval_requests where id=$1", [id])).rows[0];
  const review = (role, id) => rpc(db, "review_manager_approval", {
    p_approval_id: id, p_decision: "reject", p_reason: "Synthetic review", p_expected_version: 1, p_manager_user_id: users[role],
  });
  const dispatch = async (client, role, room) => (await rpc(client, "hotel_dispatch_reclean", {
    p_actor: users[role], p_room_id: room,
  }))[0].hotel_dispatch_reclean;

  for (const role of ["owner", "admin", "manager", "guest"]) {
    await assert.rejects(file(role, "early_check_in"), /HOTEL_FORBIDDEN/);
  }
  for (const role of ["housekeeping", "maintenance", "accounting"]) {
    await assert.rejects(file(role, "early_check_in"), /APPROVAL_REQUEST_FORBIDDEN/);
  }
  const arrival = await file("front_desk", "early_check_in", { p_department: "accounting" });
  assert.equal((await approval(arrival)).department, "front_desk");
  await assert.rejects(review("front_desk", arrival), /FORBIDDEN/);
  await review("manager", arrival);
  assert.equal((await approval(arrival)).status, "rejected");
  const refund = await file("accounting", "refund_exception", { p_reservation_id: cancelled, p_requested_action: { amount: 1 } });
  assert.equal((await approval(refund)).related_entity_id, cancelled);
  await assert.rejects(file("accounting", "guest_escalation", { p_guest_request_id: cleaningRequest }), /APPROVAL_REQUEST_FORBIDDEN/);
  console.log("PASS all eight roles respect exception filing and review grants");

  await assert.rejects(file("maintenance", "guest_escalation", { p_guest_request_id: cleaningRequest }), /GUEST_REQUEST_NOT_FOUND/);
  await assert.rejects(file("housekeeping", "guest_escalation", { p_guest_request_id: pending }), /GUEST_REQUEST_NOT_ESCALATABLE/);
  await assert.rejects(file("housekeeping", "guest_escalation", {
    p_guest_request_id: cleaningRequest, p_reservation_id: cancelled,
  }), /APPROVAL_LINK_MISMATCH/);
  assert.equal((await db.query("select escalation_status from guest_requests where id=$1", [cleaningRequest])).rows[0].escalation_status, "none");
  for (const [role, id] of [["housekeeping", cleaningRequest], ["maintenance", repairRequest], ["front_desk", deskRequest]]) {
    const filed = await file(role, "guest_escalation", {
      p_guest_request_id: id, p_reservation_id: null, p_related_entity_id: "legacy-form-field",
    });
    const row = await approval(filed);
    assert.deepEqual([row.related_entity_type, row.related_entity_id, row.reservation_id, row.department], [
      "guest_request", id, reservation, role,
    ]);
    assert.deepEqual(row.normal_policy_result, {});
  }
  console.log("PASS department, request lifecycle and canonical reservation binding");

  await db.query("update rooms set status='dirty',housekeeping='dirty' where id=$1", [rooms[0].id]);
  for (const role of ["owner", "admin", "housekeeping", "maintenance", "accounting", "guest"]) {
    await assert.rejects(dispatch(db, role, rooms[0].id), /HOTEL_FORBIDDEN/);
  }
  await assert.rejects(dispatch(db, "front_desk", rooms[1].id), /ROOM_RECLEAN_UNAVAILABLE/);
  const concurrent = await connect();
  try {
    const outcomes = await Promise.all([dispatch(db, "front_desk", rooms[0].id), dispatch(concurrent, "manager", rooms[0].id)]);
    assert.equal(outcomes[0].taskId, outcomes[1].taskId);
    assert.deepEqual(outcomes.map(outcome => outcome.created).sort(), [false, true]);
    const { rows } = await db.query("select action,after_data from audit_logs where entity_id=$1", [outcomes[0].taskId]);
    const audit = rows.filter(row => row.action === "housekeeping_reclean_dispatched");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].after_data.roomId, rooms[0].id);
  } finally {
    await concurrent.end();
  }
  await db.query("update user_accounts set account_status='suspended' where id=$1", [users.front_desk]);
  await assert.rejects(dispatch(db, "front_desk", rooms[0].id), /HOTEL_FORBIDDEN/);
  await assert.rejects(file("front_desk", "late_checkout"), /HOTEL_FORBIDDEN/);
  const { rows: grants } = await db.query(`
    select has_function_privilege('anon','public.hotel_dispatch_reclean(uuid,text)','execute') as anon,
           has_function_privilege('authenticated','public.hotel_dispatch_reclean(uuid,text)','execute') as authenticated,
           has_function_privilege('service_role','public.hotel_dispatch_reclean(uuid,text)','execute') as service
  `);
  assert.deepEqual(grants[0], { anon: false, authenticated: false, service: true });
  console.log("PASS reclean permission, concurrency, audit, suspended actor and grants");

  const setRole = (actor, target, role) => rpc(db, "admin_change_user_role", {
    p_target_user_id: users[target], p_role: role, p_reason: "Synthetic role assignment",
    p_expected_version: 1, p_actor_user_id: users[actor],
  });
  await assert.rejects(setRole("manager", "manager", "owner"), /ADMIN_AUTHORITY_REQUIRED/);
  await assert.rejects(setRole("admin", "admin", "owner"), /SELF_ROLE_CHANGE_FORBIDDEN/);
  await assert.rejects(setRole("admin", "housekeeping", "owner"), /PROTECTED_ROLE_FORBIDDEN/);
  await setRole("admin", "maintenance", "accounting");
  const account = (await db.query("select role,auth_version from user_accounts where id=$1", [users.maintenance])).rows[0];
  assert.deepEqual(account, { role: "accounting", auth_version: 2 });
  await assert.rejects(file("maintenance", "guest_escalation", { p_guest_request_id: repairRequest }), /APPROVAL_REQUEST_FORBIDDEN/);
  console.log("PASS protected role changes, self-escalation and immediate permission change");
} finally {
  await close();
}
