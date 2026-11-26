import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hotelFixture, hotelTestDatabase, rpc } from "./hotel-db-test-helpers.mjs";

const suite = await hotelTestDatabase();
const { db } = suite;
try {
  const { users, tag } = await hotelFixture(db, 0);
  const backup = randomUUID();
  await db.query(`insert into user_accounts (id,email,name,role,password_hash,active,account_status)
    values ($1,$2,'Backup Manager','manager','offline-test-placeholder',true,'active')`, [backup, `${tag}-backup@example.invalid`]);

  const call = async (name, args, connection = db) => (await rpc(connection, name, args))[0][name];
  const preview = actor => call("hotel_night_audit_preview", { p_actor: actor });
  const activate = actor => call("hotel_operating_day_activate", { p_actor: actor });
  const owner = { p_actor: users.owner };
  const designation = {
    ...owner, p_primary: users.manager, p_backup: backup, p_version: 0, p_reason: "Coverage rehearsal",
  };

  const initial = await call("hotel_operating_day_coverage", owner);
  assert.deepEqual([initial.primaryId, initial.backupId], [null, null]);
  await assert.rejects(call("hotel_operating_day_coverage", { p_actor: users.manager }), /FORBIDDEN/);
  await assert.rejects(activate(users.manager), /OPERATING_DAY_FORBIDDEN/);
  await assert.rejects(call("hotel_set_operating_day_coverage", { ...designation, p_actor: users.manager }), /FORBIDDEN/);
  await assert.rejects(call("hotel_set_operating_day_coverage", { ...designation, p_backup: users.manager }), /INVALID_DAY_CLOSE_COVERAGE/);
  await assert.rejects(call("hotel_set_operating_day_coverage", { ...designation, p_backup: users.front_desk }), /INVALID_DAY_CLOSE_COVERAGE/);
  const saved = await call("hotel_set_operating_day_coverage", designation);
  assert.deepEqual([saved.primaryId, saved.backupId, saved.version], [users.manager, backup, 1]);
  await assert.rejects(call("hotel_set_operating_day_coverage", designation), /STALE_VERSION/);
  console.log("PASS only Owner can designate two eligible Managers with a versioned, audited change");

  assert.equal((await preview(users.front_desk)).canManage, false);
  assert.equal((await preview(users.accounting)).canManage, true);
  assert.equal((await preview(users.manager)).canManage, true);
  assert.equal((await preview(backup)).canManage, true);
  const activation = await activate(users.manager);
  assert.equal(activation.active, true);
  assert.deepEqual(await activate(backup), activation);

  await db.query("update user_accounts set active=false where id=$1", [backup]);
  await assert.rejects(activate(backup), /OPERATING_DAY_FORBIDDEN/);
  await db.query("update user_accounts set active=true where id=$1", [backup]);
  await db.query("update reservations set status='cancelled' where status in ('pending','confirmed','checked_in')");
  await db.query("update cash_shifts set status='closed',closed_at=coalesce(closed_at,now()),reconciled_at=now()");
  await db.query("select sync_invoice_financials(id) from invoices");
  await db.query("update hotel_operational_policies set operating_date=hotel_today()-2 where key='default'");
  const assessment = await preview(users.manager);
  assert.deepEqual(assessment.blockers, []);
  const attempt = { p_date: assessment.businessDate, p_version: assessment.version, p_key: randomUUID(), p_actor: users.manager };
  const backupAttempt = { ...attempt, p_actor: backup, p_key: randomUUID() };
  await assert.rejects(call("hotel_night_audit_close", { ...attempt, p_actor: users.front_desk }), /OPERATING_DAY_FORBIDDEN/);

  const peer = await suite.connect();
  try {
    const outcomes = await Promise.allSettled([
      call("hotel_night_audit_close", attempt),
      call("hotel_night_audit_close", backupAttempt, peer),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    const winner = outcomes[0].status === "fulfilled" ? attempt : backupAttempt;
    const [receipt] = outcomes.filter(outcome => outcome.status === "fulfilled");
    assert.equal(receipt.value.closed_by, winner.p_actor);
    assert.deepEqual(await call("hotel_night_audit_close", winner), receipt.value);
    const audit = await db.query("select user_id from audit_logs where action='night_audit_close' and entity_id=$1", [attempt.p_date]);
    assert.deepEqual(audit.rows, [{ user_id: winner.p_actor }]);
  } finally {
    await peer.end();
  }
  console.log("PASS designated coverage closes exactly once with attributable replay");

  await call("hotel_set_operating_day_coverage", { ...designation, p_primary: null, p_backup: null, p_version: 1, p_reason: "Revoke rehearsal coverage" });
  assert.equal((await preview(users.manager)).canManage, false);
  assert.equal((await preview(backup)).canManage, false);
  await assert.rejects(activate(backup), /OPERATING_DAY_FORBIDDEN/);
  assert.equal((await preview(users.accounting)).canManage, true);
  const audit = await db.query("select after_data from audit_logs where action='operating_day_coverage_update' and user_id=$1 order by created_at", [users.owner]);
  assert.equal(audit.rows.length, 2);
  assert.equal(audit.rows[1].after_data.reason, "Revoke rehearsal coverage");
  console.log("PASS revocation takes effect while existing Accounting coverage continues");
} finally {
  await suite.close();
}
