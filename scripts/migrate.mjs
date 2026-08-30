import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

const env = parseEnv(path.join(process.cwd(), ".env.local"));
const direct = env.DIRECT_URL;
if (!direct) throw new Error("DIRECT_URL missing in .env.local");

const m = direct.match(/^postgresql:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/(.+?)(\?.*)?$/);
if (!m) throw new Error("Could not parse DIRECT_URL");
const [, user, password, host, port, database] = m;

const client = new pg.Client({
  user: decodeURIComponent(user),
  password: decodeURIComponent(password),
  host,
  port: Number(port),
  database,
  ssl: { rejectUnauthorized: false }
});

// Defaults to the rolled-up snapshot; pass a path to apply one migration file
// instead, e.g. `npm run migrate -- supabase/migrations/20260830020000_*.sql`.
// Postgres wraps the whole multi-statement body in one implicit transaction, so a
// failure part-way through leaves the database untouched.
const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(process.cwd(), "supabase", "schema.sql");

await client.connect();
const sql = fs.readFileSync(target, "utf8");
await client.query(sql);

const tables = await client.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`
);
console.log(`Applied ${path.basename(target)}. Public tables:`);
for (const r of tables.rows) console.log(" -", r.table_name);
await client.end();
