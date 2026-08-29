// Read-only row census of the linked Supabase project. Writes nothing.
// Used to prove a migration preserved existing reservation, payment and audit data:
//
//   node scripts/row-counts.mjs > before.txt   # then apply the migration
//   node scripts/row-counts.mjs               # compare
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "user_accounts", "guests", "rooms", "room_types", "reservations", "invoices",
  "payments", "refund_requests", "folio_charges", "financial_adjustments",
  "financial_documents", "guest_requests", "reservation_change_requests",
  "manager_approval_requests", "reservation_room_assignments", "booking_holds",
  "housekeeping_tasks", "maintenance_orders", "audit_logs",
];

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

for (const table of TABLES) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  console.log(`${table.padEnd(32)} ${error ? `- ${error.message}` : count}`);
}
