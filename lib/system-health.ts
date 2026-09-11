// Admin System Health: shared types for /api/admin/data?section=system and the
// dashboard view. Pure derivation only — all I/O lives in the route.

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
};

export type MigrationStatus = "in_sync" | "remote_behind" | "unknown";

export const migrationStatus = (appliedCount: number, localCount: number | null): MigrationStatus =>
  localCount === null ? "unknown" : appliedCount < localCount ? "remote_behind" : "in_sync";
