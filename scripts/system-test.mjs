// Lane A — rollback-safe system test across the 8 access types.
//
//   BEGIN -> in-tx fixtures (role actors + a private room type) -> savepointed
//   RPC assertions -> ROLLBACK always. No data is left behind (attestation at end).
//
// RPC args are introspected from the LIVE schema (identity argument names) and
// invoked positionally with parameter binding, so signature drift never breaks a
// call and expected failures run inside SAVEPOINTs.
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
if (!env.DIRECT_URL) { console.error("DIRECT_URL not set in .env.local"); process.exit(2); }

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 15000, query_timeout: 60000 });
await client.connect();
const q = async (sql, args = []) => (await client.query(sql, args)).rows;

// ---- live signature memo ------------------------------------------------------
const sigMemo = new Map();
async function argList(fn) {
  if (sigMemo.has(fn)) return sigMemo.get(fn);
  const rows = await q(`select pg_get_function_identity_arguments(p.oid) as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`, [fn]);
  const out = [];
  if (rows.length) {
    const raw = rows[0].sig.trim();
    if (raw) {
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of raw) {
        if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth--;
        if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());
      for (const tok of parts) {
        const m = tok.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        out.push(m ? { name: m[1], type: m[2] } : { name: null, type: tok });
      }
    }
  }
  sigMemo.set(fn, out);
  return out;
}
function wireValue(arg, v) {
  if (v === null || v === undefined) return null;
  const t = arg.type;
  if (t.endsWith("[]")) {
    const esc = (Array.isArray(v) ? v : [v]).map((s) => '"' + String(s).replace(/"/g, '\\"') + '"').join(",");
    return "{" + esc + "}";
  }
  if (t === "jsonb" || t === "json") return JSON.stringify(v);
  return v;
}

const results = [];
let section = "";
function sec(name) { section = name; }
function record(role, desc, ok, detail = "") {
  results.push({ role, desc, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${section}] ${role}: ${desc}${detail ? "  -- " + detail : ""}`);
}

async function rpcCall(fn, params) {
  const args = await argList(fn);
  const values = args.map((a) => wireValue(a, a.name ? params[a.name] : null));
  const sp = "sp_" + Math.random().toString(36).slice(2);
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const res = await client.query(`select * from public."${fn}"(${args.map((_, i) => "$" + (i + 1)).join(", ")})`, values);
    await client.query(`RELEASE ${sp}`);
    return { ok: true, rows: res.rows };
  } catch (e) {
    await client.query(`ROLLBACK TO ${sp}`).catch(() => {});
    await client.query(`RELEASE ${sp}`).catch(() => {});
    return { ok: false, error: (e.message || String(e)).replace(/^error:\s*/i, "") };
  }
}

async function expect(role, desc, fn, params, want) {
  const r = await rpcCall(fn, params);
  if (r.ok && want === "OK") { record(role, desc, true); return r; }
  if (want.startsWith("ERR_CONTAINS_")) {
    const needle = want.slice("ERR_CONTAINS_".length);
    if (!r.ok && r.error.includes(needle)) record(role, desc, true, "refused: " + r.error);
    else if (!r.ok) record(role, desc, false, `expected ${needle} error, got: ${r.error}`);
    else record(role, desc, false, `expected ${needle} error but call succeeded`);
    return r;
  }
  if (want === "ERR" && !r.ok) { record(role, desc, true, "refused: " + r.error); return r; }
  if (want === "ERR") { record(role, desc, false, "expected refusal, but call succeeded"); return r; }
  record(role, desc, false, r.error || "call failed");
  return r;
}
const scalar = (r) => (r.ok && r.rows[0] ? Object.values(r.rows[0])[0] : undefined);

// =============================================================================
// FIXTURES (rolled back at the end)
// =============================================================================
await client.query("BEGIN");
const ts = Math.floor(Date.now());
const H = (await q("select to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD') as h"))[0].h;
const d = (n) => { const dt = new Date(H + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
const gid = async () => (await q("select gen_random_uuid() as id"))[0].id;

// deterministic spine: allow early check-in, skip the inspection hand-off
await q(`update hotel_operational_policies
   set early_check_in_allowed = true, housekeeping_inspection_required = false
   where key = 'default'`);

const A = {};
for (const role of ["owner", "admin", "manager", "front_desk", "housekeeping", "maintenance", "accounting", "guest"]) {
  const email = `qa+${role}+${ts}@haven.test`;
  const ins = await q(`insert into user_accounts(email, name, role, password_hash, active, account_status, recovery_required)
     values($1, $2, $3, 'locked-run-set-passwords', true, 'active', false) returning id`, [email, "QA " + role, role]);
  A[role] = ins[0].id;
}
const guestEmail = `qa+guest+${ts}@haven.test`;
const roomTypeName = `QA System Room ${ts}`;
const rn = "QA" + ts;
await q(`insert into room_types(name, description, max_guests, beds, size_sqm, amenities, base_rate, active, version)
   values($1, 'system test', 2, '1 King', 24, '{}', 3000, true, 1)`, [roomTypeName]);
// Physical rooms come from the same audited RPC the Manager UI uses — no raw
// insert, so the fixture proves the create path as a side effect. Rate is
// copied from the type and operational state comes from the column defaults.
for (const suffix of ["-1", "-2"]) {
  await q(`select public.admin_create_room($1, $2, 90, null, null, true, 'system test fixture', $3)`,
    [rn + suffix, roomTypeName, A.manager]);
}
const rm1 = (await q(`select id from rooms where number = $1`, [rn + "-1"]))[0].id;
const rm2 = (await q(`select id from rooms where number = $1`, [rn + "-2"]))[0].id;

// =============================================================================
// GUEST  (far-out booking: deposit -> FD verifies -> requests -> change -> cancel)
//   check_in 20 days out so the cancellation falls in the FULL-refund window.
// =============================================================================
sec("guest");
let holdToken, webRes, depositPaymentId, refundReqId, guestReqId;

{
  const r = await expect("guest", "book a website hold (2 nts @3000, 20 days out, no transport)", "create_booking_hold", {
    p_user_id: A.guest, p_room_type: roomTypeName, p_check_in: d(20), p_check_out: d(22), p_guest_count: 1,
    p_first_name: "QA", p_last_name: "Guest", p_email: guestEmail, p_mobile: "0917000000", p_address: "Manila",
    p_nationality: "PH", p_expected_arrival: "14:00", p_special_requests: "", p_request_options: [], p_transport_lines: [],
  }, "OK");
  holdToken = scalar(r);
}
if (!holdToken) record("guest", "booking hold token obtained", false, "no token returned");
else {
  const r = await expect("guest", "submit deposit proof -> pending reservation", "submit_reservation_deposit", {
    p_token: holdToken, p_user_id: A.guest, p_payment_method: "manual_gcash", p_payment_reference: "QA-" + ts,
  }, "OK");
  if (r.ok && r.rows[0]) {
    webRes = r.rows[0].reservation_id;
    record("guest", "hold priced with a deposit", Number(r.rows[0].deposit_required) > 0, "deposit_required=" + r.rows[0].deposit_required + " status=" + r.rows[0].reservation_status);
  }
}
if (!webRes) record("guest", "website reservation id returned", false, "none");
else {
  const pmt = await q(`select id from payments where reservation_id = $1 and purpose = 'reservation_deposit' order by created_at desc limit 1`, [webRes]);
  depositPaymentId = pmt[0] && pmt[0].id;
  const vr = await expect("accounting", "verify website deposit -> confirmed", "verify_reservation_deposit", {
    p_payment_id: depositPaymentId, p_staff_user_id: A.accounting,
  }, "OK");
  if (vr.ok && vr.rows[0]) record("guest", "reservation confirmed after deposit verified", vr.rows[0].reservation_status === "confirmed", "status=" + vr.rows[0].reservation_status);

  const gr = await expect("guest", "file structured guest request (room_assistance)", "customer_submit_guest_requests", {
    p_user_id: A.guest, p_reservation_id: webRes, p_request_types: ["room_assistance"], p_description: "QA request",
    p_requested_action: {}, p_idempotency_key: await gid(),
  }, "OK");
  if (gr.ok && gr.rows[0]) {
    guestReqId = gr.rows[0].id;
    const g = await q(`select department, request_type, status from guest_requests where id = $1`, [guestReqId]);
    record("guest", "guest request routed to a department", g[0] && g[0].department === "front_desk", JSON.stringify(g[0]));
  }

  const ch = await expect("guest", "self-service modification executes (past 3-day window)", "customer_request_reservation_change", {
    p_user_id: A.guest, p_reservation_id: webRes, p_check_in: d(21), p_check_out: d(23), p_room_type: roomTypeName,
    p_guests: 1, p_special_requests: "", p_reason: "QA date shift", p_idempotency_key: await gid(),
  }, "OK");
  if (ch.ok) {
    const rc = await q(`select status, execution_status from reservation_change_requests where reservation_id = $1 order by created_at desc limit 1`, [webRes]);
    record("guest", "change-request recorded (self-executed or approved)", !!rc[0], JSON.stringify(rc[0]));
  }

  const cx = await expect("guest", "cancel 21 days out -> full-window refund request", "cancel_reservation", {
    p_reservation_id: webRes, p_actor_user_id: A.guest, p_reason: "QA cancel",
  }, "OK");
  if (cx.ok && cx.rows[0]) {
    const row = cx.rows[0];
    refundReqId = row.refund_request_id;
    record("guest", "cancellation eligible at full basis points", row.refund_basis_points === 10000 && Number(row.eligible_refund) === 1800, "bps=" + row.refund_basis_points + " eligible=" + row.eligible_refund);
  }
}

// =============================================================================
// FRONT DESK + MAINTENANCE-availability (interleaved on purpose)
//   walk-in today on RM-1; block RM-2 into maintenance; prove RM-1-in-house +
//   RM-2-maintenance == 0 units; then complete the walk-in lifecycle and heal RM-2.
// =============================================================================
sec("front_desk");
let res2, taskId, mwoId;

{
  const r = await expect("front_desk", "create walk-in reservation (confirmed)", "front_desk_create_reservation", {
    p_guest_name: "QA Walkin", p_email: `qa+fd+${ts}@example.com`, p_phone: "0917000001", p_room_type: roomTypeName,
    p_check_in: d(0), p_check_out: d(2), p_guest_count: 2, p_source: "Walk-In", p_special_requests: "",
    p_expected_arrival: "13:00", p_idempotency_key: await gid(), p_staff_user_id: A.front_desk,
  }, "OK");
  res2 = r.ok && r.rows[0] ? r.rows[0].reservation_id : undefined;
}
if (!res2) record("front_desk", "walk-in reservation id returned", false, "none");
else {
  await expect("front_desk", "assign a room to the walk-in", "front_desk_assign_room", {
    p_reservation_id: res2, p_room_id: rm1, p_reason: "QA", p_staff_user_id: A.front_desk,
  }, "OK");
  await expect("front_desk", "verify guest identity", "verify_guest_identity", {
    p_reservation_id: res2, p_staff_user_id: A.front_desk,
  }, "OK");
  // Cash cannot be collected without an open drawer (record_staff_payment ->
  // CASH_SHIFT_REQUIRED), so the desk opens one exactly as it would on shift.
  await expect("front_desk", "open the cash drawer for the shift", "accounting_open_cash_shift", {
    p_staff_user_id: A.front_desk, p_location: "QA Front Desk", p_opening_amount: 5000,
  }, "OK");
  // walk-ins settle their stay at arrival (check-in enforces a zero folio balance)
  const walkTotal = Number((await q(`select total from reservations where id = $1`, [res2]))[0].total);
  const settle = await expect("front_desk", "collect the stay balance at check-in (pay-at-arrival)", "record_staff_payment", {
    p_reservation_id: res2, p_amount: walkTotal, p_method: "Cash", p_reference: "QA-arrival", p_idempotency_key: await gid(),
    p_staff_user_id: A.front_desk, p_allow_overpayment: false,
  }, "OK");
  if (settle.ok && settle.rows[0]) record("front_desk", "walk-in folio balance now zero", Number(settle.rows[0].balance) === 0, "balance=" + settle.rows[0].balance);
  await expect("front_desk", "check the guest in (RM-1 now in-house)", "front_desk_check_in", {
    p_reservation_id: res2, p_room_id: rm1, p_staff_user_id: A.front_desk,
  }, "OK");

  // --- maintenance: block RM-2 while RM-1 is occupied -----------------------
  sec("maintenance");
  const r = await expect("maintenance", "create a work order on the spare room", "maintenance_create_work_order", {
    p_room_id: rm2, p_target_type: "room", p_target_label: rn + "-2", p_category: "plumbing", p_description: "QA block test",
    p_priority: "high", p_reservation_id: null, p_guest_request_id: null, p_source_type: "manual", p_source_id: "qa",
    p_idempotency_key: await gid(), p_staff_user_id: A.maintenance,
  }, "OK");
  mwoId = scalar(r);
  if (!mwoId) record("maintenance", "work order created", false, "no order id");
  else {
    await expect("maintenance", "assign the work order", "maintenance_assign_work_order", {
      p_order_id: mwoId, p_assigned_user_id: A.maintenance, p_staff_user_id: A.maintenance,
    }, "OK");
    await expect("maintenance", "start the work order", "maintenance_start_work_order", {
      p_order_id: mwoId, p_staff_user_id: A.maintenance,
    }, "OK");
    await expect("maintenance", "diagnose with room-blocking impact", "maintenance_record_diagnosis", {
      p_order_id: mwoId, p_diagnosis: "QA pipe", p_severity: "high", p_serviceability_impact: "blocked",
      p_serviceability_reason: "QA", p_parts_required: false, p_parts_status: "none", p_external_service_required: false,
      p_estimated_completion: null, p_staff_user_id: A.maintenance,
    }, "OK");
    const room = (await q(`select status from rooms where id = $1`, [rm2]))[0];
    record("maintenance", "blocked room leaves sellable inventory", room && room.status === "maintenance", JSON.stringify(room));
  }

  // RM-1 is occupied by an in-house reservation + RM-2 is maintenance-blocked -> 0 units today
  await expect("guest", "booking REFUSED when in-house + maintenance leaves 0 inventory", "create_booking_hold", {
    p_user_id: A.guest, p_room_type: roomTypeName, p_check_in: d(0), p_check_out: d(2), p_guest_count: 1,
    p_first_name: "QA", p_last_name: "Guest", p_email: guestEmail, p_mobile: "0917000000", p_address: "", p_nationality: "PH",
    p_expected_arrival: "14:00", p_special_requests: "", p_request_options: [], p_transport_lines: [],
  }, "ERR_CONTAINS_ROOM_TYPE_UNAVAILABLE");
  sec("front_desk");

  // wrong-role negatives run while the reservation is checked_in with zero balance.
  for (const [label, uid] of [["housekeeping", A.housekeeping], ["maintenance", A.maintenance], ["accounting", A.accounting], ["guest", A.guest]]) {
    await expect(label, "cannot check a guest out", "front_desk_checkout", { p_reservation_id: res2, p_staff_user_id: uid }, "ERR");
  }

  await expect("front_desk", "post a folio charge (minibar 1500)", "post_folio_charge", {
    p_reservation_id: res2, p_description: "QA minibar", p_category: "incidental", p_amount: 1500,
    p_idempotency_key: await gid(), p_staff_user_id: A.front_desk,
  }, "OK");
  await expect("front_desk", "checkout REFUSED while folio balance != 0", "front_desk_checkout", {
    p_reservation_id: res2, p_staff_user_id: A.front_desk,
  }, "ERR_CONTAINS_FOLIO_BALANCE_REQUIRED");
  await expect("front_desk", "record staff payment clears the balance", "record_staff_payment", {
    p_reservation_id: res2, p_amount: 1500, p_method: "Cash", p_reference: "QA-cash", p_idempotency_key: await gid(),
    p_staff_user_id: A.front_desk, p_allow_overpayment: false,
  }, "OK");
  await expect("front_desk", "checkout succeeds once balance is zero", "front_desk_checkout", {
    p_reservation_id: res2, p_staff_user_id: A.front_desk,
  }, "OK");

  const room = (await q(`select housekeeping, status from rooms where id = $1`, [rm1]))[0];
  record("front_desk", "room flips dirty after checkout", room && room.housekeeping === "dirty", JSON.stringify(room));
  const tk = await q(`select id, task_type, status from housekeeping_tasks where room_id = $1 and task_type = 'checkout_cleaning' order by created_at desc limit 1`, [rm1]);
  if (tk[0]) { taskId = tk[0].id; record("front_desk", "checkout_cleaning task auto-created", tk[0].status === "pending", JSON.stringify(tk[0])); }

  // --- maintenance: resolve + heal RM-2 ---------------------------------------
  sec("maintenance");
  if (mwoId) {
    await expect("maintenance", "resolve the work order", "maintenance_resolve_work_order", {
      p_order_id: mwoId, p_resolution: "QA fixed", p_cleanup_required: false, p_staff_user_id: A.maintenance,
    }, "OK");
    await expect("maintenance", "restore the room to sellable state", "maintenance_restore_room_state", {
      p_room_id: rm2,
    }, "OK");
    const room2 = (await q(`select status from rooms where id = $1`, [rm2]))[0];
    record("maintenance", "room sellable again after restore", room2 && (room2.status === "available" || room2.status === "dirty"), JSON.stringify(room2));
  }
  sec("front_desk");
}

// =============================================================================
// HOUSEKEEPING  (turnover task lifecycle on RM-1)
// =============================================================================
sec("housekeeping");
if (taskId) {
  await expect("housekeeping", "assign the turnover task", "housekeeping_assign_task", {
    p_task_id: taskId, p_assigned_user_id: A.housekeeping, p_reason: "QA", p_staff_user_id: A.housekeeping,
  }, "OK");
  await expect("housekeeping", "start the task", "housekeeping_start_task", {
    p_task_id: taskId, p_staff_user_id: A.housekeeping,
  }, "OK");
  await expect("housekeeping", "complete the task", "housekeeping_complete_task", {
    p_task_id: taskId, p_checklist: {}, p_notes: "QA", p_staff_user_id: A.housekeeping,
  }, "OK");
  const room = (await q(`select housekeeping, status from rooms where id = $1`, [rm1]))[0];
  record("housekeeping", "room returns clean (inspection not required)", room && room.housekeeping === "clean", JSON.stringify(room));
} else {
  record("housekeeping", "turnover task existed to run lifecycle on", false, "no task auto-created");
}

// =============================================================================
// HOUSEKEEPING INSPECTION  (policy-required pass/fail cycle on RM-1)
//   The main lane runs with inspections off; this lane flips the policy back on
//   (as Owner, through the same audited policy RPC) and walks a full second
//   checkout through: complete -> pending inspection -> NOT sellable same-day
//   -> failed inspection creates a reclean child -> reclean completes ->
//   inspection passes -> sellable + housekeeping_room_ready audit. Room-state
//   guard negatives for non-housekeeping roles are exercised too.
// =============================================================================
sec("housekeeping inspection");
{
  // another walk-in, same day, paid at arrival like the first one
  const r = await expect("front_desk", "create a second walk-in for the inspection cycle", "front_desk_create_reservation", {
    p_guest_name: "QA Inspect", p_email: `qa+insp+${ts}@example.com`, p_phone: "0917000003", p_room_type: roomTypeName,
    p_check_in: d(0), p_check_out: d(1), p_guest_count: 1, p_source: "Walk-In", p_special_requests: "",
    p_expected_arrival: "13:00", p_idempotency_key: await gid(), p_staff_user_id: A.front_desk,
  }, "OK");
  const res3 = r.ok && r.rows[0] ? r.rows[0].reservation_id : undefined;
  if (!res3) record("front_desk", "inspection-cycle reservation created", false, "no id");
  else {
    await expect("front_desk", "assign RM-1 to the inspection walk-in", "front_desk_assign_room", {
      p_reservation_id: res3, p_room_id: rm1, p_reason: "QA", p_staff_user_id: A.front_desk,
    }, "OK");
    await expect("front_desk", "verify the inspection guest's identity", "verify_guest_identity", {
      p_reservation_id: res3, p_staff_user_id: A.front_desk,
    }, "OK");
    const total = Number((await q(`select total from reservations where id = $1`, [res3]))[0].total);
    await expect("front_desk", "collect the inspection stay at arrival", "record_staff_payment", {
      p_reservation_id: res3, p_amount: total, p_method: "Cash", p_reference: "QA-insp", p_idempotency_key: await gid(),
      p_staff_user_id: A.front_desk, p_allow_overpayment: false,
    }, "OK");
    await expect("front_desk", "check the inspection guest in", "front_desk_check_in", {
      p_reservation_id: res3, p_room_id: rm1, p_staff_user_id: A.front_desk,
    }, "OK");
    await expect("front_desk", "check the inspection guest out (room goes dirty again)", "front_desk_checkout", {
      p_reservation_id: res3, p_staff_user_id: A.front_desk,
    }, "OK");

    // Flip the policy ON through the audited Owner RPC, not a raw UPDATE.
    const pol = (await q(`select version from hotel_operational_policies where key = 'default'`))[0];
    await expect("owner", "turn housekeeping inspection back on", "admin_update_operational_policy", {
      p_hotel_timezone: "Asia/Manila", p_check_in_time: "15:00:00", p_check_out_time: "12:00:00", p_no_show_cutoff_time: "23:59:00",
      p_valid_id_required: true, p_minimum_booking_age: 18, p_cancellation_full_refund_days: 14, p_cancellation_partial_refund_days: 7,
      p_cancellation_partial_refund_basis_points: 5000, p_self_service_modification_days: 3, p_early_check_in_allowed: true,
      p_housekeeping_inspection_required: true, p_reason: "QA inspection lane", p_expected_version: pol ? pol.version : 1,
      p_actor_user_id: A.owner,
    }, "OK");

    // Fetch by source, not created_at: the whole run shares one transaction, so
    // both checkout tasks carry the same now() timestamp and a recency sort ties.
    const tk = (await q(`select id from housekeeping_tasks where source_type = 'checkout' and source_id = $1 and task_type = 'checkout_cleaning'`, [res3]))[0];
    if (!tk) record("housekeeping", "second turnover task auto-created", false, "no task");
    else {
      const inspectTask = tk.id;
      await expect("housekeeping", "start the second turnover", "housekeeping_start_task", {
        p_task_id: inspectTask, p_staff_user_id: A.housekeeping,
      }, "OK");
      // Inspecting before completion must be refused (INSPECTION_ALREADY_RECORDED family).
      await expect("housekeeping", "inspect REFUSED before completion", "housekeeping_inspect_task", {
        p_task_id: inspectTask, p_result: "passed", p_reason: null, p_staff_user_id: A.housekeeping, p_idempotency_key: await gid(),
      }, "ERR_CONTAINS_INSPECTION_ALREADY_RECORDED");
      await expect("housekeeping", "complete the second turnover (room awaits inspection)", "housekeeping_complete_task", {
        p_task_id: inspectTask, p_checklist: {}, p_notes: "QA", p_staff_user_id: A.housekeeping,
      }, "OK");
      const roomMid = (await q(`select housekeeping, status from rooms where id = $1`, [rm1]))[0];
      const taskMid = (await q(`select inspection_status from housekeeping_tasks where id = $1`, [inspectTask]))[0];
      record("housekeeping", "cleaned room parked at inspection, not clean", roomMid && roomMid.housekeeping === "inspection" && taskMid && taskMid.inspection_status === "pending", JSON.stringify({ room: roomMid, task: taskMid }));
      const sellable = (await q(`select public.room_is_sellable($1, now()::date, null) as ok`, [rm1]))[0];
      record("housekeeping", "inspection-pending room is NOT sellable same-day", sellable && sellable.ok === false, JSON.stringify(sellable));

      // Non-housekeeping roles must never record an inspection.
      for (const [rl, uid] of [["manager", A.manager], ["front_desk", A.front_desk], ["maintenance", A.maintenance]]) {
        await expect(rl, `${rl} cannot inspect a room`, "housekeeping_inspect_task", {
          p_task_id: inspectTask, p_result: "passed", p_reason: null, p_staff_user_id: uid, p_idempotency_key: await gid(),
        }, "ERR_CONTAINS_HOUSEKEEPING_INSPECTION_FORBIDDEN");
      }

      // FAIL: reason required, reclean child created, room stays out of inventory.
      await expect("housekeeping", "failed inspection requires a reason", "housekeeping_inspect_task", {
        p_task_id: inspectTask, p_result: "failed", p_reason: null, p_staff_user_id: A.housekeeping, p_idempotency_key: await gid(),
      }, "ERR");
      await expect("housekeeping", "fail the inspection (reclean required)", "housekeeping_inspect_task", {
        p_task_id: inspectTask, p_result: "failed", p_reason: "QA dust on headboard", p_staff_user_id: A.housekeeping, p_idempotency_key: await gid(),
      }, "OK");
      const afterFail = (await q(`select housekeeping, status from rooms where id = $1`, [rm1]))[0];
      const failedTask = (await q(`select inspection_status, inspection_reason from housekeeping_tasks where id = $1`, [inspectTask]))[0];
      const child = (await q(`select id, task_type, status from housekeeping_tasks where parent_task_id = $1`, [inspectTask]))[0];
      record("housekeeping", "failed inspection keeps the room out of availability", afterFail && afterFail.housekeeping === "reclean_required" && afterFail.status === "dirty", JSON.stringify(afterFail));
      record("housekeeping", "failure recorded on the original task, history intact", failedTask && failedTask.inspection_status === "failed" && /dust/i.test(String(failedTask.inspection_reason)), JSON.stringify(failedTask));
      record("housekeeping", "reclean child task created", child && child.task_type === "reclean" && child.status === "pending", JSON.stringify(child));

      // Re-inspecting the already-recorded task must be refused.
      await expect("housekeeping", "double inspection REFUSED", "housekeeping_inspect_task", {
        p_task_id: inspectTask, p_result: "passed", p_reason: null, p_staff_user_id: A.housekeeping, p_idempotency_key: await gid(),
      }, "ERR_CONTAINS_INSPECTION_ALREADY_RECORDED");

      // Reclean -> PASS -> sellable + ready audit.
      if (child) {
        await expect("housekeeping", "start the reclean task", "housekeeping_start_task", {
          p_task_id: child.id, p_staff_user_id: A.housekeeping,
        }, "OK");
        await expect("housekeeping", "complete the reclean (awaiting re-inspection)", "housekeeping_complete_task", {
          p_task_id: child.id, p_checklist: {}, p_notes: "QA reclean", p_staff_user_id: A.housekeeping,
        }, "OK");
        await expect("housekeeping", "pass the re-inspection", "housekeeping_inspect_task", {
          p_task_id: child.id, p_result: "passed", p_reason: null, p_staff_user_id: A.housekeeping, p_idempotency_key: await gid(),
        }, "OK");
        const afterPass = (await q(`select housekeeping, status from rooms where id = $1`, [rm1]))[0];
        const readyAudit = (await q(`select count(*)::int n from audit_logs where action = 'housekeeping_room_ready' and entity_type = 'room' and entity_id = $1`, [rm1]))[0];
        const sellable2 = (await q(`select public.room_is_sellable($1, now()::date, null) as ok`, [rm1]))[0];
        record("housekeeping", "passed inspection makes the room clean and sellable", afterPass && afterPass.housekeeping === "clean" && afterPass.status === "available" && sellable2 && sellable2.ok === true, JSON.stringify({ room: afterPass, sellable: sellable2 }));
        record("housekeeping", "housekeeping_room_ready audit recorded", readyAudit && readyAudit.n >= 1, readyAudit ? readyAudit.n + " rows" : "none");
      } else {
        record("housekeeping", "reclean child existed to complete", false, "no child task");
      }
    }
  }
}

// =============================================================================
// ACCOUNTING  (settled-payment immutability FIRST, then refund processing)
// =============================================================================
sec("accounting");
if (!depositPaymentId) record("accounting", "settled deposit payment existed to test", false, "no deposit payment");
else {
  // (a) economic-field mutation on a paid payment must be refused
  const sp = "sp_" + Math.random().toString(36).slice(2);
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(`update payments set amount = amount + 1 where id = $1`, [depositPaymentId]);
    await client.query(`RELEASE ${sp}`);
    record("accounting", "settled (paid) payment economic fields are DB-immutable", false, "amount mutation succeeded");
  } catch (e) {
    await client.query(`ROLLBACK TO ${sp}`).catch(() => {});
    record("accounting", "settled (paid) payment economic fields are DB-immutable", /SETTLED_PAYMENT_IMMUTABLE/i.test(e.message), (e.message || "").slice(0, 140));
  }
  // (b) deleting a paid payment must be refused
  const sp2 = "sp_" + Math.random().toString(36).slice(2);
  await client.query(`SAVEPOINT ${sp2}`);
  try {
    await client.query(`delete from payments where id = $1`, [depositPaymentId]);
    await client.query(`RELEASE ${sp2}`);
    record("accounting", "settled (paid) payment cannot be deleted", false, "delete succeeded");
  } catch (e) {
    await client.query(`ROLLBACK TO ${sp2}`).catch(() => {});
    record("accounting", "settled (paid) payment cannot be deleted", /SETTLED_PAYMENT_IMMUTABLE/i.test(e.message), (e.message || "").slice(0, 140));
  }
  // (c) a paid payment's status column is now guarded too (migration 20260905020000):
  //     direct UPDATE paid -> failed must raise SETTLED_PAYMENT_IMMUTABLE
  const sp3 = "sp_" + Math.random().toString(36).slice(2);
  await client.query(`SAVEPOINT ${sp3}`);
  try {
    await client.query(`update payments set status = 'failed' where id = $1`, [depositPaymentId]);
    await client.query(`ROLLBACK TO ${sp3}`);
    record("accounting", "settled (paid) payment status is DB-immutable (paid -> failed refused)", false, "status mutation succeeded");
  } catch (e) {
    await client.query(`ROLLBACK TO ${sp3}`).catch(() => {});
    record("accounting", "settled (paid) payment status is DB-immutable (paid -> failed refused)", /SETTLED_PAYMENT_IMMUTABLE/i.test(e.message), (e.message || "").slice(0, 120));
  }
}
if (!refundReqId) record("accounting", "refund request existed to process", false, "guest cancellation produced none");
else {
  await expect("guest", "guest cannot process a refund", "process_refund", { p_refund_id: refundReqId, p_staff_user_id: A.guest, p_reference: "no" }, "ERR");
  await expect("front_desk", "front desk cannot process a refund", "process_refund", { p_refund_id: refundReqId, p_staff_user_id: A.front_desk, p_reference: "no" }, "ERR");
  await expect("manager", "manager cannot process a refund", "process_refund", { p_refund_id: refundReqId, p_staff_user_id: A.manager, p_reference: "no" }, "ERR");
  const pr = await expect("accounting", "process the eligible refund", "process_refund", {
    p_refund_id: refundReqId, p_staff_user_id: A.accounting, p_reference: "QA-refund",
  }, "OK");
  if (pr.ok && pr.rows[0]) record("accounting", "refunded exactly the eligible amount", Number(pr.rows[0].refund_amount) === 1800, "amount=" + pr.rows[0].refund_amount + " status=" + pr.rows[0].refund_status);
}

// =============================================================================
// MANAGER  (guest-request escalation filed by front desk -> manager reviews)
// =============================================================================
sec("manager");
if (guestReqId) {
  const req = await expect("front_desk", "escalate a guest request for manager approval", "request_manager_approval", {
    p_request_type: "guest_escalation", p_related_entity_type: "guest_request", p_related_entity_id: String(guestReqId),
    p_reservation_id: webRes, p_guest_request_id: guestReqId, p_department: "front_desk", p_severity: "normal",
    p_reason: "QA escalation", p_requested_action: { requestedResolution: "Manager coordination" }, p_staff_user_id: A.front_desk,
  }, "OK");
  let approvalId = null;
  if (req.ok) approvalId = scalar(req);
  if (approvalId) {
    const es = (await q(`select escalation_status from guest_requests where id = $1`, [guestReqId]))[0];
    record("manager", "guest request marked escalated", es && es.escalation_status === "escalated", JSON.stringify(es));
    await expect("manager", "manager reviews & approves the escalation", "review_manager_approval", {
      p_approval_id: approvalId, p_decision: "approve", p_reason: "QA ok", p_expected_version: 1, p_manager_user_id: A.manager,
    }, "OK");
    const st = (await q(`select status, execution_status from manager_approval_requests where id = $1`, [approvalId]))[0];
    record("manager", "approval stamped approved", st && st.status === "approved", JSON.stringify(st));
  } else {
    record("manager", "approval request returned an id", false, req.error || "no approval id");
  }
} else {
  record("manager", "guest request existed to escalate", false, "none from the guest flow");
}

// =============================================================================
// FRONT DESK DAILY OPERATIONS REPORT  (front desk submits -> manager returns
// -> front desk resubmits -> manager acknowledges; RBAC + guards exercised)
// =============================================================================
sec("daily reports");
{
  const snap = { reportDate: H, generatedAt: new Date().toISOString(), reservations: { created: 0, arrivals: 0, departures: 0, cancelled: 0, noShow: 0, bySource: {} }, guestRequests: { opened: 0, escalated: 0, openByDepartment: {} }, collections: { count: 0, total: 0, byPurpose: {} }, rooms: {}, transportation: {}, approvals: {} };
  await expect("manager", "manager cannot submit the daily report", "submit_front_desk_report", {
    p_report_date: H, p_snapshot: snap, p_supersedes: null, p_staff_user_id: A.manager,
  }, "ERR_CONTAINS_REPORT_SUBMIT_FORBIDDEN");
  const submitted = await expect("front_desk", "front desk submits the daily operations report", "submit_front_desk_report", {
    p_report_date: H, p_snapshot: snap, p_supersedes: null, p_staff_user_id: A.front_desk,
  }, "OK");
  const reportId = submitted.ok ? scalar(submitted).id : null;
  if (reportId) {
    await expect("front_desk", "cannot double-submit the same hotel day", "submit_front_desk_report", {
      p_report_date: H, p_snapshot: snap, p_supersedes: null, p_staff_user_id: A.front_desk,
    }, "ERR_CONTAINS_front_desk_reports_one_live_per_date");
    await expect("front_desk", "front desk cannot review reports", "review_front_desk_report", {
      p_report_id: reportId, p_decision: "acknowledge", p_note: "x", p_expected_version: 1, p_manager_user_id: A.front_desk,
    }, "ERR_CONTAINS_REPORT_REVIEW_FORBIDDEN");
    await expect("manager", "review is version-guarded", "review_front_desk_report", {
      p_report_id: reportId, p_decision: "acknowledge", p_note: "x", p_expected_version: 99, p_manager_user_id: A.manager,
    }, "ERR_CONTAINS_REPORT_ALREADY_REVIEWED");
    await expect("manager", "returning requires a note", "review_front_desk_report", {
      p_report_id: reportId, p_decision: "return", p_note: "", p_expected_version: 1, p_manager_user_id: A.manager,
    }, "ERR_CONTAINS_REPORT_NOTE_REQUIRED");
    await expect("manager", "manager returns the report with a note", "review_front_desk_report", {
      p_report_id: reportId, p_decision: "return", p_note: "QA: add transportation counts", p_expected_version: 1, p_manager_user_id: A.manager,
    }, "OK");
    const resubmitted = await expect("front_desk", "front desk resubmits the returned report", "submit_front_desk_report", {
      p_report_date: H, p_snapshot: snap, p_supersedes: reportId, p_staff_user_id: A.front_desk,
    }, "OK");
    const resubId = resubmitted.ok ? scalar(resubmitted).id : null;
    if (resubId) {
      await expect("manager", "manager acknowledges the resubmission", "review_front_desk_report", {
        p_report_id: resubId, p_decision: "acknowledge", p_note: "", p_expected_version: 1, p_manager_user_id: A.manager,
      }, "OK");
      const rows = await q(`select status, supersedes, version from front_desk_reports where id = any($1) order by submitted_at`, [[reportId, resubId]]);
      record("daily reports", "lineage recorded: returned original + acknowledged resubmission",
        rows.length === 2 && rows[0].status === "returned" && rows[1].status === "acknowledged" && String(rows[1].supersedes) === String(reportId),
        JSON.stringify(rows));
    } else {
      record("front_desk", "resubmission returned an id", false, resubmitted.error || "no id");
    }
  } else {
    record("front_desk", "submission returned an id", false, submitted.error || "no id");
  }
}

// =============================================================================
// ADMIN / OWNER  governance
// =============================================================================
sec("admin");
{
  const created = await expect("admin", "create a staff account (inactive + recovery)", "admin_create_staff", {
    p_name: "QA Staff", p_email: `qa+staff+${ts}@haven.test`, p_phone: "0917000002", p_department: "housekeeping",
    p_employee_reference: "QA-STF", p_role: "housekeeping", p_reason: "QA", p_idempotency_key: await gid(), p_actor_user_id: A.admin,
  }, "OK");
  const staffId = scalar(created);
  if (staffId) {
    const s = (await q(`select account_status, active, recovery_required from user_accounts where id = $1`, [staffId]))[0];
    record("admin", "created staff is inactive & recovery-required", s && s.active === false && s.recovery_required === true, JSON.stringify(s));
  }

  const ownerRow = (await q(`select id from user_accounts where role = 'owner' and active order by created_at limit 1`))[0];
  if (ownerRow) {
    await expect("admin", "cannot deactivate an owner account", "admin_change_account_status", {
      p_target_user_id: ownerRow.id, p_status: "inactive", p_reason: "QA", p_expected_version: 1, p_actor_user_id: A.admin,
    }, "ERR");
    await expect("admin", "cannot change an owner's role", "admin_change_user_role", {
      p_target_user_id: ownerRow.id, p_role: "front_desk", p_reason: "QA", p_expected_version: 1, p_actor_user_id: A.admin,
    }, "ERR");
  }

  const pol = (await q(`select version from hotel_operational_policies where key = 'default'`))[0];
  const base = {
    p_hotel_timezone: "Asia/Tokyo", p_check_in_time: "15:00:00", p_check_out_time: "12:00:00", p_no_show_cutoff_time: "23:59:00",
    p_valid_id_required: true, p_minimum_booking_age: 18, p_cancellation_full_refund_days: 14, p_cancellation_partial_refund_days: 7,
    p_cancellation_partial_refund_basis_points: 5000, p_self_service_modification_days: 3, p_early_check_in_allowed: true,
    p_housekeeping_inspection_required: false, p_reason: "QA", p_expected_version: pol ? pol.version : 1,
  };
  await expect("admin", "admin cannot change the hotel timezone", "admin_update_operational_policy", { ...base, p_actor_user_id: A.admin }, "ERR");
  await expect("owner", "owner CAN change the hotel timezone", "admin_update_operational_policy", { ...base, p_actor_user_id: A.owner }, "OK");
}

// =============================================================================
// ROOM-TYPE GOVERNANCE  (manager creates + proposes rates; owner/admin decide)
// =============================================================================
sec("room types");
{
  const govName = `QA Gov Room ${ts}`;
  // Front desk has no catalog authority at all.
  await expect("front_desk", "front desk cannot create room types", "admin_create_room_type", {
    p_name: govName, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: [], p_base_rate: 5000, p_active: true, p_reason: "QA", p_actor_user_id: A.front_desk,
  }, "ERR_CONTAINS_ADMIN_AUTHORITY_REQUIRED");
  await expect("front_desk", "front desk cannot propose rates", "admin_propose_room_type_rate", {
    p_room_type_id: (await q(`select id from room_types where name = $1`, [roomTypeName]))[0].id,
    p_rate: 4000, p_reason: "QA", p_expected_version: 1, p_actor_user_id: A.front_desk,
  }, "ERR_CONTAINS_MANAGER_AUTHORITY_REQUIRED");

  // Manager creation: inactive, rate 0, desired rate filed as pending proposal.
  const created = await expect("manager", "manager creates a room type (inactive + rate proposal)", "admin_create_room_type", {
    p_name: govName, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: ["Wi-Fi"], p_base_rate: 5000, p_active: true, p_reason: "QA", p_photo_urls: [], p_actor_user_id: A.manager,
  }, "OK");
  const govId = scalar(created);
  if (govId) {
    const row = (await q(`select active, base_rate, version from room_types where id = $1`, [govId]))[0];
    record("manager", "manager creation is inactive with rate 0", row.active === false && Number(row.base_rate) === 0, JSON.stringify(row));
    const prop = (await q(`select proposed_rate, status from room_rate_proposals where room_type_id = $1`, [govId]))[0];
    record("manager", "desired rate filed as pending proposal", prop && prop.status === "pending" && Number(prop.proposed_rate) === 5000, JSON.stringify(prop));
    // Manager cannot activate while the initial rate is unapproved (rate still 0).
    await expect("manager", "cannot activate before the rate is approved", "admin_update_room_type", {
      p_room_type_id: govId, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
      p_amenities: ["Wi-Fi"], p_base_rate: 0, p_active: true, p_reason: "QA", p_expected_version: 1, p_actor_user_id: A.manager,
    }, "ERR_CONTAINS_ROOM_TYPE_RATE_REQUIRED");
    // Owner approves the initial rate, then the manager may activate.
    const firstProp = (await q(`select id from room_rate_proposals where room_type_id = $1 and status = 'pending'`, [govId]))[0].id;
    const v1 = (await q(`select version from room_types where id = $1`, [govId]))[0].version;
    await expect("manager", "manager cannot review a rate proposal", "admin_review_room_type_rate_proposal", {
      p_proposal_id: firstProp, p_decision: "approve", p_reason: "QA", p_actor_user_id: A.manager,
    }, "ERR_CONTAINS_ADMIN_AUTHORITY_REQUIRED");
    await expect("admin", "admin approves the initial rate", "admin_review_room_type_rate_proposal", {
      p_proposal_id: firstProp, p_decision: "approve", p_reason: "QA", p_actor_user_id: A.admin,
    }, "OK");
    const rated = (await q(`select base_rate, version, active from room_types where id = $1`, [govId]))[0];
    record("admin", "approved rate written and version bumped", Number(rated.base_rate) === 5000 && rated.version === v1 + 1, JSON.stringify(rated));
    await expect("manager", "manager activates after approval", "admin_update_room_type", {
      p_room_type_id: govId, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
      p_amenities: ["Wi-Fi"], p_base_rate: 5000, p_active: true, p_reason: "QA", p_expected_version: v1 + 1, p_actor_user_id: A.manager,
    }, "OK");
  } else {
    record("manager", "create returned an id", false, "no id");
  }

  // Propose -> guard -> reject on the existing QA type (nonzero rate).
  const qa = (await q(`select id, base_rate, version from room_types where name = $1`, [roomTypeName]))[0];
  await expect("manager", "manager proposes a rate change", "admin_propose_room_type_rate", {
    p_room_type_id: qa.id, p_rate: 4000, p_reason: "QA repricing", p_expected_version: qa.version, p_actor_user_id: A.manager,
  }, "OK");
  const v2 = (await q(`select version from room_types where id = $1`, [qa.id]))[0].version;
  record("manager", "proposal bumps the room-type version", v2 === qa.version + 1, `${qa.version} -> ${v2}`);
  await expect("manager", "same-as-current rate is refused", "admin_propose_room_type_rate", {
    p_room_type_id: qa.id, p_rate: qa.base_rate, p_reason: "QA", p_expected_version: v2, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_RATE_PROPOSAL_SAME_AS_CURRENT");
  await expect("manager", "second concurrent proposal is refused", "admin_propose_room_type_rate", {
    p_room_type_id: qa.id, p_rate: 4500, p_reason: "QA", p_expected_version: v2, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_RATE_PROPOSAL_ALREADY_PENDING");
  await expect("manager", "manager cannot change the rate directly", "admin_update_room_type", {
    p_room_type_id: qa.id, p_description: "system test", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: [], p_base_rate: 4000, p_active: true, p_reason: "QA", p_expected_version: v2, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_RATE_CHANGE_APPROVAL_REQUIRED");
  await expect("manager", "manager cannot activate while a proposal pends", "admin_update_room_type", {
    p_room_type_id: qa.id, p_description: "system test", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: [], p_base_rate: qa.base_rate, p_active: true, p_reason: "QA", p_expected_version: v2, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_RATE_APPROVAL_PENDING");
  const pend = (await q(`select id from room_rate_proposals where room_type_id = $1 and status = 'pending'`, [qa.id]))[0].id;
  await expect("owner", "owner rejects the proposal", "admin_review_room_type_rate_proposal", {
    p_proposal_id: pend, p_decision: "reject", p_reason: "QA no repricing", p_actor_user_id: A.owner,
  }, "OK");
  const kept = (await q(`select base_rate from room_types where id = $1`, [qa.id]))[0];
  record("owner", "rejection leaves the rate untouched", Number(kept.base_rate) === Number(qa.base_rate), JSON.stringify(kept));

  // Owner/Admin can still create and set rates directly.
  await expect("owner", "owner creates an active room type with a direct rate", "admin_create_room_type", {
    p_name: `QA Gov Owner ${ts}`, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: [], p_base_rate: 6000, p_active: true, p_reason: "QA", p_photo_urls: [], p_actor_user_id: A.owner,
  }, "OK");
  await expect("manager", "duplicate room-type name is refused", "admin_create_room_type", {
    p_name: `QA GOV OWNER ${ts}`, p_description: "governance QA", p_max_guests: 2, p_beds: "1 King", p_size_sqm: 24,
    p_amenities: [], p_base_rate: 6000, p_active: false, p_reason: "QA", p_photo_urls: [], p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_TYPE_NAME_TAKEN");
}

// =============================================================================
// PHYSICAL ROOM GOVERNANCE  (manager creates + configures; retype and
// deactivation are guarded by forward commitments; availability agrees)
// =============================================================================
sec("physical rooms");
{
  // Live inventory count as create_booking_hold computes it, i.e. through
  // room_is_sellable — the predicate every booking gate now shares.
  const sellable = async () => (await q(
    `select count(*)::int n from rooms r where r.type = $1 and public.room_is_sellable(r.id, $2::date, null)`,
    [roomTypeName, d(30)]))[0].n;

  await expect("front_desk", "front desk cannot create physical rooms", "admin_create_room", {
    p_number: rn + "-fd", p_type: roomTypeName, p_floor: 91, p_wing: null, p_designation: null,
    p_active: true, p_reason: "QA", p_actor_user_id: A.front_desk,
  }, "ERR_CONTAINS_ADMIN_AUTHORITY_REQUIRED");

  const before = await sellable();
  const made = await expect("manager", "manager creates a physical room", "admin_create_room", {
    p_number: rn + "-3", p_type: roomTypeName, p_floor: 91, p_wing: "QA Wing", p_designation: "Accessible",
    p_active: true, p_reason: "QA new inventory", p_actor_user_id: A.manager,
  }, "OK");
  // admin_create_room returns a jsonb summary, so read the id back by number.
  const newRoom = made.ok ? (await q(`select id from rooms where number = $1`, [rn + "-3"]))[0].id : null;
  const row = newRoom ? (await q(`select rate, status, housekeeping, configuration_version from rooms where number = $1`, [rn + "-3"]))[0] : null;
  record("manager", "rate copied from the room type; operational state left to defaults",
    !!row && Number(row.rate) === 3000 && row.status === "available" && row.housekeeping === "clean" && row.configuration_version === 1, JSON.stringify(row));
  record("manager", "new room counts as sellable inventory", (await sellable()) === before + 1, `${before} -> ${await sellable()}`);
  record("manager", "creation is audited", (await q(
    `select count(*)::int n from audit_logs where action = 'admin_create_room' and entity_type = 'room'`))[0].n > 0);

  await expect("manager", "duplicate room number is refused", "admin_create_room", {
    p_number: rn + "-3", p_type: roomTypeName, p_floor: 91, p_wing: null, p_designation: null,
    p_active: true, p_reason: "QA", p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_NUMBER_TAKEN");
  await expect("manager", "unknown room type is refused", "admin_create_room", {
    p_number: rn + "-4", p_type: `QA Missing ${ts}`, p_floor: 91, p_wing: null, p_designation: null,
    p_active: true, p_reason: "QA", p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_TYPE_NOT_FOUND");

  // Retype guard: a confirmed reservation pointed at the room blocks it,
  // because front_desk_assign_room / check_in would then raise ROOM_TYPE_MISMATCH.
  const otherType = `QA Retype Target ${ts}`;
  await q(`insert into room_types(name, description, max_guests, beds, size_sqm, amenities, base_rate, active, version)
     values($1, 'retype target', 2, '1 King', 24, '{}', 3200, true, 1)`, [otherType]);
  const resId = "QA-RES-" + ts;
  await q(`insert into reservations(id, confirmation_number, guest_name, guest_email, room_id, room_number, room_type,
       check_in, check_out, guests, status, source, total, deposit, deposit_required, payment_status)
     values($1, $1, 'QA Retype Guest', $2, $3, $4, $5, $6, $7, 1, 'confirmed', 'Front Desk', 6000, 3000, 3000, 'deposit')`,
    [resId, guestEmail, newRoom, rn + "-3", roomTypeName, d(31), d(33)]);
  let v = (await q(`select configuration_version from rooms where id = $1`, [newRoom]))[0].configuration_version;
  await expect("manager", "retype is blocked while a reservation points at the room", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 91, p_type: otherType, p_wing: "QA Wing", p_designation: "Accessible",
    p_active: true, p_reason: "QA retype", p_expected_version: v, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_HAS_FUTURE_COMMITMENT");
  await expect("manager", "deactivation is blocked while the room is committed", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 91, p_type: roomTypeName, p_wing: "QA Wing", p_designation: "Accessible",
    p_active: false, p_reason: "QA retire", p_expected_version: v, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_HAS_ACTIVE_ASSIGNMENT");
  // Non-type edits still go through while committed.
  await expect("manager", "floor and wing stay editable while committed", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 92, p_type: roomTypeName, p_wing: "QA Wing B", p_designation: "Accessible",
    p_active: true, p_reason: "QA floor correction", p_expected_version: v, p_actor_user_id: A.manager,
  }, "OK");
  v += 1;
  await expect("manager", "a stale version is refused", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 92, p_type: roomTypeName, p_wing: "QA Wing B", p_designation: "Accessible",
    p_active: true, p_reason: "QA stale", p_expected_version: v - 1, p_actor_user_id: A.manager,
  }, "ERR_CONTAINS_ROOM_CONFIGURATION_STALE");

  // Release the commitment; the retype then succeeds.
  await q(`update reservations set status = 'cancelled', room_id = null where id = $1`, [resId]);
  await expect("manager", "retype succeeds once nothing is committed", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 92, p_type: otherType, p_wing: "QA Wing B", p_designation: "Accessible",
    p_active: true, p_reason: "QA retype", p_expected_version: v, p_actor_user_id: A.manager,
  }, "OK");
  v += 1;

  // Deactivation retires the room from inventory and records why — and the SQL
  // booking gate agrees with it, which is the whole point of room_is_sellable.
  const typed = async () => (await q(
    `select count(*)::int n from rooms r where r.type = $1 and public.room_is_sellable(r.id, $2::date, null)`,
    [otherType, d(30)]))[0].n;
  const beforeOff = await typed();
  await expect("manager", "manager deactivates an uncommitted room", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 92, p_type: otherType, p_wing: "QA Wing B", p_designation: "Accessible",
    p_active: false, p_reason: "QA demolished", p_expected_version: v, p_actor_user_id: A.manager,
  }, "OK");
  v += 1;
  const off = (await q(`select administratively_active, deactivated_at, deactivation_reason from rooms where id = $1`, [newRoom]))[0];
  record("manager", "deactivation stamps when and why", off && off.administratively_active === false && !!off.deactivated_at && off.deactivation_reason === "QA demolished", JSON.stringify(off));
  record("manager", "deactivated room drops out of the SQL booking gate", (await typed()) === beforeOff - 1, `${beforeOff} -> ${await typed()}`);
  await expect("manager", "reactivation clears the retirement stamps", "admin_update_room_metadata", {
    p_room_id: newRoom, p_floor: 92, p_type: otherType, p_wing: "QA Wing B", p_designation: "Accessible",
    p_active: true, p_reason: "QA back in service", p_expected_version: v, p_actor_user_id: A.manager,
  }, "OK");
  const back = (await q(`select administratively_active, deactivated_at, deactivation_reason from rooms where id = $1`, [newRoom]))[0];
  record("manager", "reactivated room carries no retirement stamps", back && back.administratively_active === true && !back.deactivated_at && !back.deactivation_reason, JSON.stringify(back));
  // Four writes land here: the floor/wing edit, the retype, the deactivation,
  // and the reactivation. Refused calls roll back to their savepoint and audit
  // nothing, which is the point.
  const audited = (await q(
    `select count(*)::int n from audit_logs where action = 'admin_update_room_metadata' and entity_id = $1`, [newRoom]))[0].n;
  record("manager", "every configuration change is audited", audited >= 4, `${audited} audit rows`);
}

// =============================================================================
// INNOVATION LAYER  (analytics snapshots, AI audit, inventory movements, QR
// tokens — the DB contract the app layer relies on; app-level logic is covered
// by the vitest suite)
// =============================================================================
sec("innovation");
{
  const { createHash, randomBytes } = await import("node:crypto");
  // expected-refusal helper for raw SQL (constraints are the security property)
  const refused = async (desc, sql, args = [], pattern = null) => {
    const sp = "sp_" + Math.random().toString(36).slice(2);
    await client.query(`SAVEPOINT ${sp}`);
    try {
      await client.query(sql, args);
      await client.query(`ROLLBACK TO ${sp}`);
      await client.query(`RELEASE ${sp}`);
      record("innovation", desc, false, "mutation succeeded");
    } catch (e) {
      await client.query(`ROLLBACK TO ${sp}`).catch(() => {});
      await client.query(`RELEASE ${sp}`).catch(() => {});
      record("innovation", desc, pattern ? new RegExp(pattern, "i").test(e.message) : true, (e.message || "").slice(0, 120));
    }
  };

  // (a) all six innovation tables exist and follow the service-role-only pattern
  const tbls = await q(`select c.relname, c.relrowsecurity rls,
        has_table_privilege('anon', c.oid::regclass::text, 'SELECT') anon_s,
        has_table_privilege('authenticated', c.oid::regclass::text, 'SELECT') auth_s,
        has_table_privilege('service_role', c.oid::regclass::text, 'SELECT') svc_s
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in
       ('analytics_model_runs','analytics_predictions','ai_interactions','inventory_movements','qr_tokens','qr_scan_events')
     order by c.relname`);
  record("innovation", "all six innovation tables exist", tbls.length === 6, tbls.length + " found");
  for (const t of tbls) {
    record("innovation", `${t.relname}: RLS enabled, anon/authenticated denied, service_role granted`,
      t.rls && !t.anon_s && !t.auth_s && t.svc_s, `anon=${t.anon_s} auth=${t.auth_s} svc=${t.svc_s}`);
  }

  // (b) analytics: model run + prediction snapshot, enum guards, cascade on rerun
  const run = (await q(`insert into analytics_model_runs(model_type, model_version, source_window_start, source_window_end, parameters)
     values('occupancy','occupancy-v1', current_date - 84, current_date, '{"horizon":7}'::jsonb) returning id`))[0].id;
  await q(`insert into analytics_predictions(model_run_id, prediction_type, target_date, target_resource_type, predicted_value, risk_level, data_quality, metadata)
     values($1,'occupancy', current_date + 1, 'hotel', 82.5, 'low', 'medium', '{"knownOccupied":40}'::jsonb)`, [run]);
  const pred = (await q(`select prediction_type, predicted_value, data_quality from analytics_predictions where model_run_id = $1`, [run]))[0];
  record("innovation", "prediction snapshot persists with quality label",
    pred && pred.prediction_type === "occupancy" && Number(pred.predicted_value) === 82.5 && pred.data_quality === "medium", JSON.stringify(pred));
  await refused("bogus risk level refused by check constraint",
    `insert into analytics_predictions(model_run_id, prediction_type, target_date, target_resource_type, predicted_value, risk_level)
     values($1,'occupancy', current_date + 1, 'hotel', 10, 'critical')`, [run], "check");
  await q(`delete from analytics_model_runs where id = $1`, [run]);
  const orphaned = (await q(`select count(*)::int n from analytics_predictions where model_run_id = $1`, [run]))[0].n;
  record("innovation", "prediction snapshots cascade-delete with their model run", orphaned === 0, orphaned + " orphaned");

  // (c) AI audit: feature enum guarded; the row shape carries no prompt/response body
  await q(`insert into ai_interactions(user_id, role, feature, tool_calls_used, status, model, latency_ms)
     values($1,'manager','ask','["getOccupancyForecast"]'::jsonb,'ok','gemini-2.5-flash',1834)`, [A.manager]);
  await refused("AI audit refuses an unknown feature",
    `insert into ai_interactions(user_id, role, feature, status) values($1,'manager','predict','ok')`, [A.manager], "check");
  const aiRow = (await q(`select user_id, feature, tool_calls_used, status from ai_interactions where user_id = $1 order by created_at desc limit 1`, [A.manager]))[0];
  record("innovation", "AI interaction audit row records who/what/how — never the exchange",
    aiRow && aiRow.feature === "ask" && aiRow.status === "ok", JSON.stringify(aiRow));

  // (d) inventory movements: the consumption history forecasts read from
  const item = (await q(`insert into inventory(name, category, quantity, reorder_point, unit)
     values($1,'linens', 50, 20, 'pcs') returning id`, ["QA Towels " + ts]))[0].id;
  await q(`insert into inventory_movements(item_id, quantity, direction, source_type, source_id, recorded_by, note)
     values($1, 3, 'consumption', 'guest_request', 'qa-' || $2, $3, 'QA turnover')`, [item, ts, A.housekeeping]);
  await q(`insert into inventory_movements(item_id, quantity, direction, recorded_by) values($1, 40, 'restock', $2)`, [item, A.manager]);
  const consumed = (await q(`select sum(quantity)::numeric total from inventory_movements where item_id = $1 and direction = 'consumption'`, [item]))[0];
  record("innovation", "consumption movements aggregate for the forecast input", Number(consumed.total) === 3, JSON.stringify(consumed));
  await refused("negative movement quantity refused",
    `insert into inventory_movements(item_id, quantity, direction) values($1, -3, 'consumption')`, [item], "check");
  await refused("bogus movement direction refused",
    `insert into inventory_movements(item_id, quantity, direction) values($1, 3, 'shrinkage')`, [item], "check");

  // (e) QR tokens: opaque random payload, SHA-256 hash as the ONLY stored form,
  //     uniqueness, enum guards, revocation, scan audit
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const tokId = (await q(`insert into qr_tokens(token_hash, resource_type, resource_id, purpose, created_by, expires_at)
     values($1,'reservation',$2,'check_in',$3, now() + interval '2 days') returning id, token_hash`, [hash, String(webRes || res2 || "qa"), A.front_desk]))[0].id;
  const tokRow = (await q(`select token_hash from qr_tokens where id = $1`, [tokId]))[0];
  record("innovation", "QR token stored as a SHA-256 hash — plaintext never persisted",
    /^[0-9a-f]{64}$/.test(tokRow.token_hash) && tokRow.token_hash === hash, tokRow.token_hash.slice(0, 16) + "…");
  await refused("duplicate token hash refused (no two live QR payloads collide)",
    `insert into qr_tokens(token_hash, resource_type, resource_id) values($1,'room',$2)`, [hash, rm1], "duplicate");
  await refused("bogus QR resource type refused",
    `insert into qr_tokens(token_hash, resource_type, resource_id) values($1,'guest','x')`, [createHash("sha256").update("other").digest("hex")], "check");
  await q(`insert into qr_scan_events(qr_token_id, scanner_user_id, scanner_role, resource_type, resource_id, action, result)
     values($1,$2,'front_desk','reservation',$3,'check_in','authorized'), ($1,$2,'front_desk','reservation',$3,'check_in','ineligible')`,
    [tokId, A.front_desk, String(webRes || res2)]);
  await refused("bogus scan result refused",
    `insert into qr_scan_events(qr_token_id, resource_type, resource_id, result) values($1,'reservation','x','maybe')`, [tokId], "check");
  const scans = (await q(`select result from qr_scan_events where qr_token_id = $1 order by scanned_at`, [tokId]));
  record("innovation", "every scan outcome is audited (authorized + ineligible both recorded)",
    scans.length === 2 && scans.some((s) => s.result === "authorized") && scans.some((s) => s.result === "ineligible"),
    scans.map((s) => s.result).join(","));
}

// =============================================================================
// SECURITY cross-cut
// =============================================================================
sec("security");
{
  const guards = await q(`select p.proname,
        has_function_privilege('anon', p.oid::regprocedure::text, 'EXECUTE') anon_x,
        has_function_privilege('authenticated', p.oid::regprocedure::text, 'EXECUTE') auth_x,
        has_function_privilege('service_role', p.oid::regprocedure::text, 'EXECUTE') svc_x,
        (pg_get_functiondef(p.oid) like '%actor is null or%') nullsafe
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('verify_reservation_deposit','front_desk_checkout','process_refund','customer_request_reservation_change','admin_create_room_type','admin_propose_room_type_rate','admin_review_room_type_rate_proposal','admin_update_room_type')
     order by p.proname, p.oid`);
  for (const g of guards) {
    record("security", `${g.proname} locked to service_role`, !g.anon_x && !g.auth_x && g.svc_x, `anon=${g.anon_x} auth=${g.auth_x} svc=${g.svc_x}`);
    record("security", `${g.proname} uses null-safe role guard`, g.nullsafe);
  }
}

// =============================================================================
// ROLLBACK always + residue attestation
// =============================================================================
const failed = results.filter((x) => !x.ok).length;
const emailPat = `qa+%+${ts}@haven.test`;
const pre = (await q(`select count(*)::int n from user_accounts where email like $1`, [emailPat]))[0].n;
const preRooms = (await q(`select count(*)::int n from rooms where number like $1`, [rn + "%"]))[0].n;
const preTypes = (await q(`select count(*)::int n from room_types where name = $1`, [roomTypeName]))[0].n;
await client.query("ROLLBACK");
const post = (await q(`select count(*)::int n from user_accounts where email like $1`, [emailPat]))[0].n;
const postRooms = (await q(`select count(*)::int n from rooms where number like $1`, [rn + "%"]))[0].n;
const postTypes = (await q(`select count(*)::int n from room_types where name = $1`, [roomTypeName]))[0].n;
console.log(`\n== summary: ${results.length - failed}/${results.length} passed, ${failed} failed ==`);
console.log(`residue attestation: user_accounts ${pre} -> ${post} | rooms ${preRooms} -> ${postRooms} | room_types ${preTypes} -> ${postTypes} (all must be 0 after rollback)`);
await client.end();
process.exit(failed ? 1 : 0);
