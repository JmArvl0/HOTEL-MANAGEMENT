// Admin System Health: shared types for /api/admin/data?section=system and the
// dashboard view. Pure derivation only — all I/O lives in the route.
//
// Unknown-first rule: every section the system cannot honestly measure reports
// "unknown" (or "not configured" / "not connected") instead of fabricated
// health. No section ever carries a secret value — presence flags only.

export type MigrationLedgerRow = { version: string; name: string };

export type SystemHealth = {
  db: { live: boolean; latencyMs: number | null; checkedAt: string; error?: string };
  activity: { lastAuditAt: string | null; auditEvents24h: number; pendingApprovals: number };
  migrations: {
    applied: MigrationLedgerRow[];
    appliedCount: number;
    localCount: number | null; // null when local migration files are unavailable
    status: MigrationStatus;
  };
  // Extended sections (Q2). All optional so older payloads still render.
  application?: { environment: string; version: string; commit: string | null };
  storage?: { status: "operational" | "unavailable" | "unknown" };
  email?: { status: "configured" | "not_configured" };
  automations?: { name: string; schedule: string; lastRun: string | null; status: "unknown" }[];
  deployment?: { provider: string; status: "unknown" };
  domain?: { status: "not_connected" };
  issues?: string[];
};

export type MigrationStatus = "in_sync" | "remote_behind" | "unknown";

export const migrationStatus = (appliedCount: number, localCount: number | null): MigrationStatus =>
  localCount === null ? "unknown" : appliedCount < localCount ? "remote_behind" : "in_sync";
