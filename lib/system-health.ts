// Admin System Health: shared types for /api/admin/data?section=system and the
// dashboard view. Pure derivation only — all I/O lives in the route.
//
// Unknown-first rule: every section the system cannot honestly measure reports
// "unknown" (or "not configured" / "not connected") instead of fabricated
// health. No section ever carries a secret value — presence flags only.

export type MigrationLedgerRow = {
  version: string;
  name: string;
  // First-seen date tracked by migration_apply_log (see 20261024010000).
  // Null when the ledger predates tracking; approximate rows were backfilled
  // and mark the first recording, not the true apply time.
  appliedAt: string | null;
  approximate?: boolean;
};

export type SystemHealth = {
  db: { live: boolean; latencyMs: number | null; checkedAt: string; error?: string };
  activity: { lastAuditAt: string | null; auditEvents24h: number; pendingApprovals: number };
  migrations: {
    applied: MigrationLedgerRow[];
    appliedCount: number;
    localCount: number | null; // null when local migration files are unavailable
    status: MigrationStatus;
    pending?: MigrationLedgerRow[];
  };
  // Extended sections (Q2). All optional so older payloads still render.
  application?: { environment: string; version: string; commit: string | null };
  storage?: { status: "operational" | "unavailable" | "unknown" };
  email?: { status: "configured" | "not_configured" };
  // Scheduled jobs, with the last run read from the table each job already
  // writes (see the route). `lastRunLabel` names what the timestamp actually
  // means per job — guest reminders only insert a row on a real send, so its
  // newest row is the last SEND, not the last attempt. No row at all stays
  // null/unknown rather than being reported as a success.
  automations?: {
    name: string;
    schedule: string;
    lastRun: string | null;
    lastRunLabel: string;
    lastStatus: AutomationRunStatus;
  }[];
  // PayMongo gateway presence + mode, derived server-side from the secret-key
  // prefix. Presence flags only — the key itself never leaves the server.
  gateway?: { status: "listening_test" | "listening_live" | "not_configured" };
  // Recent audit rows backing the Audit Trail tab. Safe columns only — no
  // payloads, no secrets, newest first, capped server-side. Actor is the
  // display name + role resolved from user_id, null for system rows.
  recentProbes?: { action: string; entity: string; at: string; actor: string | null }[];
  // Deployment facts, two tiers. Tier 1 ("environment") is always available
  // because Vercel injects the running deployment's own identifiers into the
  // function — so the card reports the environment/commit/branch actually
  // serving this request instead of a permanent Unknown. Tier 2 ("api") adds
  // the newest deployment's readyState when VERCEL_TOKEN is configured, which
  // is the only real "did the last build succeed" signal. A missing token is
  // not an error: the card falls back to tier 1. Public identifiers only — the
  // token never enters the payload.
  deployment?: {
    provider: string;
    environment: string | null;
    commit: string | null;
    branch: string | null;
    deploymentId: string | null;
    buildStatus: DeploymentBuildStatus;
    source: "api" | "environment" | "none";
  };
  domain?: { status: "not_connected" };
  issues?: string[];
  // Payment configuration health (Owner-controlled destination, read-only and
  // masked here; technical integration status maintained by System
  // Administration). Presence flags only — never secrets, never full numbers.
  payments?: {
    status: "Active" | "Inactive";
    accountName: string;
    mobileNumber: string;
    qrImage: "Configured" | "Missing";
    configuredBy: string | null;
    lastUpdated: string | null;
    qrStorage: "Healthy" | "Unavailable" | "Unknown";
    configuration: "Complete" | "Incomplete" | "Disabled";
  };
};

export type MigrationStatus = "in_sync" | "remote_behind" | "unknown";

// "succeeded" covers both meanings honestly: an analytics model run reaching
// "completed" and a guest reminder reaching "sent".
export type AutomationRunStatus = "succeeded" | "failed" | "unknown";

export type DeploymentBuildStatus = "ready" | "building" | "error" | "canceled" | "queued" | "unknown";

// Vercel's readyState vocabulary, narrowed. Anything unrecognised stays
// "unknown" rather than being guessed into a healthy state.
export const deploymentBuildStatus = (readyState: unknown): DeploymentBuildStatus => {
  switch (String(readyState ?? "").toUpperCase()) {
    case "READY": return "ready";
    case "BUILDING": return "building";
    case "ERROR": return "error";
    case "CANCELED": return "canceled";
    case "QUEUED": return "queued";
    default: return "unknown";
  }
};

// A job's recorded outcome. Guest reminders write 'sent'/'failed'; analytics
// model runs write 'completed'/'failed'. No row means the job has never
// recorded anything — "unknown", never a success.
export const automationRunStatus = (status: unknown): AutomationRunStatus =>
  status === "failed" ? "failed" : status === "sent" || status === "completed" ? "succeeded" : "unknown";

export const migrationStatus = (appliedCount: number, localCount: number | null): MigrationStatus =>
  localCount === null ? "unknown" : appliedCount < localCount ? "remote_behind" : "in_sync";

// Filenames present locally but missing from the remote ledger, by version.
export const pendingMigrations = (local: MigrationLedgerRow[], applied: MigrationLedgerRow[]): MigrationLedgerRow[] => {
  const seen = new Set(applied.map((row) => row.version));
  return local.filter((row) => !seen.has(row.version));
};
