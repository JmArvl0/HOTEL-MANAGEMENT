// Disposable PostgreSQL behavior checks for the occupant, guest-control,
// discrepancy, merge, and housekeeping migrations. Uses only hotelTestDatabase.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { hotelTestDatabase, hotelFixture, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
let checks = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const call = (name, args) => rpc(db, name, args);
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); };

try {
  const f = await hotelFixture(db, 2);
  const [checkinRoom, discrepancyRoom] = f.rooms;
  const policy = JSON.stringify({ hotelTimezone: "Asia/Manila", checkInTime: "00:00", earlyCheckInAllowed: true, validIdRequired: true });
  const reservation = (await q(`insert into reservations(
    guest_id,user_id,guest_name,room_type,check_in,check_out,guests,status,total,
    identity_status,identity_verified_by,identity_verified_at,operational_policy_snapshot
  ) values($1,$2,'Test guest',$3,hotel_today(),hotel_today()+1,2,'confirmed',200,'verified',$4,now(),$5::jsonb) returning id`,
  [f.guest, f.users.guest, f.type, f.users.front_desk, policy]))[0].id;
  await q("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Test guest',0,0,0,'paid')", [reservation]);
  await q("update hotel_occupant_policy set register_effective_from=hotel_today(),age_effective_from=hotel_today() where key='default'");

  const crmCount = Number((await q("select count(*) n from guests"))[0].n);
  const primary = (await q("select id from reservation_guests where reservation_id=$1 and role='primary' and removed_at is null", [reservation]))[0];
  const party = (await call("hotel_party_update", {
    p_reservation_id: reservation,
    p_members: { completeRegister: true, members: [
      { occupantId: primary.id, guestId: f.guest, name: "Test guest", role: "primary", occupantType: "adult" },
      { name: "Ana Child", role: "accompanying", occupantType: "child" },
    ] },
    p_expected_version: 0, p_key: randomUUID(), p_actor: f.users.front_desk,
  }))[0].hotel_party_update;
  const child = (await q("select id,guest_id,role,full_name,occupant_type from reservation_guests where reservation_id=$1 and full_name='Ana Child' and removed_at is null", [reservation]))[0];
  check("name-only companion is registered without a CRM guest", child?.guest_id === null && Number((await q("select count(*) n from guests"))[0].n) === crmCount);
  check("complete roster is confirmed at its declared count", party.complete === true && party.members.length === 2);

  const minimumAge = Number((await q("select coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18) age"))[0].age);
  const arrival = (await q("select to_char(hotel_today(),'YYYY-MM-DD') as today,to_char(hotel_today()+1,'YYYY-MM-DD') as tomorrow,to_char(hotel_today()-make_interval(years=>$1),'YYYY-MM-DD') as birthday,to_char(hotel_today()-make_interval(years=>$1)+interval '1 day','YYYY-MM-DD') as underage", [minimumAge]))[0];
  const arrivalState = async (id, room) => (await q(`select r.status,r.checked_in_at,r.digital_key_hash,i.balance,rm.status as room_status,rm.housekeeping
    from reservations r join invoices i on i.reservation_id=r.id join rooms rm on rm.id=$2 where r.id=$1`, [id, room]))[0];
  const recordEvidence = async (reservationId, occupantId, evidence, options = {}) => {
    const version = (await q("select party_version from reservations where id=$1", [reservationId]))[0].party_version;
    const result = await call("hotel_occupant_verify_arrival", {
      p_reservation_id: reservationId, p_occupant_id: occupantId, p_date_of_birth: null,
      p_verified_age_years: null, p_nationality: null, p_expected_check_in: arrival.today,
      p_expected_version: version, p_key: randomUUID(), p_actor: f.users.front_desk,
      ...evidence, ...options,
    });
    return result[0].hotel_occupant_verify_arrival;
  };
  const beforeDeniedArrival = await arrivalState(reservation, checkinRoom.id);
  await assert.rejects(call("front_desk_check_in", { p_reservation_id: reservation, p_room_id: checkinRoom.id, p_staff_user_id: f.users.front_desk }), /PRIMARY_AGE_UNVERIFIED/);
  await assert.rejects(recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.birthday }, { p_expected_check_in: arrival.tomorrow }), /AGE_ARRIVAL_DATE_CHANGED/);
  await assert.rejects(recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.birthday }, { p_actor: f.users.manager }), /FORBIDDEN/);
  await assert.rejects(recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.tomorrow }), /INVALID_DATE_OF_BIRTH/);
  await recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.underage });
  await assert.rejects(call("front_desk_check_in", { p_reservation_id: reservation, p_room_id: checkinRoom.id, p_staff_user_id: f.users.front_desk }), /PRIMARY_UNDER_MINIMUM_AGE/);
  assert.deepEqual(await arrivalState(reservation, checkinRoom.id), beforeDeniedArrival);
  const recordedKey = randomUUID();
  const recordedVersion = (await q("select party_version from reservations where id=$1", [reservation]))[0].party_version;
  const verification = { p_key: recordedKey, p_expected_version: recordedVersion };
  const birthdayResult = await recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.birthday }, verification);
  assert.deepEqual(await recordEvidence(reservation, primary.id, { p_date_of_birth: arrival.birthday }, verification), birthdayResult);
  check("DOB passes on the exact minimum-age birthday, and denied arrivals leave state unchanged", birthdayResult.referenceDate === arrival.today);
  const ownerRoster = (await call("hotel_party_read", { p_reservation_id: reservation, p_actor: f.users.owner }))[0].hotel_party_read;
  check("roster exposes verification status without DOB or exact age", ownerRoster.members[0].ageVerified && !("dateOfBirth" in ownerRoster.members[0]) && !("verifiedAgeYears" in ownerRoster.members[0]));
  await call("front_desk_check_in", { p_reservation_id: reservation, p_room_id: checkinRoom.id, p_staff_user_id: f.users.front_desk });
  const emergency = (await call("hotel_occupants_in_house", { p_actor: f.users.front_desk }))[0].hotel_occupants_in_house;
  check("verified primary age gates check-in and emergency list includes name-only occupants", emergency.items.some(item => item.reservationId === reservation && item.occupants.some(person => person.name === "Ana Child" && person.type === "child")));

  const discrepancyReservation = (await q(`insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,guests,status,total)
    values($1,$2,'Test guest',$3,hotel_today()+20,hotel_today()+22,1,'confirmed',200) returning id`, [f.guest, f.users.guest, f.type]))[0].id;
  const eligibleBefore = (await q("select front_desk_room_is_eligible($1,$2) eligible", [discrepancyRoom.id, discrepancyReservation]))[0].eligible;
  const discrepancy = (await call("hotel_room_discrepancy_report", {
    p_room_id: discrepancyRoom.id, p_observed_occupancy: "occupied", p_reason: "Guest belongings observed", p_task_id: null,
    p_key: randomUUID(), p_actor: f.users.housekeeping,
  }))[0].hotel_room_discrepancy_report;
  const discrepancyHandoverId = (await q("select handover_id from room_discrepancies where id=$1", [discrepancy.id]))[0].handover_id;
  await assert.rejects(call("front_desk_assign_room", { p_reservation_id: discrepancyReservation, p_room_id: discrepancyRoom.id, p_reason: "Arrival assignment", p_staff_user_id: f.users.front_desk }), /ROOM_DISCREPANCY_OPEN/);
  const unchangedRoom = (await q("select status,housekeeping from rooms where id=$1", [discrepancyRoom.id]))[0];
  check("open discrepancy blocks assignment without changing room state", eligibleBefore === true && unchangedRoom.status === "available" && unchangedRoom.housekeeping === "clean");
  const investigating = (await call("hotel_room_discrepancy_update", { p_discrepancy_id: discrepancy.id, p_action: "investigate", p_reason: "Review active assignment log", p_version: 1, p_key: randomUUID(), p_actor: f.users.front_desk }))[0].hotel_room_discrepancy_update;
  const resolved = (await call("hotel_room_discrepancy_update", { p_discrepancy_id: discrepancy.id, p_action: "resolve", p_reason: "Room confirmed vacant", p_version: investigating.version, p_key: randomUUID(), p_actor: f.users.front_desk }))[0].hotel_room_discrepancy_update;
  check("discrepancy requires investigation and explicit resolution", resolved.status === "resolved" && (await q("select status from hotel_handovers where id=$1", [discrepancyHandoverId]))[0].status === "resolved");

  const source = (await q("insert into guests(name,email,phone) values($1,$2,$3) returning id", [`Merge Source ${randomUUID().slice(0, 8)}`, `source-${randomUUID()}@example.invalid`, "+639171234567"]))[0].id;
  const survivor = (await q("insert into guests(name,email,phone) values($1,$2,$3) returning id", [`Merge Survivor ${randomUUID().slice(0, 8)}`, `survivor-${randomUUID()}@example.invalid`, "+639189876543"]))[0].id;
  const dnrReservation = (await q(`insert into reservations(guest_id,user_id,guest_name,room_type,check_in,check_out,guests,status,total)
    select $1,$2,g.name,$3,hotel_today()+30,hotel_today()+32,1,'confirmed',200 from guests g where g.id=$1 returning id`, [source, f.users.guest, f.type]))[0].id;
  const flag = (await call("hotel_guest_flag_save", { p_flag_id: null, p_guest_id: source, p_flag_type: "do_not_rent", p_instructions: "Refer to Manager", p_restricted_note: "Identity review required", p_expires_at: null, p_version: 0, p_reason: "Verified security report", p_actor: f.users.manager }))[0].hotel_guest_flag_save;
  const fdFlags = (await call("hotel_guest_flags_read", { p_guest_id: source, p_actor: f.users.front_desk }))[0].hotel_guest_flags_read.items;
  const managerFlags = (await call("hotel_guest_flags_read", { p_guest_id: source, p_actor: f.users.manager }))[0].hotel_guest_flags_read.items;
  check("Front Desk sees DNR instructions without restricted notes", fdFlags[0].flagType === "do_not_rent" && fdFlags[0].restrictedNote === null && managerFlags[0].restrictedNote === "Identity review required");
  check("DNR blocks by default", (await q("select hotel_guest_dnr_blocked(null,$1,'booking') blocked", [source]))[0].blocked === true);
  await call("hotel_guest_flag_override_create", { p_reservation_id: dnrReservation, p_flag_id: flag.id, p_purpose: "booking", p_flag_version: flag.version, p_reason: "Approved one-reservation exception", p_expires_at: new Date(Date.now() + 86_400_000).toISOString(), p_actor: f.users.manager });
  check("DNR override applies only to its reservation and purpose", (await q("select hotel_guest_dnr_blocked($1,$2,'booking') booking,hotel_guest_dnr_blocked($1,$2,'check_in') check_in", [dnrReservation, source]))[0].booking === false && (await q("select hotel_guest_dnr_blocked($1,$2,'check_in') blocked", [dnrReservation, source]))[0].blocked === true);

  const loginPeer = (await q("insert into guests(name,email) values($1,$2) returning id", [`Login merge peer ${randomUUID().slice(0, 8)}`, `peer-${randomUUID()}@example.invalid`]))[0].id;
  const linkedPreview = (await call("hotel_guest_merge_preview", { p_source_id: f.guest, p_survivor_id: loginPeer, p_actor: f.users.manager }))[0].hotel_guest_merge_preview;
  check("login-linked profiles remain ineligible for merge", linkedPreview.canMerge === false);
  const preview = (await call("hotel_guest_merge_preview", { p_source_id: source, p_survivor_id: survivor, p_actor: f.users.manager }))[0].hotel_guest_merge_preview;
  const choices = Object.fromEntries(["name", "first_name", "last_name", "email", "phone", "nationality", "address", "preferences", "special_requests"].map(field => [field, field === "name" ? "source" : "survivor"]));
  const merge = (await call("hotel_guest_profile_merge", { p_source_id: source, p_survivor_id: survivor, p_field_choices: choices, p_reason: "Exact contact and ID evidence reviewed", p_fingerprint: preview.fingerprint, p_key: randomUUID(), p_actor: f.users.manager }))[0].hotel_guest_profile_merge;
  const mergedDnr = (await q("select hotel_guest_dnr_blocked(null,$1,'booking') blocked,hotel_guest_dnr_blocked($2,$1,'booking') overridden,hotel_guest_canonical_id($1) canonical", [source, dnrReservation]))[0];
  const resolvedDnr = (await call("hotel_reservation_dnr_flags", { p_reservation_id: dnrReservation, p_actor: f.users.manager }))[0].hotel_reservation_dnr_flags.items;
  check("reviewed merge retains searchable ID and DNR restrictions", merge.survivorId === survivor && mergedDnr.canonical === survivor && mergedDnr.blocked === true && mergedDnr.overridden === false && resolvedDnr.length === 1);

  await call("hotel_reservation_service_condition_update", { p_reservation_id: reservation, p_action: "set", p_reason: "Guest requested no room service", p_key: randomUUID(), p_actor: f.users.front_desk });
  const declinedTask = (await q(`insert into housekeeping_tasks(room_id,room_number,task,task_type,status,reservation_id)
    values($1,$2,'Stayover service','stayover_cleaning','pending',$3) returning id,version`, [checkinRoom.id, checkinRoom.number, reservation]))[0];
  await call("housekeeping_assign_task", { p_task_id: declinedTask.id, p_assigned_user_id: f.users.housekeeping, p_reason: "Assigned stayover service", p_staff_user_id: f.users.owner });
  await assert.rejects(call("housekeeping_start_task", { p_task_id: declinedTask.id, p_staff_user_id: f.users.housekeeping }), /ROOM_SERVICE_DND/);
  const assignedVersion = (await q("select version from housekeeping_tasks where id=$1", [declinedTask.id]))[0].version;
  await call("hotel_housekeeping_service_outcome", { p_task_id: declinedTask.id, p_outcome: "service_declined", p_note: "Guest declined service", p_version: assignedVersion, p_key: randomUUID(), p_actor: f.users.housekeeping });
  const declined = (await q("select status,service_outcome from housekeeping_tasks where id=$1", [declinedTask.id]))[0];
  check("DND blocks stayover start and service decline does not mark the room clean", declined.status === "deferred" && declined.service_outcome === "service_declined" && (await q("select housekeeping from rooms where id=$1", [checkinRoom.id]))[0].housekeeping === "clean");
  const lateTask = (await q(`insert into housekeeping_tasks(room_id,room_number,task,task_type,status,reservation_id)
    values($1,$2,'Late stayover service','stayover_cleaning','pending',$3) returning id,version`, [checkinRoom.id, checkinRoom.number, reservation]))[0];
  await call("hotel_housekeeping_service_outcome", { p_task_id: lateTask.id, p_outcome: "late_service", p_note: "Guest requested service later", p_version: lateTask.version, p_key: randomUUID(), p_actor: f.users.housekeeping });
  const late = (await q("select status,priority,service_outcome,service_due_at from housekeeping_tasks where id=$1", [lateTask.id]))[0];
  check("late service is prioritized and gets a due time", late.status === "pending" && late.priority === "high" && late.service_outcome === "late_service" && late.service_due_at !== null);
  const beforeMove = (await q("select id from reservation_service_conditions where reservation_id=$1 and status='active'", [reservation]))[0];
  await call("front_desk_change_room", { p_reservation_id: reservation, p_new_room_id: discrepancyRoom.id, p_reason: "Synthetic in-house move with DND", p_staff_user_id: f.users.front_desk });
  const afterMove = (await q(`select r.room_id,r.status,d.id as condition_id from reservations r
    join reservation_service_conditions d on d.reservation_id=r.id and d.status='active' where r.id=$1`, [reservation]))[0];
  check("active DND follows the same checked-in stay across a room move", afterMove?.room_id === discrepancyRoom.id && afterMove.status === "checked_in" && afterMove.condition_id === beforeMove.id);
  const movedTask = (await q(`insert into housekeeping_tasks(room_id,room_number,task,task_type,status,reservation_id)
    values($1,$2,'Stayover in moved room','stayover_cleaning','pending',$3) returning id`, [discrepancyRoom.id, discrepancyRoom.number, reservation]))[0];
  await call("housekeeping_assign_task", { p_task_id: movedTask.id, p_assigned_user_id: f.users.housekeeping, p_reason: "Assigned service in moved room", p_staff_user_id: f.users.owner });
  const movedTaskState = "select t.status,r.housekeeping from housekeeping_tasks t join rooms r on r.id=t.room_id where t.id=$1";
  const beforeStart = await q(movedTaskState, [movedTask.id]);
  await assert.rejects(call("housekeeping_start_task", { p_task_id: movedTask.id, p_staff_user_id: f.users.housekeeping }), /ROOM_SERVICE_DND/);
  assert.deepEqual(await q(movedTaskState, [movedTask.id]), beforeStart);
  check("DND refuses start without advancing the new room's task or housekeeping state", beforeStart[0].status !== "in_progress");
  await call("front_desk_checkout", { p_reservation_id: reservation, p_staff_user_id: f.users.front_desk });
  check("checkout clears DND while preserving its history", (await q("select status,clear_reason from reservation_service_conditions where reservation_id=$1 order by set_at desc limit 1", [reservation]))[0].status === "cleared");

  const expressFixture = await hotelFixture(db, 1);
  const expressRoom = expressFixture.rooms[0];
  const expressReservation = (await q(`insert into reservations(
    guest_id,user_id,guest_name,room_type,check_in,check_out,guests,status,total,room_id,room_number,
    identity_status,identity_verified_by,identity_verified_at,operational_policy_snapshot
  ) values($1,$2,'Test guest',$3,hotel_today(),hotel_today()+2,1,'confirmed',200,$4,$5,'verified',$6,now(),$7)
    returning id`, [expressFixture.guest, expressFixture.users.guest, expressFixture.type, expressRoom.id, expressRoom.number, f.users.front_desk, policy]))[0].id;
  await q("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Express guest',0,0,0,'paid')", [expressReservation]);
  await q("update hotel_occupant_policy set register_effective_from=null,age_effective_from=hotel_today()-1 where key='default'");
  const expressPrimary = (await q("select id from reservation_guests where reservation_id=$1 and role='primary' and removed_at is null", [expressReservation]))[0].id;
  const token = randomBytes(32).toString("hex");
  await q("insert into qr_tokens(token_hash,resource_type,resource_id,purpose) values($1,'reservation',$2,'check_in')", [token, expressReservation]);
  const express = (actor = expressFixture.users.guest) => call("express_qr_self_check_in", { p_qr_token_hash: token, p_user_id: actor });
  const beforeExpress = await arrivalState(expressReservation, expressRoom.id);
  await assert.rejects(express(), /PRIMARY_AGE_UNVERIFIED/);
  await recordEvidence(expressReservation, expressPrimary, { p_verified_age_years: minimumAge });
  await q("update reservations set check_in=check_in-1 where id=$1", [expressReservation]);
  await assert.rejects(express(), /PRIMARY_AGE_UNVERIFIED/);
  await q("update reservations set check_in=hotel_today(),guest_id=$2 where id=$1", [expressReservation, f.guest]);
  await assert.rejects(express(), /PARTY_PRIMARY_REQUIRED/);
  const readiness = (await call("hotel_reservation_readiness", { p_reservation_id: expressReservation, p_actor: f.users.front_desk, p_candidate_room: expressRoom.id }))[0].hotel_reservation_readiness;
  assert.ok(readiness.checkIn.includes("PARTY_PRIMARY_REQUIRED"));
  await assert.rejects(recordEvidence(expressReservation, expressPrimary, { p_verified_age_years: minimumAge }), /PARTY_PRIMARY_REQUIRED/);
  assert.deepEqual(await arrivalState(expressReservation, expressRoom.id), beforeExpress);
  check("Express and readiness reject stale dates and a previous primary guest with age-only enforcement", true);

  const mismatchedParty = (await call("hotel_party_read", { p_reservation_id: expressReservation, p_actor: f.users.front_desk }))[0].hotel_party_read;
  await call("hotel_party_update", {
    p_reservation_id: expressReservation, p_members: { completeRegister: true, members: [
      { occupantId: expressPrimary, guestId: f.guest, name: "Updated primary guest", role: "primary" },
    ] }, p_expected_version: mismatchedParty.version, p_key: randomUUID(), p_actor: f.users.front_desk,
  });
  await assert.rejects(express(), /PRIMARY_AGE_UNVERIFIED/);
  await recordEvidence(expressReservation, expressPrimary, { p_verified_age_years: minimumAge });
  await assert.rejects(express(f.users.guest), /SELF_CHECKIN_FORBIDDEN/);
  await q("update qr_tokens set expires_at=now() where token_hash=$1", [token]);
  await assert.rejects(express(), /SELF_CHECKIN_INVALID_QR/);
  await q("update qr_tokens set expires_at=null,revoked_at=now() where token_hash=$1", [token]);
  await assert.rejects(express(), /SELF_CHECKIN_INVALID_QR/);
  assert.deepEqual(await arrivalState(expressReservation, expressRoom.id), beforeExpress);
  await q("update qr_tokens set revoked_at=null where token_hash=$1", [token]);
  const expressResult = await express();
  check("valid Express QR checks in after verification, while expired, revoked and wrong-owner scans leave state unchanged",
    expressResult[0]?.reservation_id === expressReservation && (await arrivalState(expressReservation, expressRoom.id)).room_status === "occupied");

  const walkInFixture = await hotelFixture(db, 2);
  const [walkInRoom, legacyRoom] = walkInFixture.rooms;
  const walkIn = (await call("front_desk_create_reservation", {
    p_guest_name: "Sample walk-in", p_email: `walk-in-${walkInFixture.tag}@example.invalid`,
    p_phone: "+639171234567", p_room_type: walkInFixture.type, p_check_in: arrival.today,
    p_check_out: arrival.tomorrow, p_guest_count: 1, p_source: "Walk-In",
    p_special_requests: null, p_expected_arrival: "00:00",
    p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk,
  }))[0];
  await call("verify_guest_identity", { p_reservation_id: walkIn.reservation_id, p_staff_user_id: f.users.front_desk });
  await call("hms_collect_payment", {
    p_reservation_id: walkIn.reservation_id, p_amount: Number(walkIn.total), p_method: "card",
    p_reference: "Synthetic walk-in payment", p_idempotency_key: randomUUID(), p_staff_user_id: f.users.front_desk,
  });
  const walkInCheckIn = () => call("front_desk_check_in", {
    p_reservation_id: walkIn.reservation_id, p_room_id: walkInRoom.id, p_staff_user_id: f.users.front_desk,
  });
  await assert.rejects(walkInCheckIn(), /PRIMARY_AGE_UNVERIFIED/);
  const walkInPrimary = (await q("select id from reservation_guests where reservation_id=$1 and role='primary'", [walkIn.reservation_id]))[0].id;
  await recordEvidence(walkIn.reservation_id, walkInPrimary, { p_verified_age_years: minimumAge });
  await walkInCheckIn();
  check("a paid walk-in requires primary age evidence before occupying the room",
    (await arrivalState(walkIn.reservation_id, walkInRoom.id)).status === "checked_in");

  const legacy = (await q(`insert into reservations(guest_id,guest_name,room_type,check_in,check_out,guests,status,total,
    identity_status,identity_verified_by,identity_verified_at,operational_policy_snapshot)
    values($1,'Test guest',$2,hotel_today()-2,hotel_today()+1,1,'confirmed',0,'verified',$3,now(),$4) returning id`,
  [walkInFixture.guest, walkInFixture.type, f.users.front_desk, policy]))[0].id;
  await q("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Test guest',0,0,0,'paid')", [legacy]);
  await call("front_desk_check_in", { p_reservation_id: legacy, p_room_id: legacyRoom.id, p_staff_user_id: f.users.front_desk });
  check("legacy arrivals before the effective date still follow the existing check-in rules",
    (await arrivalState(legacy, legacyRoom.id)).status === "checked_in");

  console.log(JSON.stringify({ checksPassed: checks, scope: "Real SQL on a disposable PostgreSQL clone; hosted database untouched" }));
} finally {
  await suite.close();
}
