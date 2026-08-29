// Sets or locks staff account passwords in the linked Supabase project.
//
// The consolidated schema used to seed every role account with one shared bcrypt
// hash, and that file is public on GitHub — so any deployment built from it had a
// guessable Owner login. Passwords now live only in the database, are typed
// interactively by a human, and are never generated, printed, logged or committed.
//
// Usage (run directly in your own terminal — it needs a TTY):
//   node scripts/set-passwords.mjs --list
//   node scripts/set-passwords.mjs owner@haven.test
//   node scripts/set-passwords.mjs --lock guest@haven.test admin@haven.test
//
// Accounts are only ever touched when named explicitly on the command line, so
// real registered users cannot be modified by accident.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const MIN_LENGTH = 12;
const LOCKED = "locked-run-set-passwords";

// Hashes known to be public via Git history, plus the plaintexts they came from.
// Refusing them stops a "rotation" that quietly restores the leaked credential.
const KNOWN_LEAKED = ["demo123", "ChangeMe123!", "changeme", "password"];

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

/** Reads a line with echo suppressed, so the password never appears on screen. */
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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const lockMode = args.includes("--lock");
const listMode = args.includes("--list");
const emails = args.filter((a) => !a.startsWith("--")).map((a) => a.trim().toLowerCase());

const { data: accounts, error: readError } = await supabase
  .from("user_accounts")
  .select("id,email,role,active,password_hash")
  .order("role");
if (readError) throw new Error(`Could not read user_accounts: ${readError.message}`);

if (listMode || !emails.length) {
  console.log("\nAccounts in user_accounts:\n");
  console.log("  role          email                          active  password");
  for (const a of accounts) {
    const weak = KNOWN_LEAKED.some((p) => { try { return bcrypt.compareSync(p, a.password_hash); } catch { return false; } });
    const state = a.password_hash === LOCKED ? "locked" : weak ? "PUBLICLY KNOWN" : "set";
    console.log(`  ${a.role.padEnd(13)} ${a.email.padEnd(30)} ${String(a.active).padEnd(6)}  ${state}`);
  }
  console.log(`\nSet one:  node scripts/set-passwords.mjs <email>`);
  console.log(`Lock one: node scripts/set-passwords.mjs --lock <email>\n`);
  process.exit(0);
}

const targets = accounts.filter((a) => emails.includes(a.email.toLowerCase()));
const missing = emails.filter((e) => !targets.some((a) => a.email.toLowerCase() === e));
if (missing.length) throw new Error(`Not found in user_accounts: ${missing.join(", ")}`);

let changed = 0;
for (const account of targets) {
  if (lockMode) {
    // `lib/auth.ts` evaluates `active` before bcrypt, so a locked row cannot
    // authenticate even though the stored value is not a valid hash.
    const { error } = await supabase
      .from("user_accounts")
      .update({ password_hash: LOCKED, active: false })
      .eq("id", account.id);
    if (error) throw new Error(`Failed to lock ${account.email}: ${error.message}`);
    console.log(`  locked   ${account.email} (${account.role})`);
    changed += 1;
    continue;
  }

  const password = await askHidden(`  New password for ${account.email} (${account.role}): `);
  if (password.length < MIN_LENGTH) {
    console.error(`  SKIPPED ${account.email}: needs at least ${MIN_LENGTH} characters.`);
    continue;
  }
  if (KNOWN_LEAKED.includes(password)) {
    console.error(`  SKIPPED ${account.email}: that password is public in this repository's history.`);
    continue;
  }
  const again = await askHidden(`  Confirm: `);
  if (password !== again) {
    console.error(`  SKIPPED ${account.email}: entries did not match.`);
    continue;
  }

  // Cost 12 matches app/api/register/route.ts so staff and guest hashes are comparable.
  const passwordHash = await bcrypt.hash(password, 12);
  const { error } = await supabase
    .from("user_accounts")
    .update({ password_hash: passwordHash, active: true })
    .eq("id", account.id);
  if (error) throw new Error(`Failed to update ${account.email}: ${error.message}`);
  console.log(`  updated  ${account.email} (${account.role}) — active, bcrypt cost 12`);
  changed += 1;
}

console.log(`\n${changed} account(s) changed. Passwords were never displayed or stored outside the database.`);
if (!lockMode && changed) {
  console.log("Existing JWT sessions survive a password change — rotate NEXTAUTH_SECRET to invalidate them.\n");
}
