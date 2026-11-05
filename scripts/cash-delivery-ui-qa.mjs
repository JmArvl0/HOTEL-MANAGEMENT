// Real app + real NextAuth sessions + real PostgREST + fresh loopback PostgreSQL.
// No .env is read by this harness; all service/auth credentials are ephemeral.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright";
import { createServer } from "node:net";
import { createServer as createHttpServer, request as httpRequest } from "node:http";

const root = process.cwd(), work = path.join(root, ".tmp/cash-delivery-qa-20261106");
fs.mkdirSync(path.join(work, "evidence"), { recursive: true });
async function freePort() { const server = createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
const appPort = await freePort(), restPort = await freePort();
const gatewayPort = await freePort(), gatewayOrigin = "http://127.0.0.1:" + gatewayPort;
const origin = "http://127.0.0.1:" + appPort, rest = "http://127.0.0.1:" + restPort;
const pgData = path.join(root, ".tmp/cash-findings-pg"), pgCtl = "C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe";
assert.ok(pgData.startsWith(root + path.sep));
const connection = { host: "127.0.0.1", port: 55441, user: "cash_data_qa", connectionTimeoutMillis: 5000 };
const database = "cash_delivery_" + randomUUID().replaceAll("-", "");
const jwtSecret = randomBytes(32).toString("hex"), authSecret = randomBytes(32).toString("hex");
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", iss: "local-cash-qa", exp: Math.floor(Date.now() / 1000) + 7200 });
const serviceToken = unsigned + "." + createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
const checks = [], issues = [], ui = [], children = [], logFiles = [], contexts = [];
const users = {};
let db, browser, gateway, startedPg = false;
const q = (sql, args = []) => db.query(sql, args);
const one = async (sql, args = []) => (await q(sql, args)).rows[0];
async function until(run, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { const result = await run(); if (result) return result; } catch (error) { if (error.message.includes("exited")) throw error; } await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Timed out: " + description);
}
async function check(name, run) {
  try { const evidence = await run(); checks.push({ name, result: "PASS", evidence }); console.log("PASS " + name); return true; }
  catch (error) { checks.push({ name, result: "FAIL", error: error.message }); console.error("FAIL " + name + ": " + error.message); return false; }
}
function child(executable, args, env, label) {
  const output = fs.openSync(path.join(work, label + ".log"), "a"); logFiles.push(output);
  const normalizedEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [key.toUpperCase(), value]));
  const process = spawn(executable, args, { cwd: root, env: normalizedEnv, windowsHide: true, stdio: ["ignore", output, output] });
  children.push(process); return process;
}
async function session(role) {
  const user = users[role], token = await encode({ secret: authSecret, maxAge: 3600, token: { sub: user.id, role: user.role, name: user.name, email: user.email, authVersion: user.auth_version, loginIssuedAt: Math.floor(Date.now() / 1000), persistent: false, disabled: false, otpPending: false } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  await context.addCookies([{ name: "haven.session-token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" || new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
  return context;
}
async function request(context, url, method = "GET", data) {
  const response = await context.request.fetch(origin + url, { method, data });
  const body = await response.json();
  if (!response.ok()) throw new Error(method + " " + url + " returned " + response.status() + ": " + body.error);
  return body.data;
}
async function nav(page, label) {
  await page.locator("aside button.nav-group-header").first().waitFor({ state: "attached" });
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  const target = page.locator('aside button[title="' + label + '"]');
  const group = target.locator('xpath=ancestor::div[contains(@class,"nav-group-wrap")][1]').locator("button.nav-group-header");
  await until(async () => {
    if (await target.isVisible()) return true;
    if (await open.isVisible()) await open.click();
    if (await group.getAttribute("aria-expanded") === "false") await group.click();
    return false;
  }, "sidebar group ready for " + label, 15000);
  await target.click();
  await until(async () => (await target.getAttribute("class") ?? "").includes("active"), "module selected: " + label, 10000);
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(work, "evidence", name + ".png"), fullPage: true });
}
async function auditLayout(page, label) {
  const measured = await page.evaluate(() => {
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden";
    const controls = [...document.querySelectorAll(".cash-workspace button,.cash-count-dialog button,.cash-count-dialog input,.cash-count-dialog select,.cash-count-dialog textarea")].filter(visible);
    const targets = controls.filter(element => element.getBoundingClientRect().width < 44 || element.getBoundingClientRect().height < 44).map(element => ({ name: element.getAttribute("aria-label") || element.textContent.trim() || element.labels?.[0]?.textContent.trim(), tag: element.tagName, width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height), type: element.type }));
    const unlabeled = controls.filter(element => ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) && !element.labels?.length && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby")).map(element => element.outerHTML.slice(0, 120));
    return { width: innerWidth, height: innerHeight, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, smallTargets: targets, unlabeled, headings: [...document.querySelectorAll(".cash-workspace h1,.cash-workspace h2")].map(element => element.textContent) };
  });
  ui.push({ label, ...measured });
  assert.equal(measured.pageOverflow, false, label + " page horizontal overflow"); assert.deepEqual(measured.unlabeled, []);
  return measured;
}
try {
  const status = spawn(pgCtl, ["-D", pgData, "status"], { windowsHide: true, stdio: "ignore" });
  const code = await new Promise(resolve => status.on("exit", resolve));
  if (code !== 0) { execFileSync(pgCtl, ["-D", pgData, "-l", path.join(work, "postgres.log"), "-o", "-h 127.0.0.1 -p 55441", "-w", "start"], { windowsHide: true, stdio: "ignore" }); startedPg = true; }
  const admin = new pg.Client({ ...connection, database: "postgres" }); await admin.connect();
  for (const role of ["anon", "authenticated", "service_role"]) if (!(await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await admin.query("create role " + role + (role === "service_role" ? " bypassrls" : ""));
  await admin.query("create database " + database); await admin.end();
  db = new pg.Client({ ...connection, database }); await db.connect();
  await q("create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb); create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])");
  const migrations = fs.readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort();
  for (const name of migrations) { await q(fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8")); await q("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [name.slice(0, 14), name]); }
  await q("grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role; grant usage,select on all sequences in schema public to service_role");
  for (const [key, role] of Object.entries({ fd: "front_desk", peer: "front_desk", accounting: "accounting", manager: "manager", owner: "owner", guest: "guest" })) {
    const id = randomUUID();
    users[key] = await one("insert into user_accounts(id,email,name,role,password_hash,active,account_status,last_seen_at) values($1,$2,$3,$4,'offline-test-placeholder',true,'active',now()) returning id,email,name,role,auth_version", [id, id + "@example.invalid", "QA Delivery " + key, role]);
  }
  const reservation = "QA-DELIVERY-" + randomUUID().slice(0, 8), invoice = reservation + "-I";
  await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'QA Delivery fictional guest','Test',current_date+30,current_date+31,'confirmed',5000)", [reservation, users.guest.id]);
  await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'QA Delivery fictional guest',5000,5000,'unpaid')", [invoice, reservation]);
  console.log("PASS isolated database: " + migrations.length + " migrations, fictional accounts and folio");
  const postgrest = child(path.join(root, ".tmp/staff-walkthrough/postgrest/postgrest.exe"), [], { ...process.env, PATH: "C:/Program Files/PostgreSQL/18/bin;" + process.env.PATH, PGRST_DB_URI: "postgresql://cash_data_qa@127.0.0.1:55441/" + database, PGRST_DB_ANON_ROLE: "anon", PGRST_DB_SCHEMAS: "public", PGRST_JWT_SECRET: jwtSecret, PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(restPort), PGRST_LOG_LEVEL: "info" }, "postgrest");
  await until(async () => { if (postgrest.exitCode !== null) throw new Error("PostgREST exited: " + postgrest.exitCode); return (await fetch(rest + "/user_accounts?select=id&limit=1", { headers: { Authorization: "Bearer " + serviceToken } })).ok; }, "PostgREST ready");
  gateway = createHttpServer((incoming, outgoing) => {
    if (!incoming.url.startsWith("/rest/v1/")) { outgoing.writeHead(404); outgoing.end(); return; }
    const target = httpRequest(rest + incoming.url.slice("/rest/v1".length), { method: incoming.method, headers: { ...incoming.headers, host: "127.0.0.1:" + restPort } }, response => { outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing); });
    target.on("error", () => { outgoing.writeHead(503); outgoing.end(); }); incoming.pipe(target);
  });
  await new Promise(resolve => gateway.listen(gatewayPort, "127.0.0.1", resolve));
  const appEnv = { ...process.env, NODE_ENV: "development", NEXTAUTH_URL: origin, NEXTAUTH_SECRET: authSecret, NEXT_PUBLIC_SUPABASE_URL: gatewayOrigin, SUPABASE_SERVICE_ROLE_KEY: serviceToken, SUPABASE_URL: gatewayOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "", HAVEN_BUILD_DIR: ".tmp/cash-delivery-qa-20261106/build", GEMINI_API_KEY: "", GOOGLE_API_KEY: "", OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_FROM: "", PAYMONGO_SECRET_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };
  const app = child(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], appEnv, "next");
  await until(async () => { if (app.exitCode !== null) throw new Error("App exited"); return (await fetch(origin + "/api/auth/providers")).ok; }, "Next app ready");
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const fd = await session("fd"), accounting = await session("accounting"), peer = await session("peer"), manager = await session("manager"), owner = await session("owner");
  const realSession = await (await accounting.request.get(origin + "/api/auth/session")).json();
  assert.equal(realSession.user.role, "accounting"); assert.equal(realSession.user.disabled, false);
  const ledger = await request(accounting, "/api/accounting/ledger");
  assert.ok(ledger.invoices.some(row => row.id === invoice), "Safety gate: app is not reading the isolated fixture invoice");
  assert.equal(ledger.invoices.length, 1, "Safety gate: unexpected data outside the scratch database");
  console.log("PASS app-to-database safety gate and real session authentication");
  const fdPage = await fd.newPage(), accountPage = await accounting.newPage();
  await fdPage.goto(origin + "/manager_dashboard", { timeout: 90000 });
  await nav(fdPage, "Cash & Shifts");
  await fdPage.getByRole("heading", { name: "Cash & Shifts", exact: true }).waitFor();
  await shot(fdPage, "01-empty-cash");
  if (!process.argv.includes("--probe")) {
    let shiftId, paymentId, refundId, paymentRef, receiptNumber, savedDraft;
    const runtimeErrors = [];
    fdPage.on("pageerror", error => runtimeErrors.push(error.message)); accountPage.on("pageerror", error => runtimeErrors.push(error.message));
    if (!await check("Open in browser persists float/location/opener in cash_shifts", async () => {
      await fdPage.getByRole("button", { name: "Open cash shift", exact: true }).click();
      await fdPage.getByLabel("Opening cash float (PHP)").fill("1000");
      await fdPage.getByLabel("Cash point / location (optional)").fill("QA delivery drawer");
      await fdPage.getByRole("button", { name: "Open shift", exact: true }).click();
      const shift = await until(() => one("select * from cash_shifts where status='open'"), "open persisted");
      shiftId = shift.id; assert.equal(Number(shift.opening_amount), 1000); assert.equal(shift.location, "QA delivery drawer"); assert.equal(shift.staff_user_id, users.fd.id);
      await fdPage.getByRole("heading", { name: "Current shift", exact: true }).waitFor(); return { shiftId };
    })) throw new Error("Open workflow failed");
    await check("Cash payment HTTP saves drawer/folio/receipt and appears in cash movements", async () => {
      const paid = await request(fd, "/api/front-desk/reservations/" + reservation + "/payment", "POST", { amount: 2000, method: "cash", idempotencyKey: randomUUID() });
      paymentId = paid.payment_id;
      const payment = await one("select * from payments where id=$1", [paymentId]); paymentRef = payment.reference;
      assert.equal(payment.cash_shift_id, shiftId); assert.equal(payment.invoice_id, invoice); assert.equal(payment.received_by, users.fd.id);
      const document = await one("select * from financial_documents where payment_id=$1", [paymentId]); receiptNumber = document.document_number;
      assert.ok(document.snapshot); assert.equal(document.document_type, "receipt"); assert.equal(Number((await one("select paid from invoices where id=$1", [invoice])).paid), 2000);
      await fdPage.getByRole("button", { name: "Refresh cash ledger" }).click();
      await fdPage.getByRole("table", { name: "Shift cash movements" }).getByRole("cell").filter({ hasText: paymentRef }).waitFor();
      return { paymentId, paymentRef, receiptNumber };
    });
    await check("Save failure preserves input; explicit save writes only cash_count_drafts", async () => {
      await fdPage.getByRole("button", { name: "Review count & close", exact: true }).first().click();
      await fdPage.getByLabel("Physical cash counted (PHP)").fill("3000"); await fdPage.getByLabel("Count note / variance explanation").fill("QA delivery independent physical count");
      const pattern = "**/api/accounting/cash-shifts/" + shiftId;
      await fdPage.route(pattern, route => route.request().method() === "PUT" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "QA injected save failure" }) }) : route.continue());
      await fdPage.getByRole("button", { name: "Save draft & return", exact: true }).click(); await fdPage.getByText("QA injected save failure", { exact: true }).waitFor();
      assert.equal(await fdPage.getByLabel("Physical cash counted (PHP)").inputValue(), "3000"); assert.equal((await one("select count(*)::int n from cash_count_drafts")).n, 0);
      await shot(fdPage, "02-save-error-preserved"); await fdPage.unroute(pattern);
      await fdPage.getByRole("button", { name: "Save draft & return", exact: true }).click();
      await fdPage.getByText(/Draft saved at/).waitFor(); savedDraft = await one("select * from cash_count_drafts where cash_shift_id=$1", [shiftId]);
      assert.equal(Number(savedDraft.actual_cash), 3000); assert.equal(savedDraft.actor_id, users.fd.id); assert.equal(savedDraft.actor_role, "front_desk");
      const shift = await one("select * from cash_shifts where id=$1", [shiftId]); assert.equal(shift.status, "open"); assert.equal(shift.actual_cash, null); assert.equal(shift.variance, null);
    });
    await check("Saved draft resumes after module change, page reload and a new browser session", async () => {
      await nav(fdPage, "Dashboard"); await nav(fdPage, "Cash & Shifts"); await fdPage.reload(); await nav(fdPage, "Cash & Shifts");
      await fdPage.getByRole("button", { name: "Review count & close", exact: true }).first().click(); await fdPage.getByRole("button", { name: "Resume saved draft", exact: true }).click();
      assert.equal(await fdPage.getByLabel("Physical cash counted (PHP)").inputValue(), "3000"); assert.equal(await fdPage.getByLabel("Count note / variance explanation").inputValue(), savedDraft.notes);
      await fdPage.keyboard.press("Escape");
      const freshContext = await session("fd"), freshPage = await freshContext.newPage(); await freshPage.goto(origin + "/manager_dashboard"); await nav(freshPage, "Cash & Shifts");
      await freshPage.getByRole("button", { name: "Review count & close", exact: true }).first().click(); await freshPage.getByRole("button", { name: "Resume saved draft", exact: true }).click();
      assert.equal(await freshPage.getByLabel("Physical cash counted (PHP)").inputValue(), "3000"); await freshPage.close();
    });
    await check("Different cashier cannot read the saved count or execute refunds", async () => {
      const result = await peer.request.get(origin + "/api/accounting/cash-shifts/" + shiftId); assert.equal(result.status(), 403);
      const result2 = await fd.request.post(origin + "/api/accounting/refunds/" + randomUUID() + "/process", { data: { method: "cash", cashShiftId: shiftId, reference: "QA forbidden" } }); assert.equal(result2.status(), 403);
      const peerPage = await peer.newPage(); await peerPage.goto(origin + "/manager_dashboard"); await nav(peerPage, "Cash & Shifts"); assert.equal(await peerPage.getByRole("button", { name: "Review count & close", exact: true }).count(), 0); await peerPage.close();
    });
    await check("Mobile count review supports large amounts, keyboard trap and focus return", async () => {
      for (const theme of ["light", "dark"]) {
        await fdPage.setViewportSize({ width: 390, height: 844 });
        if (theme === "dark") await fdPage.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
        await fdPage.getByRole("button", { name: "Review count & close", exact: true }).first().click();
        await fdPage.getByLabel("Physical cash counted (PHP)").fill("10000000");
        await fdPage.setViewportSize({ width: 320, height: 844 });
        await auditLayout(fdPage, "mobile-large-count-" + theme); await shot(fdPage, "count-mobile-" + theme);
        const footerAction = fdPage.getByRole("button", { name: "Save draft & return", exact: true });
        await footerAction.scrollIntoViewIfNeeded();
        const footerBox = await footerAction.boundingBox(); assert.ok(footerBox && footerBox.y >= 0 && footerBox.y + footerBox.height <= 844);
        await shot(fdPage, "count-mobile-footer-" + theme);
        for (let index = 0; index < 12; index++) { await fdPage.keyboard.press("Tab"); assert.equal(await fdPage.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true); }
        await fdPage.getByLabel("Physical cash counted (PHP)").fill("3000");
        await fdPage.keyboard.press("Escape"); assert.match(await fdPage.evaluate(() => document.activeElement.textContent), /Review count|physical count/i);
        await fdPage.setViewportSize({ width: 390, height: 844 });
      }
      await fdPage.getByRole("button", { name: "Switch to light mode", exact: true }).click(); await fdPage.setViewportSize({ width: 1440, height: 1000 });
      assert.equal(Number((await one("select actual_cash from cash_count_drafts where cash_shift_id=$1", [shiftId])).actual_cash), 3000);
    });
    refundId = randomUUID();
    await q("insert into refund_requests(id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status) values($1,$2,$3,'QA DELIVERY CASH REFUND',2000,1250,250,'pending')", [refundId, reservation, invoice]);
    if (!await check("Refunds opened directly loads live drawer, blocks read errors and pays exactly once", async () => {
      await accountPage.goto(origin + "/manager_dashboard"); await nav(accountPage, "Refunds");
      const row = accountPage.getByRole("row").filter({ hasText: reservation });
      await row.getByRole("button", { name: /Process refund/i }).click();
      await accountPage.route("**/api/accounting/ledger", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "QA drawer read failure" }) }));
      await accountPage.getByLabel("Payout method").selectOption("cash"); await accountPage.getByText(/Current drawer unavailable/).waitFor();
      assert.equal(await accountPage.getByRole("button", { name: "Record completed refund", exact: true }).isDisabled(), true);
      await accountPage.unroute("**/api/accounting/ledger"); await accountPage.getByRole("button", { name: "Refresh drawer", exact: true }).click();
      await accountPage.getByText(/Recorded available cash/).waitFor(); await accountPage.getByLabel("Cash drawer used").selectOption(shiftId); await accountPage.getByLabel("Payout / transaction reference").fill("QA-DELIVERY-CASH-250");
      await auditLayout(accountPage, "desktop-cash-refund"); await shot(accountPage, "03-cash-refund");
      await accountPage.setViewportSize({ width: 320, height: 844 }); await auditLayout(accountPage, "mobile-cash-refund"); await shot(accountPage, "refund-mobile-light"); await accountPage.setViewportSize({ width: 1440, height: 1000 });
      await accountPage.getByLabel(/I confirm this refund has actually been paid/).check(); await accountPage.getByRole("button", { name: "Record completed refund", exact: true }).click();
      const payout = await until(() => one("select * from payments where idempotency_key=$1", [refundId]), "refund payment committed");
      assert.equal(payout.method, "cash"); assert.equal(payout.cash_shift_id, shiftId); assert.equal(payout.received_by, users.accounting.id); assert.equal(Number(payout.amount), 250);
      await request(accounting, "/api/accounting/refunds/" + refundId + "/process", "POST", { method: "cash", cashShiftId: shiftId, reference: "QA-DELIVERY-CASH-250" });
      assert.equal((await one("select count(*)::int n from payments where idempotency_key=$1", [refundId])).n, 1); assert.equal((await one("select count(*)::int n from refund_attempts where refund_request_id=$1", [refundId])).n, 1);
      return { refundId, payoutId: payout.id };
    })) throw new Error("Refund UI workflow failed");
    await check("Refund/payment/receipt reach Transactions, Folios, Financial Documents and Owner Audit", async () => {
      const data = await request(accounting, "/api/accounting/ledger");
      assert.ok(data.transactions.some(row => row.id === paymentId && row.reference === paymentRef)); assert.ok(data.transactions.some(row => row.idempotency_key === refundId || row.reference === "QA-DELIVERY-CASH-250"));
      assert.ok(data.invoices.some(row => row.id === invoice)); assert.ok(data.documents.some(row => row.document_number === receiptNumber)); assert.ok(data.refunds.some(row => row.id === refundId && row.status === "processed"));
      const ownerAudit = await request(owner, "/api/owner/data?section=audit"); assert.ok(ownerAudit.some(row => row.entity_id === refundId && row.action === "process_refund" && row.after_data.cashShiftId === shiftId));
      for (const [module, text] of [["Transactions", "QA-DELIVERY-CASH-250"], ["Guest Folios", "QA Delivery fictional guest"], ["Financial Documents", receiptNumber]]) { await nav(accountPage, module); await accountPage.getByRole("row").filter({ hasText: text }).first().waitFor(); }
    });
    await check("Noncash payout is saved without a drawer and never changes expected cash", async () => {
      const id = randomUUID();
      await q("insert into refund_requests(id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status) values($1,$2,$3,'QA DELIVERY EXTERNAL REFUND',2000,501,100.25,'pending')", [id, reservation, invoice]);
      await nav(accountPage, "Refunds");
      await accountPage.getByRole("row").filter({ hasText: reservation }).getByRole("button", { name: /Process refund/i }).click();
      await accountPage.getByLabel("Payout method").selectOption("gcash"); await accountPage.getByLabel("Payout / transaction reference").fill("QA-DELIVERY-GCASH-10025");
      assert.equal(await accountPage.getByLabel("Cash drawer used").count(), 0);
      await accountPage.getByLabel(/I confirm this refund has actually been paid/).check(); await accountPage.getByRole("button", { name: "Record completed refund", exact: true }).click();
      const payout = await until(() => one("select * from payments where idempotency_key=$1", [id]), "external payout committed"); assert.equal(payout.method, "gcash"); assert.equal(payout.cash_shift_id, null); assert.equal(Number(payout.amount), 100.25);
      const current = await request(fd, "/api/accounting/cash-shifts/" + shiftId); assert.equal(Number(current.expectedCash), 2750);
    });
    await check("Stale saved count is blocked after refund; actual expected cash becomes 2750", async () => {
      await fdPage.getByRole("button", { name: "Refresh cash ledger", exact: true }).click();
      await fdPage.getByRole("button", { name: "Review count & close", exact: true }).first().click();
      await fdPage.getByText(/Cash activity changed/).first().waitFor(); assert.equal(await fdPage.getByRole("button", { name: "Close shared drawer", exact: true }).isDisabled(), true);
      await fdPage.getByRole("button", { name: "Start a fresh count", exact: true }).click(); await fdPage.getByLabel("Physical cash counted (PHP)").fill("2750");
      const context = await request(fd, "/api/accounting/cash-shifts/" + shiftId); assert.equal(Number(context.expectedCash), 2750);
      await fdPage.getByRole("button", { name: "Save draft & return", exact: true }).click(); await fdPage.getByText(/Draft saved at/).waitFor();
    });
    if (!await check("Lost close response retries stored key; close records 2750 with zero false shortage", async () => {
      const pattern = "**/api/accounting/cash-shifts/" + shiftId; let once = true;
      await fdPage.route(pattern, async route => { if (route.request().method() === "PATCH" && once) { once = false; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed"); } else await route.continue(); });
      await fdPage.getByRole("button", { name: "Review count & close", exact: true }).first().click(); await fdPage.getByRole("button", { name: "Close shared drawer", exact: true }).click();
      await fdPage.getByRole("button", { name: "Retry closing drawer", exact: true }).waitFor(); await fdPage.unroute(pattern);
      await fdPage.getByRole("button", { name: "Retry closing drawer", exact: true }).click(); await fdPage.getByRole("heading", { name: "Latest closed shift", exact: true }).waitFor();
      const shift = await one("select * from cash_shifts where id=$1", [shiftId]); assert.equal(Number(shift.expected_cash), 2750); assert.equal(Number(shift.actual_cash), 2750); assert.equal(Number(shift.variance), 0);
      assert.equal((await one("select count(*)::int n from audit_logs where entity_id=$1 and action='close_cash_shift'", [shiftId])).n, 1);
      assert.equal((await one("select count(*)::int n from shift_handovers")).n, 0); assert.equal((await one("select count(*)::int n from front_desk_reports")).n, 0);
    })) throw new Error("Close workflow failed");
    await check("Accounting reconciliation saves reviewer/timestamp without altering the close", async () => {
      await nav(accountPage, "Cash & Shifts"); await accountPage.getByRole("button", { name: "Reconcile latest shift", exact: true }).click();
      await accountPage.getByRole("button", { name: "Cancel", exact: true }).click(); assert.equal((await one("select status from cash_shifts where id=$1", [shiftId])).status, "closed");
      await accountPage.getByRole("button", { name: "Reconcile latest shift", exact: true }).click(); await accountPage.getByLabel("Reconciliation notes (optional)").fill("QA delivery reviewed cash refund");
      await accountPage.getByRole("button", { name: "Record reconciliation", exact: true }).click();
      const reconciled = await until(async () => { const row = await one("select * from cash_shifts where id=$1", [shiftId]); return row.status === "reconciled" && row; }, "reconciliation saved");
      assert.equal(reconciled.reconciled_by, users.accounting.id); assert.ok(reconciled.reconciled_at); assert.equal(Number(reconciled.expected_cash), 2750); assert.equal(Number(reconciled.variance), 0);
    });
    await check("Closed next steps route to prefilled handover, explicit receiver and persisted follow-up", async () => {
      const region = fdPage.getByRole("region", { name: "Drawer closed next steps" }); await region.getByRole("button", { name: "Add a concern", exact: true }).click();
      assert.equal(await fdPage.getByLabel("Source record reference").inputValue(), shiftId);
      await fdPage.getByLabel("Receiving staff").selectOption(users.peer.id); await fdPage.getByLabel("What needs attention?").fill("QA delivery follow-up: review the recorded cash payout with next cashier");
      await fdPage.locator(".hms-workflow form").getByRole("button").last().click();
      const handover = await until(() => one("select * from shift_handovers where source_id=$1", [shiftId]), "handover saved");
      assert.equal(handover.follow_up_user_id, users.peer.id); assert.equal(handover.submitted_by, users.fd.id); assert.equal(handover.source_type, "cash_shift"); assert.equal(handover.resolved_at, null);
      await nav(fdPage, "Cash & Shifts"); const card = fdPage.getByRole("region", { name: "Drawer closed next steps" }); await card.getByText(/1 unresolved handover/).waitFor();
      await shot(fdPage, "closed-with-unresolved-handover");
      return { handoverId: handover.id };
    });
    await check("Post-close report link selects actual hotel date; only explicit Submit stores snapshot", async () => {
      const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date((await one("select closed_at from cash_shifts where id=$1", [shiftId])).closed_at));
      await fdPage.getByRole("region", { name: "Drawer closed next steps" }).getByRole("button", { name: "Open daily report", exact: true }).click();
      assert.equal(await fdPage.getByLabel("Report date").inputValue(), reportDate); assert.equal((await one("select count(*)::int n from front_desk_reports")).n, 0);
      await fdPage.getByRole("button", { name: "Generate preview", exact: true }).click(); await fdPage.getByRole("button", { name: "Submit to Manager", exact: true }).waitFor();
      await shot(fdPage, "report-preview-real-data");
      await fdPage.getByRole("button", { name: "Submit to Manager", exact: true }).click(); await fdPage.getByRole("dialog", { name: "Submit report to Manager" }).getByRole("button", { name: "Submit to Manager", exact: true }).click();
      const report = await until(() => one("select * from front_desk_reports where report_date=$1", [reportDate]), "report snapshot saved");
      assert.equal(report.submitted_by, users.fd.id); assert.equal(Number(report.snapshot.cashShifts.expected), 2750); assert.equal(Number(report.snapshot.cashShifts.counted), 2750); assert.equal(Number(report.snapshot.cashShifts.variance), 0);
      return { reportId: report.id, reportDate };
    });
    await check("Daily report Cash received excludes refund payouts", async () => {
      const report = await one("select snapshot from front_desk_reports order by submitted_at desc limit 1");
      assert.equal(Number(report.snapshot.collections.byMethod.cash), 2000, "Cash received must be 2000; the 250 refund is outgoing");
    });
    await check("Manager sees and acknowledges the stored snapshot without rewriting it", async () => {
      const row = await one("select * from front_desk_reports order by submitted_at desc limit 1"), before = JSON.stringify(row.snapshot);
      const managerPage = await manager.newPage(); await managerPage.goto(origin + "/manager_dashboard"); await nav(managerPage, "Reports");
      const table = managerPage.getByRole("table", { name: "Front desk report history" }); await table.getByText("QA Delivery fd", { exact: true }).waitFor();
      const historyRow = table.getByRole("row").filter({ hasText: "QA Delivery fd" }); await historyRow.getByRole("button", { name: "Acknowledge", exact: true }).click();
      await managerPage.getByRole("dialog", { name: "Acknowledge report" }).getByRole("button", { name: "Acknowledge", exact: true }).click();
      const after = await until(async () => { const value = await one("select * from front_desk_reports where id=$1", [row.id]); return value.status === "acknowledged" && value; }, "Manager review saved");
      assert.equal(after.reviewed_by, users.manager.id); assert.ok(after.reviewed_at); assert.equal(JSON.stringify(after.snapshot), before); await managerPage.close();
    });
    await check("Receiving cashier acknowledges and resolves the linked handover explicitly", async () => {
      const handover = await one("select * from shift_handovers where source_id=$1", [shiftId]);
      const peerPage = await peer.newPage(); await peerPage.goto(origin + "/manager_dashboard"); await nav(peerPage, "Operational Handover");
      const item = peerPage.locator("#cash-follow-up-" + handover.id); await item.getByRole("button", { name: "Acknowledge", exact: true }).click();
      await until(async () => (await one("select acknowledged_by from shift_handovers where id=$1", [handover.id])).acknowledged_by === users.peer.id, "handover acknowledged");
      await item.getByRole("button", { name: "Record resolution", exact: true }).click(); await peerPage.getByLabel("Resolution note").fill("QA delivery resolved with the next cashier"); await peerPage.getByRole("button", { name: "Resolve follow-up", exact: true }).click();
      const resolved = await until(async () => { const row = await one("select * from shift_handovers where id=$1", [handover.id]); return row.resolved_at && row; }, "handover resolved");
      assert.equal(resolved.acknowledged_by, users.peer.id); assert.equal(resolved.version, 3); assert.equal(Number((await one("select variance from cash_shifts where id=$1", [shiftId])).variance), 0); await peerPage.close();
    });
    await nav(fdPage, "Cash & Shifts");
    for (const width of [1440, 1024, 768, 390, 320]) {
      await check("Cash workspace arrangement light/dark at " + width + "px", async () => {
        await fdPage.setViewportSize({ width, height: width > 600 ? 900 : 844 });
        const clipping = await fdPage.locator(".app-header .header-actions button").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ name: element.getAttribute("aria-label") || element.textContent.trim(), x: element.getBoundingClientRect().x, right: element.getBoundingClientRect().right, width: innerWidth })).filter(rect => rect.x < 0 || rect.right > rect.width));
        ui.push({ label: "header-" + width, clippedControls: clipping });
        if (clipping.length) issues.push({ severity: "P2", name: "Header controls clipped", viewport: width, controls: clipping });
        await auditLayout(fdPage, "light-" + width); await shot(fdPage, "cash-light-" + width);
        if (width === 320) await fdPage.setViewportSize({ width: 390, height: 844 });
        await fdPage.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
        await fdPage.setViewportSize({ width, height: width > 600 ? 900 : 844 }); await auditLayout(fdPage, "dark-" + width); await shot(fdPage, "cash-dark-" + width);
        if (width === 320) await fdPage.setViewportSize({ width: 390, height: 844 });
        await fdPage.getByRole("button", { name: "Switch to light mode", exact: true }).click();
      });
    }
    await check("Header controls remain inside the viewport across tested widths", async () => {
      const clipped = ui.filter(row => row.clippedControls?.length); assert.deepEqual(clipped, [], "Global header contains clipped controls");
    });
    await check("A separate shortage preserves count explanation and original variance after reconciliation", async () => {
      await nav(accountPage, "Cash & Shifts"); await accountPage.getByRole("button", { name: "Refresh cash ledger", exact: true }).click();
      await accountPage.getByRole("button", { name: "Open cash shift", exact: true }).first().click();
      await accountPage.getByLabel("Opening cash float (PHP)").fill("1000"); await accountPage.getByLabel("Cash point / location (optional)").fill("QA variance drawer"); await accountPage.getByRole("button", { name: "Open shift", exact: true }).click();
      const second = await until(() => one("select * from cash_shifts where status='open'"), "second drawer opened");
      await accountPage.getByRole("button", { name: "Review count & close", exact: true }).first().click();
      await accountPage.getByLabel("Physical cash counted (PHP)").fill("990"); await accountPage.getByLabel("Count note / variance explanation").fill("QA physical count is ten pesos short");
      await accountPage.getByRole("button", { name: "Close shared drawer", exact: true }).click();
      const closed = await until(async () => { const row = await one("select * from cash_shifts where id=$1", [second.id]); return row.status === "closed" && row; }, "shortage close saved");
      assert.equal(Number(closed.expected_cash), 1000); assert.equal(Number(closed.actual_cash), 990); assert.equal(Number(closed.variance), -10); assert.equal(closed.close_notes, "QA physical count is ten pesos short");
      await accountPage.getByRole("button", { name: "Reconcile latest shift", exact: true }).click(); await accountPage.getByLabel("Reconciliation notes (required)").fill("QA shortage reviewed and retained"); await accountPage.getByRole("button", { name: "Record reconciliation", exact: true }).click();
      const reconciled = await until(async () => { const row = await one("select * from cash_shifts where id=$1", [second.id]); return row.status === "reconciled" && row; }, "shortage review saved");
      assert.equal(Number(reconciled.variance), -10); assert.equal(reconciled.close_notes, closed.close_notes); assert.equal(reconciled.reconciled_by, users.accounting.id); assert.ok(reconciled.reconciled_at);
      await shot(accountPage, "shortage-reconciled"); return { shiftId: second.id, variance: reconciled.variance };
    });
    await check("Independent connection reads committed final destinations", async () => {
      const reader = new pg.Client({ ...connection, database }); await reader.connect();
      try {
        const shift = (await reader.query("select * from cash_shifts where id=$1", [shiftId])).rows[0];
        assert.equal(shift.status, "reconciled"); assert.equal(Number(shift.expected_cash), 2750);
        assert.equal(Number((await reader.query("select paid from invoices where id=$1", [invoice])).rows[0].paid), 1649.75);
        assert.equal((await reader.query("select count(*)::int n from refund_attempts where refund_request_id in(select id from refund_requests where invoice_id=$1)", [invoice])).rows[0].n, 2);
      } finally { await reader.end(); }
    });
    assert.deepEqual(runtimeErrors, []); console.log("PASS no uncaught financial page runtime errors");
    fs.writeFileSync(path.join(work, "readback.json"), JSON.stringify({ shift: await one("select * from cash_shifts where id=$1", [shiftId]), draft: await one("select * from cash_count_drafts where cash_shift_id=$1", [shiftId]), refund: await one("select method,cash_shift_id,received_by,amount,reference from payments where idempotency_key=$1", [refundId]), receipt: await one("select document_number,payment_id,reservation_id from financial_documents where payment_id=$1", [paymentId]), handovers: (await q("select * from shift_handovers")).rows, reports: (await q("select id,report_date,submitted_by,status,snapshot from front_desk_reports")).rows }, null, 2));
    if (checks.some(check => check.result === "FAIL")) process.exitCode = 1;
  }
  fs.writeFileSync(path.join(work, "fixture.json"), JSON.stringify({ database, reservation, invoice, users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, name: user.name, role: user.role }])) }, null, 2));
} catch (error) { issues.push({ phase: "harness", message: error.message }); console.error("ERROR " + error.message); process.exitCode = 1; }
finally {
  fs.writeFileSync(path.join(work, "results.json"), JSON.stringify({ date: new Date().toISOString(), database, checks, issues, ui }, null, 2));
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close();
  for (const process of children.reverse()) if (process.exitCode === null) { try { execFileSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { process.kill(); } }
  if (gateway) { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); }
  if (db) await db.end();
  for (const file of logFiles) fs.closeSync(file);
  if (startedPg) { try { execFileSync(pgCtl, ["-D", pgData, "-m", "fast", "-w", "stop"], { windowsHide: true }); } catch {} }
}
