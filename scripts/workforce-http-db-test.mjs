// Active integration test: production Next routes + NextAuth + local PostgREST
// + disposable PostgreSQL clone. No hosted credentials, external provider or UI.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { hotelFixture, hotelTestDatabase } from "./hotel-db-test-helpers.mjs";

const build = ".tmp/workforce-build";
const restBinary = ".tmp/breakfast-browser/postgrest.exe";
if (!fs.existsSync(`${build}/BUILD_ID`) || !fs.existsSync(restBinary)) throw new Error("Build the production app in .tmp/workforce-build and install the local test PostgREST binary first.");
const suite = await hotelTestDatabase();
const db = suite.db;
const origin = "http://127.0.0.1:3128";
const gateway = "http://127.0.0.1:3129";
const restOrigin = "http://127.0.0.1:3130";
const log = fs.createWriteStream(".tmp/workforce-http-test.log");
const token = randomBytes(32).toString("hex");
let app, rest, proxy;
let passed = 0;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
async function ready(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local test service exited with ${child.exitCode} before becoming ready. See .tmp/workforce-http-test.log.`);
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await pause(200);
  }
  throw new Error("Local test service readiness timeout.");
}
function cookies() {
  const values = new Map();
  return {
    async request(path, body, method = body === undefined ? "GET" : "POST") {
      const response = await fetch(origin + path, { method, redirect: "manual", headers: { cookie: [...values].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body instanceof URLSearchParams ? { "content-type": "application/x-www-form-urlencoded" } : body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) }) });
      for (const cookie of response.headers.getSetCookie()) { const field = cookie.split(";", 1)[0]; const at = field.indexOf("="); values.set(field.slice(0, at), field.slice(at + 1)); }
      const text = await response.text();
      let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
      return { status: response.status, body: data };
    },
  };
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, pause(2000)]);
}
try {
  // Grants needed by the existing authentication/workspace fixtures. New
  // Workforce tables keep the migration's read-only table grants.
  await db.query("grant usage on schema public to service_role; grant all privileges on all sequences in schema public to service_role");
  await db.query(`do $$ declare t record; begin
    for t in select tablename from pg_tables where schemaname='public' and tablename not like 'workforce_%' loop
      execute format('grant all privileges on table public.%I to service_role',t.tablename);
    end loop;
  end $$`);
  if (!(await one("select to_regclass('public.workforce_employee_links') present")).present) await db.query(fs.readFileSync("supabase/migrations/20261115090000_workforce_availability.sql", "utf8"));
  const f = await hotelFixture(db, 6);
  const second = await hotelFixture(db, 1);
  const workerA = f.users.housekeeping;
  const workerB = second.users.housekeeping;
  const password = randomBytes(24).toString("base64url");
  const ids = [f.users.owner, f.users.manager, f.users.front_desk, f.users.guest, workerA, workerB];
  await db.query("update user_accounts set password_hash=$1 where id=any($2::uuid[])", [await bcrypt.hash(password, 10), ids]);
  await db.query("update security_policies set login_otp_enabled=false where key='default'");
  await db.query("update hotel_operational_policies set housekeeping_inspection_required=true where key='default'");

  rest = spawn(restBinary, [], { windowsHide: true, env: { ...process.env, PATH: `C:/Program Files/PostgreSQL/18/bin;${process.env.PATH}`,
    PGRST_DB_URI: `postgresql://backend_audit@127.0.0.1:55432/${db.database}`, PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "service_role",
    PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: "3130", PGRST_LOG_LEVEL: "warn" } });
  rest.stdout.pipe(log, { end: false }); rest.stderr.pipe(log, { end: false });
  await ready(restOrigin, rest);
  // Supabase's gateway prefix is adapted locally. PostgREST and SQL are real.
  proxy = http.createServer(async (request, response) => {
    try {
      if (!request.url.startsWith("/rest/v1/")) { response.writeHead(404); response.end("{}"); return; }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = { ...request.headers };
      for (const key of ["host", "content-length", "connection", "authorization", "apikey", "accept-encoding"]) delete headers[key];
      const upstream = await fetch(restOrigin + request.url.slice("/rest/v1".length), { method: request.method, headers, ...(body.length ? { body } : {}) });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !["content-length", "content-encoding", "transfer-encoding", "connection"].includes(key)))); response.end(bytes);
    } catch { response.writeHead(502); response.end("{}"); }
  });
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(3129, "127.0.0.1", resolve); });
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3128", "-H", "127.0.0.1"], { windowsHide: true, env: { ...process.env,
    HAVEN_BUILD_DIR: build, NEXT_PUBLIC_SUPABASE_URL: gateway, SUPABASE_SERVICE_ROLE_KEY: randomBytes(32).toString("hex"),
    NEXTAUTH_URL: origin, NEXTAUTH_SECRET: randomBytes(32).toString("hex"), DIRECT_URL: "", DATABASE_URL: "",
    HAVEN_WORKFORCE_ENABLED: "true", HAVEN_WORKFORCE_CONTRACT: "haven-workforce-v1", HAVEN_WORKFORCE_INBOUND_TOKEN: token,
    HAVEN_FLEET_MODE: "off", HAVEN_BREAKFAST_ENABLED: "false", HAVEN_RESTAURANT_BREAKFAST_ENABLED: "false",
    XENDIT_SECRET_KEY: " ", XENDIT_WEBHOOK_TOKEN: " ", PAYMONGO_SECRET_KEY: " ", PAYMONGO_WEBHOOK_SECRET: " ",
    RESEND_API_KEY: " ", SMTP_HOST: " ", SMTP_USER: " ", SMTP_PASSWORD: " ", APP_BASE_URL: origin,
  } });
  app.stdout.pipe(log, { end: false }); app.stderr.pipe(log, { end: false });
  await ready(`${origin}/api/auth/csrf`, app);
  async function login(id) {
    const client = cookies();
    const csrf = await client.request("/api/auth/csrf"); assert.equal(csrf.status, 200);
    const { email } = await one("select email from user_accounts where id=$1", [id]);
    await client.request("/api/auth/callback/credentials", new URLSearchParams({ csrfToken: csrf.body.csrfToken, email, password, json: "true", callbackUrl: `${origin}/manager_dashboard` }));
    const session = await client.request("/api/auth/session"); assert.equal(session.body.user?.id, id, "Real NextAuth login must succeed");
    return client;
  }
  const owner = await login(f.users.owner), manager = await login(f.users.manager), front = await login(f.users.front_desk);
  const a = await login(workerA), b = await login(workerB), guest = await login(f.users.guest);
  const post = async (client, path, body, expected = 200) => { const r = await client.request(path, body); assert.equal(r.status, expected, `${path}: ${JSON.stringify(r.body)}`); return r.body; };
  const snapshot = async client => { const r = await client.request("/api/staff/workforce"); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data; };
  const event = (employeeId, version, extra = {}) => ({ contract: "haven-workforce-v1", eventId: randomUUID(), sourceSystem: "workforce", propertyId: "haven", employeeId, version,
    observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 5 * 60_000).toISOString(), employmentActive: true, department: "housekeeping", attendance: "clocked_in",
    shift: { startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() }, ...extra });
  const receive = async (body, expected = 200, bearer = token) => {
    const r = await fetch(`${origin}/api/integrations/workforce/availability`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}`, "idempotency-key": body.eventId }, body: JSON.stringify(body) });
    const response = await r.json(); assert.equal(r.status, expected, JSON.stringify(response)); return response;
  };
  const ownStatus = async client => (await snapshot(client)).staff[0].status;
  async function checkedIn(room) {
    const r = await one("insert into reservations(guest_id,user_id,guest_name,room_id,room_number,room_type,check_in,check_out,status,total) values($1,$2,'Local HTTP QA',$3,$4,$5,hotel_today()-1,hotel_today()+1,'checked_in',0) returning id", [f.guest, f.users.guest, room.id, room.number, f.type]);
    await db.query("insert into invoices(reservation_id,guest_name,amount,paid,balance,status) values($1,'Local HTTP QA',0,0,0,'paid')", [r.id]);
    await db.query("insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,status) values($1,$2,hotel_today()-1,hotel_today()+1,'active')", [r.id, room.id]);
    await db.query("update rooms set status='occupied' where id=$1", [room.id]); return r.id;
  }
  const checkout = (id) => post(front, `/api/front-desk/reservations/${id}/checkout`, {});
  const taskFor = reservation => one("select * from housekeeping_tasks where source_type='checkout' and source_id=$1", [reservation]);

  await check("real NextAuth roles enforce mapping and personal/team availability access", async () => {
    assert.equal((await cookies().request("/api/staff/workforce")).status, 401);
    assert.equal((await guest.request("/api/staff/workforce")).status, 403);
    const forbidden = { action: "link", userId: workerA, employeeId: "QA-A", reason: "Unprivileged test" };
    await post(manager, "/api/staff/workforce", forbidden, 403); await post(a, "/api/staff/workforce", forbidden, 403);
    await post(owner, "/api/staff/workforce", { ...forbidden, reason: "Reviewed QA employee A" });
    await post(owner, "/api/staff/workforce", { action: "link", userId: workerB, employeeId: "QA-B", reason: "Reviewed QA employee B" });
    const own = await snapshot(a); assert.equal(own.scope, "self"); assert.equal(own.staff.length, 1); assert.equal(own.staff[0].userId, workerA); assert.equal(own.canManage, false);
    assert.equal((await snapshot(manager)).scope, "team"); assert.equal((await snapshot(owner)).canManage, true);
  });
  let first;
  await check("active receiver authenticates and validates property, employee mapping and payload", async () => {
    first = event("QA-A", 1);
    await receive(first, 401, "invalid-test-credential");
    await receive({ ...first, propertyId: "other-property" }, 422);
    await receive(event("not-mapped", 1), 404);
    await receive({ ...first, department: "admin" }, 422);
    assert.equal((await one("select count(*)::int n from workforce_availability_events")).n, 0);
    await receive(first); await receive(event("QA-B", 1));
    assert.equal(await ownStatus(a), "on_duty"); assert.equal(await ownStatus(b), "on_duty");
  });
  await check("HTTP replay cannot refresh evidence and modified reuse returns conflict", async () => {
    const before = await one("select received_at,valid_until from workforce_availability where event_id=$1", [first.eventId]);
    assert.equal((await receive(first)).replayed, true);
    await receive({ ...first, attendance: "clocked_out" }, 409);
    const after = await one("select received_at,valid_until from workforce_availability where event_id=$1", [first.eventId]);
    assert.equal(after.received_at.toISOString(), before.received_at.toISOString()); assert.equal(after.valid_until.toISOString(), before.valid_until.toISOString());
  });
  await check("Front Desk checkout assigns the least-loaded eligible cleaner and appears in the real queue", async () => {
    const settings = (await snapshot(owner)).settings;
    await post(owner, "/api/staff/workforce", { action: "configure", sourceSystem: settings.sourceSystem, propertyId: settings.propertyId, autoAssignCheckout: true, expectedVersion: settings.version, reason: "Enable isolated HTTP QA" });
    await db.query("insert into housekeeping_tasks(room_number,task,task_type,source_type,status,assigned_user_id) values($1,'Existing QA workload','room_preparation','manual','assigned',$2)", [f.rooms[0].number, workerA]);
    const id = await checkedIn(f.rooms[0]); await checkout(id); const task = await taskFor(id);
    assert.equal(task.status, "assigned"); assert.equal(task.assigned_user_id, workerB);
    const queue = await b.request("/api/resources/housekeeping_tasks"); assert.equal(queue.status, 200); assert.ok(queue.body.data.some(t => t.id === task.id && t.assigned_user_id === workerB));
    assert.equal((await one("select housekeeping from rooms where id=$1", [f.rooms[0].id])).housekeeping, "dirty");
    await post(b, `/api/housekeeping/tasks/${task.id}/start`, {});
    await post(b, `/api/housekeeping/tasks/${task.id}/complete`, { checklist: { bed_and_linen: true, bathroom: true, amenities: true, safety_check: true }, notes: "Local HTTP QA cleaning" });
    assert.equal((await one("select housekeeping,room_is_sellable(id,hotel_today(),null) sellable from rooms where id=$1", [f.rooms[0].id])).sellable, false);
    await post(b, `/api/housekeeping/tasks/${task.id}/inspect`, { result: "passed", idempotencyKey: randomUUID() });
    const room = await one("select status,housekeeping,room_is_sellable(id,hotel_today(),null) sellable from rooms where id=$1", [f.rooms[0].id]);
    assert.equal(room.status, "available"); assert.equal(room.housekeeping, "clean"); assert.equal(room.sellable, true);
  });
  let backlog;
  await check("clock-out excludes staff, stale versions cannot undo it, and new clock-in assigns backlog", async () => {
    await receive(event("QA-A", 2, { attendance: "clocked_out" })); await receive(event("QA-B", 2, { attendance: "clocked_out" }));
    assert.equal((await receive(event("QA-A", 1))).outcome, "ignored_stale_version"); assert.equal(await ownStatus(a), "off_duty");
    const id = await checkedIn(f.rooms[1]); await checkout(id); backlog = await taskFor(id); assert.equal(backlog.assigned_user_id, null);
    assert.ok((await snapshot(owner)).unassignedCheckoutTasks >= 1);
    assert.equal((await receive(event("QA-B", 3))).assigned, 1);
    assert.equal((await taskFor(id)).assigned_user_id, workerB);
  });
  await check("concurrent actual checkout requests balance tied workloads and retain one assignment per task", async () => {
    await receive(event("QA-A", 3));
    const ids = await Promise.all([checkedIn(f.rooms[2]), checkedIn(f.rooms[3])]); await Promise.all(ids.map(checkout));
    const tasks = await Promise.all(ids.map(taskFor)); assert.equal(new Set(tasks.map(t => t.assigned_user_id)).size, 2);
    const count = await one("select count(*)::int n from housekeeping_task_assignments where task_id=any($1)", [tasks.map(t => t.id)]); assert.equal(count.n, 2);
  });
  await check("freshness expiry and shift end prevent automatic assignments through the active receiver", async () => {
    await receive(event("QA-A", 4, { attendance: "clocked_out" }));
    await receive(event("QA-B", 4, { validUntil: new Date(Date.now() + 400).toISOString() })); await pause(550);
    assert.equal(await ownStatus(b), "stale");
    const expired = await checkedIn(f.rooms[4]); await checkout(expired); assert.equal((await taskFor(expired)).assigned_user_id, null);
    await receive(event("QA-B", 5, { attendance: "on_break" })); assert.equal(await ownStatus(b), "on_break");
    await receive(event("QA-B", 6, { shift: { startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 400).toISOString() } }));
    await pause(550); assert.equal(await ownStatus(b), "outside_shift");
    const ended = await checkedIn(f.rooms[5]); await checkout(ended); assert.equal((await taskFor(ended)).assigned_user_id, null);
    await receive(event("QA-B", 7, { attendance: "on_leave" })); assert.equal(await ownStatus(b), "on_leave");
  });
  await check("unlink revokes source eligibility without deleting existing assigned work", async () => {
    const own = await snapshot(b); const linkId = own.staff[0].linkId;
    await post(owner, "/api/staff/workforce", { action: "unlink", userId: workerB, linkId, reason: "Revoke isolated QA mapping" });
    assert.equal(await ownStatus(b), "unmapped");
    assert.equal((await one("select assigned_user_id from housekeeping_tasks where id=$1", [backlog.id])).assigned_user_id, workerB);
    assert.equal((await one("select role from user_accounts where id=$1", [workerB])).role, "housekeeping");
  });
  await check("explicit disable stops backlog assignment while new evidence remains readable", async () => {
    const s = (await snapshot(owner)).settings;
    await post(owner, "/api/staff/workforce", { action: "configure", sourceSystem: s.sourceSystem, propertyId: s.propertyId, autoAssignCheckout: false, expectedVersion: s.version, reason: "Disable isolated QA automation" });
    const before = (await one("select count(*)::int n from housekeeping_task_assignments where assignment_method='workforce_auto'")).n;
    await receive(event("QA-A", 5)); assert.equal(await ownStatus(a), "on_duty");
    assert.equal((await one("select count(*)::int n from housekeeping_task_assignments where assignment_method='workforce_auto'")).n, before);
    assert.ok((await snapshot(owner)).unassignedCheckoutTasks >= 1);
  });
  console.log(`PASS ${passed} active Workforce HTTP/PostgreSQL scenarios (local production build)`);
} finally {
  await stop(app); await stop(rest);
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  await suite.close(); log.end();
}
