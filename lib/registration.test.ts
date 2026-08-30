import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// The route's only writer is the register_guest_account RPC, so the mock records
// what it is handed. That is what proves the password never leaves as plaintext.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const { POST } = await import("@/app/api/register/route");
const { canAccess } = await import("@/lib/permissions");

const migration = readFileSync("supabase/migrations/20260830020000_repoint_legacy_user_account_fks.sql", "utf8");
const guestWorkflows = readFileSync("supabase/migrations/20260829041000_customer_guest_workflows.sql", "utf8");

const PASSWORD = "haven guest passphrase";
const valid = {
  firstName: "Maria", lastName: "Santos", phone: "+639171234567",
  email: "Maria.Santos@Example.com", password: PASSWORD, confirmPassword: PASSWORD,
};
const post = (body: unknown) =>
  POST(new Request("http://haven.local/api/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });

describe("guest registration succeeds and stays a guest", () => {
  it("creates the account through the atomic RPC and returns 201", async () => {
    const response = await post(valid);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("register_guest_account");
  });

  it("hands the database a bcrypt hash and never the plaintext password", async () => {
    await post(valid);
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_password_hash).toMatch(/^\$2[aby]?\$/);
    expect(args.p_password_hash).not.toBe(PASSWORD);
    expect(JSON.stringify(args)).not.toContain(PASSWORD);
  });

  it("normalises the email so duplicates cannot slip in on casing", async () => {
    await post(valid);
    expect((rpc.mock.calls[0][1] as Record<string, string>).p_email).toBe("maria.santos@example.com");
  });

  it("performs exactly one write call, so a failure cannot half-create an account", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    const response = await post(valid);
    expect(response.status).toBe(500);
    // A second call here would mean the route tried to patch up partial state
    // itself instead of relying on the RPC's all-or-nothing transaction.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("grants the new account guest permissions only", () => {
    expect(guestWorkflows).toContain("insert into user_accounts(email,name,role,password_hash,active)values(email_value,full_name,'guest'");
    for (const resource of ["rooms", "guests", "payments", "refunds", "staff", "inventory",
      "housekeeping_tasks", "maintenance_orders", "guest_requests"] as const) {
      expect(canAccess("guest", resource)).toBe(false);
    }
    expect(canAccess("guest", "reservations")).toBe(true);
    expect(canAccess("guest", "invoices")).toBe(true);
  });
});

describe("registration rejects bad input without a 500", () => {
  const cases: [string, Record<string, string>][] = [
    ["a malformed email", { ...valid, email: "not-an-email" }],
    ["a phone number below the accepted length", { ...valid, phone: "12" }],
    ["a password under eight characters", { ...valid, password: "short", confirmPassword: "short" }],
    ["a missing first name", { ...valid, firstName: "  " }],
  ];
  for (const [label, body] of cases) {
    it(`answers 400 for ${label} and never reaches the database`, async () => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    });
  }

  it("reports mismatched confirmation before hashing anything", async () => {
    const response = await post({ ...valid, confirmPassword: `${PASSWORD}-different` });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Passwords do not match." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats an RPC-side validation refusal as 400, not a server fault", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "INVALID_REGISTRATION" } });
    expect((await post(valid)).status).toBe(400);
  });
});

describe("duplicate registration is a conflict, not a crash", () => {
  it("maps the RPC's ACCOUNT_EXISTS guard to 409", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ACCOUNT_EXISTS" } });
    const response = await post(valid);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "An account with this email already exists." });
  });

  it("maps a unique-violation race to the same 409", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "user_accounts_email_key"' } });
    expect((await post(valid)).status).toBe(409);
  });
});

describe("an unexpected database failure is safe and diagnosable", () => {
  it("returns a generic 500 that leaks no password, hash or database detail", async () => {
    const dbMessage = 'insert or update on table "audit_logs" violates foreign key constraint "audit_logs_user_id_fkey"';
    rpc.mockResolvedValue({ data: null, error: { code: "23503", message: dbMessage } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post(valid);
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).toBe(JSON.stringify({ error: "We could not create your account. Please try again." }));
    expect(body).not.toContain(PASSWORD);
    expect(body).not.toContain("$2");
    expect(body).not.toContain("audit_logs");
    vi.mocked(console.error).mockRestore();
  });

  it("logs the failing stage and database code for operators, without credentials", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => { logged.push(String(line)); });
    await post(valid);
    vi.mocked(console.error).mockRestore();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("stage=register_guest_account");
    expect(logged[0]).toContain("db_code=23503");
    expect(logged[0]).not.toContain(PASSWORD);
    expect(logged[0]).not.toContain("$2");
    expect(logged[0]).not.toContain(valid.email);
  });

  it("never logs the Postgres detail field, which echoes column values", async () => {
    const detail = 'Key (user_id)=(43cc4cf8-9d24-4eef-904f-298546248087) is not present in table "app_users".';
    rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint", detail } });
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => { logged.push(String(line)); });
    await post(valid);
    vi.mocked(console.error).mockRestore();
    expect(logged.join("\n")).not.toContain(detail);
    expect(logged.join("\n")).not.toContain("43cc4cf8");
  });
});

describe("the legacy foreign-key repoint is additive and reversible in intent", () => {
  it("repoints every constraint that still referenced the consolidated table", () => {
    for (const constraint of ["audit_logs_user_id_fkey", "guest_requests_assigned_to_fkey",
      "payments_received_by_fkey", "purchase_orders_ordered_by_fkey", "staff_user_id_fkey"]) {
      expect(migration).toContain(constraint);
    }
    expect(migration).toContain("references public.user_accounts(id)");
  });

  it("only rewrites a constraint that still points at app_users, so re-running is a no-op", () => {
    expect(migration).toContain("ref.relname = 'app_users'");
    expect(migration).toContain("if exists (");
  });

  it("preserves each constraint's original on-delete behaviour", () => {
    expect(migration).toContain("'audit_logs',      'audit_logs_user_id_fkey',           'user_id',     ' on delete set null'");
    expect(migration).toContain("'staff',           'staff_user_id_fkey',                'user_id',     ' on delete set null'");
  });

  it("touches no data and leaves the legacy table in place", () => {
    // Scan the executable statements only: the header comment describes the
    // destructive operations this migration deliberately avoids.
    const sql = migration.split(/\r?\n/).filter((line) => !line.trim().startsWith("--"))
      .join("\n").toLowerCase();
    for (const forbidden of ["drop table", "truncate", "delete from", "drop column",
      "drop schema", "insert into", "update public", "drop constraint if exists"]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).toContain("app_users");
    expect(sql).not.toContain("drop table public.app_users");
  });
});
