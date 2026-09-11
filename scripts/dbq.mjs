// One-off remote SQL runner (Phase 3 audits). Usage:
//   node --env-file=.env.local scripts/dbq.mjs "select ..."   (or pipe file path)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
    .filter((line) => /^[A-Za-z_]/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
const m = env.DIRECT_URL.match(/^postgresql:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/(.+?)(\?.*)?$/);
const client = new pg.Client({ user: decodeURIComponent(m[1]), password: decodeURIComponent(m[2]), host: m[3], port: Number(m[4]), database: m[5], ssl: { rejectUnauthorized: false } });
await client.connect();
const sql = process.argv[2]?.startsWith("-f") ? fs.readFileSync(path.resolve(process.argv[3]), "utf8") : process.argv[2];
const result = await client.query(sql);
const columns = result.fields?.map((field) => field.name) ?? [];
if (result.rows.length === 0) console.log(`OK (${result.command}, rowCount ${result.rowCount})`);
else if (columns.length === 1) { for (const row of result.rows) console.log(row[columns[0]]); } // raw text (function bodies etc.)
else console.table(result.rows);
await client.end();
