import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import { chromium } from "@playwright/test";

const origin = "http://127.0.0.1:4179";
const password = randomBytes(20).toString("hex");
const hash = await bcrypt.hash(password, 12);
const roles = ["front_desk", "manager", "owner", "guest"];
const users = Object.fromEntries(roles.map(role => [role, {
  id: randomUUID(), role, name: `Smoke ${role}`, email: `${role}@example.invalid`, password_hash: hash,
  active: true, account_status: "active", recovery_required: false, auth_version: 1,
}]));
const backup = { ...users.manager, id: randomUUID(), name: "Smoke backup Manager", email: "backup@example.invalid" };
const bookingFixture = { id: "RSV-SMOKE-PDF", confirmation_number: "HVN-SMOKE-PDF", user_id: users.guest.id,
  guest_name: users.guest.name, status: "confirmed", room_type: "Deluxe King", check_in: "2026-11-25",
  check_out: "2026-11-27", guests: 2, total: 6200 };
const mockRows = {
  user_accounts: [...Object.values(users), backup],
  security_policies: [{ key: "default", otp_ttl_seconds: 300, otp_resend_cooldown_seconds: 60, otp_max_attempts: 5,
    cookie_enabled: true, idle_timeout_minutes: 30, absolute_session_minutes: 120, login_otp_enabled: false, version: 1 }],
  rooms: [{ id: "QA-ROOM", number: "701", floor: 7, type: "Deluxe King", status: "available", housekeeping: "clean", administratively_active: true }],
  room_types: [{ name: "Deluxe King", badge_color_key: "ocean", photo_urls: [] }],
  reservations: [bookingFixture, { ...bookingFixture, id: "RSV-SMOKE-OTHER", user_id: randomUUID() }],
  payments: [{ id: randomUUID(), reservation_id: bookingFixture.id, status: "paid", purpose: "reservation_deposit", amount: 1860 }],
};
const calls = [];
const backend = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const name = url.pathname.split("/").at(-1);
  const rpc = url.pathname.includes("/rpc/");
  let headers = { "content-type": "application/json" };
  let value = null;
  let status = 200;
  if (rpc) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const args = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    calls.push({ name, actor: args.p_actor });
    if (name === "consume_auth_request_budget") value = true;
    if (name === "hotel_operating_day_coverage") {
      value = { version: 1, primaryId: users.manager.id, backupId: backup.id,
        candidates: [users.manager, backup].map(({ id, name }) => ({ id, name })) };
    }
    if (name === "hotel_front_office_booking_page") value = { rows: [], daily: [], counts: {}, total: 0, page: 1 };
    if (name === "hotel_operating_day") value = { active: true, lagging: false, businessDate: "2026-11-23", calendarDate: "2026-11-24" };
    if (name === "hotel_night_audit_preview") value = { active: true, canManage: args.p_actor === users.manager.id,
      businessDate: "2026-11-23", calendarDate: "2026-11-24", version: 1, blockers: [], warnings: [], metrics: null, recentCloses: [] };
    if (name === "hotel_night_audit_close") {
      if (args.p_actor !== users.manager.id) {
        value = { code: "P0001", message: "OPERATING_DAY_FORBIDDEN" };
        status = 400;
      } else value = { business_date: args.p_date, closed_by: args.p_actor };
    }
  } else {
    let rows = mockRows[name] ?? [];
    for (const [field, filter] of url.searchParams) {
      if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[field]) === filter.slice(3));
    }
    const total = rows.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? total);
    rows = rows.slice(offset, offset + limit);
    headers = { ...headers, "content-range": rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` };
    value = request.headers.accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows;
  }
  response.writeHead(status, headers).end(JSON.stringify(value));
});

await new Promise((resolve, reject) => { backend.once("error", reject); backend.listen(0, "127.0.0.1", resolve); });
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4179"], {
  env: {
    ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: randomBytes(36).toString("hex"),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`,
    SUPABASE_SERVICE_ROLE_KEY: "browser-fixture-only",
  }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let logs = "";
for (const stream of [app.stdout, app.stderr]) stream.on("data", chunk => { logs = (logs + chunk).slice(-4000); });

let browser;
async function login(context, role) {
  const { csrfToken } = await (await context.request.get("/api/auth/csrf")).json();
  await context.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, callbackUrl: `${origin}/auth/continue`, email: users[role].email, password, json: "true" },
  });
  const session = await (await context.request.get("/api/auth/session")).json();
  assert.equal(session.user?.role, role, `Credentials session for ${role}`);
}

async function checkRackBadge(page) {
  const navigation = page.getByRole("navigation", { name: "Modules" });
  const frontOffice = navigation.getByRole("button", { name: /^Front Office/ });
  const roomManagement = navigation.getByTitle("Room Management", { exact: true });
  await frontOffice.waitFor({ timeout: 10000 });
  for (let attempt = 0; attempt < 3 && await frontOffice.getAttribute("aria-expanded") === "false"; attempt++) {
    await frontOffice.click();
    await frontOffice.and(navigation.locator('[aria-expanded="true"]')).waitFor({ timeout: 2000 }).catch(() => {});
  }
  assert.equal(await roomManagement.count(), 1, `Room Management is present in Front Office (${await navigation.innerText()})`);
  await roomManagement.click({ timeout: 10000 });
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Room 701" }) });
  const badge = card.locator(".room-type.rt-ocean");
  await badge.waitFor();
  const contrast = await badge.evaluate(element => {
    const scratch = document.createElement("canvas");
    const ctx = scratch.getContext("2d");
    const luma = color => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const style = getComputedStyle(element);
    const foreground = luma(style.color);
    const background = luma(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  assert.ok(contrast >= 4.5, `Room type badge text contrast ${contrast.toFixed(2)}:1`);
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && app.exitCode === null; attempt++) {
    ready = await fetch(`${origin}/api/auth/csrf`, { signal: AbortSignal.timeout(1000) }).then(result => result.ok, () => false);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(ready, `Built application did not start. ${logs}`);
  browser = await chromium.launch({ executablePath: process.env.HAVEN_BROWSER_PATH || undefined });
  for (const role of roles) {
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 850 }, reducedMotion: "reduce" });
    try {
      await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
      await login(context, role);
      assert.equal((await context.request.get("/api/accounting/ledger")).status(), role === "owner" ? 200 : 403);
      assert.equal((await context.request.get("/api/owner/operating-day-coverage")).status(), role === "owner" ? 200 : 403);
      if (role === "guest") {
        const pdf = await context.request.get(`/api/documents/booking-confirmation/${bookingFixture.id}`);
        assert.equal(pdf.status(), 200);
        assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
        assert.equal((await context.request.get("/api/documents/booking-confirmation/RSV-SMOKE-OTHER")).status(), 404);
      }
      if (role === "manager" || role === "front_desk") {
        const page = await context.newPage();
        assert.equal((await page.goto("/manager_dashboard", { waitUntil: "domcontentloaded" })).status(), 200);
        await page.getByRole("main").waitFor();
        const { data } = await (await context.request.get("/api/staff/night-audit")).json();
        assert.equal(data.canManage, role === "manager");
        const result = await context.request.post("/api/staff/night-audit/close", {
          data: { businessDate: "2026-11-23", expectedVersion: 1, idempotencyKey: randomUUID() },
        });
        assert.equal(result.status(), role === "manager" ? 200 : 403);
        assert.equal(await page.locator("[aria-hidden=true]").filter({ has: page.getByRole("main", { includeHidden: true }) }).count(), 0);
        if (role === "front_desk") {
          const artifacts = process.env.HAVEN_SMOKE_ARTIFACTS;
          if (artifacts) await mkdir(artifacts, { recursive: true });
          await checkRackBadge(page);
          if (artifacts) await page.screenshot({ path: `${artifacts}/room-rack-light.png` });
          await page.evaluate(() => window.localStorage.setItem("haven-dashboard-theme", "dark"));
          await page.goto("/manager_dashboard", { waitUntil: "domcontentloaded" });
          await checkRackBadge(page);
          if (artifacts) await page.screenshot({ path: `${artifacts}/room-rack-dark.png` });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.getByRole("heading", { name: "Room 701" }).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          for (const action of ["Scan QR", "New booking"]) {
            const label = page.getByRole("button", { name: action, exact: true }).locator("span");
            assert.ok(await label.evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 12));
          }
          assert.ok((await page.locator(".room-management-workspace > .page-header").boundingBox()).height < 200);
          if (artifacts) await page.screenshot({ path: `${artifacts}/room-rack-mobile.png` });
          console.log("PASS Room Rack type color and text contrast in light and dark themes");
        }
      }
      console.log(`PASS signed-in ${role} product and authorization checks`);
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(calls.filter(call => call.name === "hotel_night_audit_close"), [{ name: "hotel_night_audit_close", actor: users.manager.id }]);
} catch (error) {
  console.error(String(error).split("\n").slice(0, 3).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  app.kill();
  await new Promise(resolve => backend.close(resolve));
}
