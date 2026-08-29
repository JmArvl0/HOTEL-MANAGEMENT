// Verifies what `lib/auth.ts` would decide for a given credential, against the
// linked Supabase project. Read-only: it never writes, and prints only a verdict.
//
//   node scripts/verify-auth.mjs --leaked          # test every publicly-known password
//   node scripts/verify-auth.mjs owner@haven.test  # prompts, echo off
//
// Mirrors authorize() in lib/auth.ts exactly: fetch by email, require `active`,
// then bcrypt.compare. `active` is checked first, so a locked row never reaches bcrypt.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

// Already public in this repository's Git history — not secrets.
const LEAKED = ["demo123", "ChangeMe123!", "changeme", "password", "admin123"];

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("No interactive terminal. Run this directly in your shell, not through a tool or pipe."));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (chunk) => { if (!muted) rl.output.write(chunk); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
    muted = true;
  });
}

const env = parseEnv(path.join(process.cwd(), ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** The authorize() decision from lib/auth.ts, reproduced exactly. */
async function authorize(email, password) {
  const { data } = await supabase
    .from("user_accounts")
    .select("id,email,name,role,password_hash,active")
    .eq("email", email)
    .maybeSingle();
  if (!data) return { ok: false, why: "no such account" };
  if (!data.active) return { ok: false, why: "account inactive", role: data.role };
  let match = false;
  try { match = await bcrypt.compare(password, data.password_hash); } catch { match = false; }
  return match ? { ok: true, role: data.role } : { ok: false, why: "password mismatch", role: data.role };
}

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));

if (args.includes("--leaked")) {
  const { data: accounts } = await supabase.from("user_accounts").select("email,role").order("role");
  let breaches = 0;
  console.log("\nTesting every account against every publicly-known password:\n");
  for (const account of accounts) {
    const hits = [];
    for (const password of LEAKED) {
      const result = await authorize(account.email, password);
      if (result.ok) hits.push(password);
    }
    if (hits.length) {
      breaches += 1;
      console.log(`  BREACH   ${account.email.padEnd(30)} (${account.role}) authenticates with a public password`);
    } else {
      console.log(`  ok       ${account.email.padEnd(30)} (${account.role})`);
    }
  }
  console.log(`\n${breaches === 0 ? "PASS — no account authenticates with any publicly-known password." : `FAIL — ${breaches} account(s) still reachable with a public password.`}\n`);
  process.exit(breaches === 0 ? 0 : 1);
}

if (!email) throw new Error("Usage: node scripts/verify-auth.mjs <email> | --leaked");

const password = await askHidden(`  Password for ${email}: `);
const result = await authorize(email, password);
console.log(
  result.ok
    ? `  SIGN-IN SUCCEEDS — role: ${result.role}`
    : `  SIGN-IN REJECTED — ${result.why}${result.role ? ` (role: ${result.role})` : ""}`,
);
