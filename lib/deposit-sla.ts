/**
 * Deposit-verification SLA (roadmap Phase 5) — VISIBILITY ONLY. These helpers
 * derive how long a submitted deposit has been waiting and which aging band it
 * is in; nothing here approves, rejects, or automates anything. Bands:
 *   normal   — under an hour
 *   attention — an hour or more (amber chip)
 *   breach   — at/over the policy's depositSlaHours (red chip; 0 disables)
 */
export type DepositAgeBand = "normal" | "attention" | "breach";

export const DEPOSIT_ATTENTION_MINUTES = 60;
export const DEFAULT_DEPOSIT_SLA_HOURS = 4;

export const depositAgeMinutes = (submittedAt: unknown, now = Date.now()) =>
  submittedAt ? Math.max((now - new Date(String(submittedAt)).getTime()) / 60000, 0) : 0;

export function depositAgeBand(submittedAt: unknown, slaHours: number, now = Date.now()): DepositAgeBand {
  const minutes = depositAgeMinutes(submittedAt, now);
  if (slaHours > 0 && minutes >= slaHours * 60) return "breach";
  return minutes >= DEPOSIT_ATTENTION_MINUTES ? "attention" : "normal";
}

export function formatDepositAge(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
}

/** Aggregate aging over a set of pending-payment ages (minutes since submission). */
export function depositSlaSummary(agesMinutes: number[], slaHours: number): { oldestMinutes: number; pastSla: number } {
  const limit = slaHours > 0 ? slaHours * 60 : Number.POSITIVE_INFINITY;
  return {
    oldestMinutes: agesMinutes.length ? Math.round(Math.max(...agesMinutes)) : 0,
    pastSla: agesMinutes.filter((age) => age >= limit).length,
  };
}
