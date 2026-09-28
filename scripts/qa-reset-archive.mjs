// QA reset archiver — READ ONLY. Exports booking-related tables to
// git-ignored legacy-archive/ + manifest.json (counts + SHA-256). Run:
//   node scripts/qa-reset-archive.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (value && process.env[key] == null) process.env[key] = value;
  }
}
loadEnvFile(".env.local");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}
// Never log the project URL or key: derive a non-sensitive output label only.
const projectRef = createHash("sha256").update(url).digest("hex").slice(0, 12);
const db = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "reservations",
  "booking_holds",
  "reservation_change_requests",
  "reservation_room_assignments",
  "guest_requests",
  "housekeeping_tasks",
  "maintenance_orders",
  "maintenance_order_events",
  "transportation_requests",
  "rooms",
  "invoices",
  "payments",
];

const dir = `legacy-archive/${new Date().toISOString().slice(0, 10)}-${projectRef}`;
mkdirSync(dir, { recursive: true });

const manifest = { exportedAt: new Date().toISOString(), projectRef, files: {} };
for (const table of TABLES) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) {
      console.error(`ERROR exporting ${table}: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    from += 1000;
  }
  const json = JSON.stringify(rows);
  const sha = createHash("sha256").update(json).digest("hex");
  writeFileSync(`${dir}/${table}.json`, json);
  manifest.files[table] = { rows: rows.length, sha256: sha };
  console.log(`- ${table}: ${rows.length} rows, sha256 ${sha.slice(0, 12)}…`);
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${dir}/manifest.json`);
