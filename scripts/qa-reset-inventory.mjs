// QA reset inventory — READ ONLY. Counts booking-related rows per table and
// status on the linked Supabase project. Never writes. Run:
//   node scripts/qa-reset-inventory.mjs
// Reads credentials from .env.local (same pairing rule as lib/env.ts).
import { readFileSync, existsSync } from "node:fs";
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
  console.error("Missing Supabase credentials: set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function tally(table, column) {
  const { data, error } = await db.from(table).select(column).limit(10000);
  if (error) return { table, error: error.message };
  const counts = {};
  for (const row of data ?? []) {
    const value = String(row[column] ?? "null");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return { table, total: (data ?? []).length, counts };
}

const targets = [
  ["reservations", "status"],
  ["booking_holds", "status"],
  ["reservation_change_requests", "status"],
  ["reservation_room_assignments", "status"],
  ["guest_requests", "status"],
  ["housekeeping_tasks", "status"],
  ["maintenance_orders", "status"],
  ["transportation_requests", "status"],
  ["rooms", "status"],
  ["rooms", "housekeeping"],
  ["invoices", "status"],
  ["payments", "status"],
];

console.log("QA reset inventory (read-only) —", new Date().toISOString());
for (const [table, column] of targets) {
  const result = await tally(table, column);
  if (result.error) console.log(`- ${table}.${column}: ERROR ${result.error}`);
  else console.log(`- ${table}.${column}: total=${result.total} ${JSON.stringify(result.counts)}`);
}
// Rooms retired from inventory (config, not bookings — left alone by default).
{
  const { count, error } = await db.from("rooms").select("id", { count: "exact", head: true }).eq("administratively_active", false);
  console.log(error ? `- rooms retired: ERROR ${error.message}` : `- rooms administratively_active=false: ${count}`);
}
{
  const { count, error } = await db.from("guest_requests").select("id", { count: "exact", head: true }).eq("approval_status", "pending");
  console.log(error ? `- guest_requests approval pending: ERROR ${error.message}` : `- guest_requests approval_status=pending: ${count}`);
}
