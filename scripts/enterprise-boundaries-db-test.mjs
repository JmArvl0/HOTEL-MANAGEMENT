// Tasks 9–11 acceptance against an owned loopback clone, never .env or hosted data.
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {hotelFixture, hotelTestDatabase, rpc} from './hotel-db-test-helpers.mjs';

const suite = await hotelTestDatabase();
const {db} = suite;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
let passed = 0;
const check = (label, condition) => { assert.ok(condition, label); passed++; console.log('PASS ' + label); };
async function rejects(name, args, code) {
  await q('savepoint expected_refusal');
  let error;
  try { await rpc(db, name, args); } catch (caught) { error = caught; }
  finally { await q('rollback to savepoint expected_refusal'); await q('release savepoint expected_refusal'); }
  assert.ok(error?.message.includes(code), `${name}: expected ${code}, got ${error?.message ?? 'success'}`);
  check(`${name} refuses ${code}`, true);
}

try {
  await q('begin');
  const f = await hotelFixture(db, 4);
  for (const role of ['admin', 'maintenance']) {
    f.users[role] = randomUUID();
    await q("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,$3,$4,'offline-test-placeholder',true,'active')",
      [f.users[role], `${f.tag}-${role}@example.invalid`, `Test ${role}`, role]);
  }
  const version = async id => (await q('select auth_version from user_accounts where id=$1', [id]))[0].auth_version;
  const task = (await q("insert into housekeeping_tasks(room_id,room_number,task,task_type,status) values($1,$2,'Access test','room_preparation','pending') returning id", [f.rooms[0].id, f.rooms[0].number]))[0].id;
  await rpc(db, 'housekeeping_assign_task', {p_task_id: task, p_assigned_user_id: f.users.housekeeping, p_reason: 'Initial assignment', p_staff_user_id: f.users.owner});
  const assignedBefore = (await q('select to_jsonb(t) snapshot from housekeeping_tasks t where id=$1', [task]))[0].snapshot;
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.housekeeping, p_status: 'inactive', p_reason: 'Local access withdrawal', p_expected_version: await version(f.users.housekeeping), p_actor_user_id: f.users.admin});
  check('account disable rotates prior session authority', !(await q('select active from user_accounts where id=$1', [f.users.housekeeping]))[0].active && await version(f.users.housekeeping) === 2);
  await rejects('housekeeping_start_task', {p_task_id: task, p_staff_user_id: f.users.housekeeping}, 'HOUSEKEEPING_ACTION_FORBIDDEN');
  await rejects('housekeeping_assign_task', {p_task_id: task, p_assigned_user_id: f.users.housekeeping, p_reason: 'Disabled target', p_staff_user_id: f.users.owner}, 'INVALID_HOUSEKEEPING_ASSIGNEE');
  assert.deepEqual((await q('select to_jsonb(t) snapshot from housekeeping_tasks t where id=$1', [task]))[0].snapshot, assignedBefore);
  check('disable and rejected actions preserve assigned work/history', true);
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.housekeeping, p_status: 'active', p_reason: 'Reviewed local reactivation', p_expected_version: await version(f.users.housekeeping), p_actor_user_id: f.users.admin});
  await rejects('admin_change_user_role', {p_target_user_id: f.users.guest, p_role: 'housekeeping', p_reason: 'Label-only conversion attempt', p_expected_version: await version(f.users.guest), p_actor_user_id: f.users.admin}, 'ROLE_CONVERSION_REQUIRED');
  await rejects('admin_change_user_role', {p_target_user_id: f.users.housekeeping, p_role: 'accounting', p_reason: 'Manager attempted grant', p_expected_version: await version(f.users.housekeeping), p_actor_user_id: f.users.manager}, 'ADMIN_AUTHORITY_REQUIRED');

  const stay = (await q("insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'History guest',$3,hotel_today()+30,hotel_today()+31,'confirmed',100) returning id", [f.guest, f.users.guest, f.type]))[0].id;
  await q("insert into invoices(reservation_id,guest_name,amount,balance,status) values($1,'History guest',100,100,'unpaid')", [stay]);
  const historyBefore = (await q('select to_jsonb(r) snapshot from reservations r where id=$1', [stay]))[0].snapshot;
  const invoicesBefore = await q('select to_jsonb(i) snapshot from invoices i where reservation_id=$1 order by id', [stay]);
  const conversion = {p_target_user_id: f.users.guest, p_expected_email: `${f.tag}-guest@example.invalid`, p_role: 'housekeeping', p_department: 'Housekeeping', p_employee_reference: 'LOCAL-QA', p_reason: 'Reviewed identity conversion', p_expected_version: await version(f.users.guest), p_token_hash: randomBytes(32).toString('hex'), p_expires_at: new Date(Date.now() + 3600000).toISOString(), p_actor_user_id: f.users.admin};
  await rejects('admin_convert_guest_to_staff', conversion, 'GUEST_BUSINESS_HISTORY_CONFLICT');
  await rejects('admin_convert_guest_to_staff_with_history', conversion, 'OWNER_AUTHORITY_REQUIRED');
  await rpc(db, 'admin_convert_guest_to_staff_with_history', {...conversion, p_actor_user_id: f.users.owner});
  const converted = (await q('select active,recovery_required,role,auth_version from user_accounts where id=$1', [f.users.guest]))[0];
  check('Owner conversion creates inactive recovery-required staff with rotated authority', !converted.active && converted.recovery_required && converted.role === 'housekeeping' && converted.auth_version === conversion.p_expected_version + 1);
  assert.deepEqual((await q('select to_jsonb(r) snapshot from reservations r where id=$1', [stay]))[0].snapshot, historyBefore);
  assert.deepEqual(await q('select to_jsonb(i) snapshot from invoices i where reservation_id=$1 order by id', [stay]), invoicesBefore);
  check('conversion preserves linked reservation and invoice snapshots', true);
  check('conversion creates one staff mirror', (await q('select count(*)::int n from staff where user_id=$1', [f.users.guest]))[0].n === 1);
  await rejects('admin_change_account_status', {p_target_user_id: f.users.guest, p_status: 'active', p_reason: 'Skipping recovery', p_expected_version: converted.auth_version, p_actor_user_id: f.users.admin}, 'ACCOUNT_RECOVERY_REQUIRED');

  const item = (await q("insert into inventory(name,category,quantity,unit) values('Access test supply','Amenities',10,'pieces') returning id"))[0].id;
  const movement = {p_actor: f.users.housekeeping, p_key: randomUUID(), p_item: item, p_kind: 'issue', p_quantity: 2, p_expected_updated: null, p_reason: 'Guest service use', p_reference: 'LOCAL-TEST'};
  await rpc(db, 'hms_stock_movement', movement);
  await rpc(db, 'hms_stock_movement', movement);
  check('stock operation retry has one deduction and one movement', Number((await q('select quantity from inventory where id=$1', [item]))[0].quantity) === 8 && (await q('select count(*)::int n from inventory_movements where source_id=$1', [movement.p_key]))[0].n === 1);
  await rejects('hms_stock_movement', {...movement, p_quantity: 3}, 'STOCK_RETRY_CONFLICT');
  await rejects('hms_stock_movement', {...movement, p_actor: f.users.manager, p_key: randomUUID()}, 'STOCK_FORBIDDEN');
  const stockActorVersion = await version(f.users.housekeeping);
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.housekeeping, p_status: 'suspended', p_reason: 'Suspend stock writer', p_expected_version: stockActorVersion, p_actor_user_id: f.users.admin});
  await rejects('hms_stock_movement', {...movement, p_key: randomUUID()}, 'STOCK_FORBIDDEN');
  check('refused stock writers leave balance unchanged', Number((await q('select quantity from inventory where id=$1', [item]))[0].quantity) === 8);
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.housekeeping, p_status: 'active', p_reason: 'Reviewed test reactivation', p_expected_version: await version(f.users.housekeeping), p_actor_user_id: f.users.admin});

  const create = async (room, sourceId = null) => (await rpc(db, 'maintenance_create_work_order', {
    p_room_id: room.id, p_target_type: 'room', p_target_label: room.number, p_category: 'Safety', p_description: 'Confirmed unsafe plumbing or electrical fault', p_priority: 'critical',
    p_reservation_id: null, p_guest_request_id: null, p_source_type: sourceId ? 'repair_follow_up' : 'manual', p_source_id: sourceId,
    p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk,
  }))[0].maintenance_create_work_order;
  const diagnoseArgs = id => ({p_order_id: id, p_diagnosis: 'Local technician confirmed unsafe condition', p_severity: 'critical', p_serviceability_impact: 'blocked', p_serviceability_reason: 'Unsafe until repair verified', p_parts_required: false, p_parts_status: 'none', p_external_service_required: false, p_estimated_completion: null, p_staff_user_id: f.users.maintenance});
  const start = async id => {
    await rpc(db, 'maintenance_assign_work_order', {p_order_id: id, p_assigned_user_id: f.users.maintenance, p_staff_user_id: f.users.maintenance});
    await rpc(db, 'maintenance_start_work_order', {p_order_id: id, p_staff_user_id: f.users.maintenance});
    await rpc(db, 'maintenance_record_diagnosis', diagnoseArgs(id));
  };
  const resolve = async (id, cleanup) => (await rpc(db, 'maintenance_resolve_work_order', {p_order_id: id, p_resolution: 'Repair verified by technician', p_cleanup_required: cleanup, p_staff_user_id: f.users.maintenance}))[0].maintenance_resolve_work_order;
  const room = f.rooms[1];
  const first = await create(room), second = await create(room);
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.maintenance, p_status: 'inactive', p_reason: 'Technician access withdrawal', p_expected_version: await version(f.users.maintenance), p_actor_user_id: f.users.admin});
  await rejects('maintenance_assign_work_order', {p_order_id: first, p_assigned_user_id: f.users.maintenance, p_staff_user_id: f.users.owner}, 'INVALID_MAINTENANCE_ASSIGNEE');
  await rejects('maintenance_start_work_order', {p_order_id: first, p_staff_user_id: f.users.maintenance}, 'MAINTENANCE_ACTION_FORBIDDEN');
  await rpc(db, 'admin_change_account_status', {p_target_user_id: f.users.maintenance, p_status: 'active', p_reason: 'Reviewed technician reactivation', p_expected_version: await version(f.users.maintenance), p_actor_user_id: f.users.admin});
  await start(first); await start(second);
  check('local technical diagnosis blocks sale without external Facilities', (await q('select maintenance_room_is_blocked($1) blocked, room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].blocked && !(await q('select room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].sellable);
  await rejects('maintenance_record_diagnosis', {...diagnoseArgs(first), p_staff_user_id: f.users.front_desk}, 'MAINTENANCE_ACTION_FORBIDDEN');
  await resolve(first, false);
  check('resolving one repair keeps another independent repair block', (await q('select status,housekeeping from rooms where id=$1', [room.id]))[0].status === 'maintenance' && (await q('select maintenance_room_is_blocked($1) blocked', [room.id]))[0].blocked);
  const cleanup = await resolve(second, true);
  check('technical completion creates cleanup and preserves dirty state', Boolean(cleanup.cleanupTaskId) && (await q('select housekeeping from rooms where id=$1', [room.id]))[0].housekeeping === 'dirty');
  const cleanArgs = {p_task_id: cleanup.cleanupTaskId, p_staff_user_id: f.users.housekeeping};
  await rpc(db, 'housekeeping_start_task', cleanArgs);
  await rpc(db, 'housekeeping_complete_task', {...cleanArgs, p_checklist: {}, p_notes: 'Post-repair cleaning'});
  check('cleanup completion waits for Hotel inspection', (await q('select housekeeping from rooms where id=$1', [room.id]))[0].housekeeping === 'inspection' && !(await q('select room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].sellable);
  const reopened = await create(room, second);
  await start(reopened);
  await rejects('maintenance_resolve_work_order', {p_order_id: second, p_resolution: 'Late older completion', p_cleanup_required: false, p_staff_user_id: f.users.maintenance}, 'WORK_ORDER_NOT_RESOLVABLE');
  await rpc(db, 'housekeeping_inspect_task', {...cleanArgs, p_result: 'passed', p_reason: null, p_idempotency_key: randomUUID()});
  check('new linked unsafe incident survives old completion and passed inspection', (await q('select maintenance_room_is_blocked($1) blocked,room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].blocked && !(await q('select room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].sellable);
  await resolve(reopened, false);
  check('room releases only after all technical blocks and inspection clear', (await q('select room_is_sellable($1,hotel_today(),null) sellable', [room.id]))[0].sellable);

  const discrepancy = (await rpc(db, 'hotel_room_discrepancy_report', {p_room_id: room.id, p_observed_occupancy: 'occupied', p_reason: 'Unexpected guest belongings during safety review', p_task_id: null, p_key: randomUUID(), p_actor: f.users.front_desk}))[0].hotel_room_discrepancy_report;
  const anotherRepair = await create(room);
  await start(anotherRepair);
  await resolve(anotherRepair, false);
  check('repair completion cannot clear an independent Hotel discrepancy', (await q('select status from room_discrepancies where id=$1', [discrepancy.id]))[0].status === 'open' && !(await q('select front_desk_room_is_eligible($1,$2) eligible', [room.id, stay]))[0].eligible);
  const investigation = (await rpc(db, 'hotel_room_discrepancy_update', {p_discrepancy_id: discrepancy.id, p_action: 'investigate', p_reason: 'Reviewed current room and reservation state', p_version: 1, p_key: randomUUID(), p_actor: f.users.front_desk}))[0].hotel_room_discrepancy_update;
  await rpc(db, 'hotel_room_discrepancy_update', {p_discrepancy_id: discrepancy.id, p_action: 'resolve', p_reason: 'Room verified vacant with no remaining belongings', p_version: investigation.version, p_key: randomUUID(), p_actor: f.users.front_desk});
  check('Hotel discrepancy needs its own investigation and release', (await q('select front_desk_room_is_eligible($1,$2) eligible', [room.id, stay]))[0].eligible);

  const occupied = f.rooms[2];
  await q("update rooms set status='occupied' where id=$1", [occupied.id]);
  const occupiedOrder = await create(occupied);
  await start(occupiedOrder);
  check('occupied unsafe incident blocks eligibility without falsely checking guest out', (await q('select status from rooms where id=$1', [occupied.id]))[0].status === 'occupied' && (await q('select maintenance_room_is_blocked($1) blocked', [occupied.id]))[0].blocked);
  await resolve(occupiedOrder, true);
  check('occupied repair sends stayover cleanup and retains occupancy', (await q('select status,housekeeping from rooms where id=$1', [occupied.id]))[0].status === 'occupied' && (await q("select task_type from housekeeping_tasks where source_type='maintenance_order' and source_id=$1", [occupiedOrder]))[0].task_type === 'stayover_cleaning');
  const asset = (await q("insert into maintenance_assets(name,category,room_id,service_interval_days,last_serviced_at) values('Real test asset','HVAC',$1,30,hotel_today()-40) returning id", [f.rooms[3].id]))[0].id;
  await rpc(db, 'front_desk_assign_room', {p_reservation_id: stay, p_room_id: f.rooms[3].id, p_reason: 'Sold night for preventive scheduling check', p_staff_user_id: f.users.front_desk});
  const beforeSchedule = (await q('select to_jsonb(r) snapshot from reservations r where id=$1', [stay]))[0].snapshot;
  const assignmentsBefore = await q('select to_jsonb(a) snapshot from reservation_room_assignments a where reservation_id=$1 order by id', [stay]);
  await rpc(db, 'create_asset_work', {p_actor: f.users.manager, p_asset: asset, p_technician: f.users.maintenance});
  check('preventive scheduling alone does not block a room', !(await q('select maintenance_room_is_blocked($1) blocked', [f.rooms[3].id]))[0].blocked && (await q('select status from rooms where id=$1', [f.rooms[3].id]))[0].status === 'available');
  assert.deepEqual((await q('select to_jsonb(r) snapshot from reservations r where id=$1', [stay]))[0].snapshot, beforeSchedule);
  assert.deepEqual(await q('select to_jsonb(a) snapshot from reservation_room_assignments a where reservation_id=$1 order by id', [stay]), assignmentsBefore);
  check('preventive work preserves sold stay dates and status', true);
  const signatures = ['hms_stock_movement(uuid,uuid,text,text,numeric,timestamptz,text,text)', 'maintenance_record_diagnosis(text,text,text,text,text,boolean,text,boolean,timestamptz,uuid)', 'housekeeping_assign_task(text,uuid,text,uuid)'];
  for (const signature of signatures) check('untrusted roles cannot execute ' + signature, !(await q("select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') b", [signature]))[0].a && !(await q("select has_function_privilege('authenticated',$1,'execute') b", [signature]))[0].b);
  console.log(JSON.stringify({checksPassed: passed, scope: 'Tasks 9–11 real PostgreSQL acceptance. Local clone discarded, no hosted writes.'}));
} finally {
  await q('rollback');
  await suite.close();
}
