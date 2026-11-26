import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const measureCodes = ["room_accrual", "assessed_charges", "signed_adjustments", "gross_collections",
  "refunds_paid", "net_collections", "outstanding_at_close"] as const;
const minor = z.number().int();
const identifier = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const batchSchema = z.strictObject({
  schemaVersion: z.literal(1), property: z.literal("HAVEN"), batchId: identifier,
  businessDate: z.iso.date(), closedAtUtc: z.iso.datetime(), currency: z.literal("PHP"),
  status: z.literal("review_pending"),
  measures: z.array(z.strictObject({ id: identifier, code: z.enum(measureCodes), amountMinor: minor })).length(measureCodes.length),
});
const commonResult = { id: identifier, amountMinor: minor };
const acknowledgmentSchema = z.strictObject({
  schemaVersion: z.literal(1), property: z.literal("HAVEN"), batchId: identifier, currency: z.literal("PHP"),
  acknowledgmentId: identifier, reviewedAtUtc: z.iso.datetime(),
  measures: z.array(z.discriminatedUnion("status", [
    z.strictObject({ ...commonResult, status: z.literal("accepted"), financeReference: identifier }),
    z.strictObject({ ...commonResult, status: z.literal("rejected"), reasonCode: identifier }),
  ])).length(measureCodes.length),
});

/** Rehearse a closed-day review handoff offline. All amounts are integer centavos. */
export function reconcileFinanceReview(batchInput: unknown, acknowledgmentInput: unknown, previousInput?: unknown) {
  const batch = batchSchema.parse(batchInput);
  const acknowledgment = acknowledgmentSchema.parse(acknowledgmentInput);
  const measuresByCode = new Map(batch.measures.map(measure => [measure.code, measure.amountMinor]));
  if (batch.batchId !== `HAVEN-CLOSE-${batch.businessDate}-V1` || measuresByCode.size !== measureCodes.length ||
      batch.measures.some(measure => measure.id !== `${batch.batchId}:${measure.code}`)) {
    throw new Error("The close batch ID and measure IDs must match the business date.");
  }
  if (BigInt(measuresByCode.get("gross_collections")!) - BigInt(measuresByCode.get("refunds_paid")!) !== BigInt(measuresByCode.get("net_collections")!)) {
    throw new Error("Gross collections less refunds must equal net collections.");
  }
  if (acknowledgment.batchId !== batch.batchId || Date.parse(acknowledgment.reviewedAtUtc) < Date.parse(batch.closedAtUtc)) {
    throw new Error("The Finance acknowledgment must refer to the same close and follow its timestamp.");
  }
  const results = new Map(acknowledgment.measures.map(measure => [measure.id, measure]));
  if (results.size !== batch.measures.length || batch.measures.some(measure => results.get(measure.id)?.amountMinor !== measure.amountMinor)) {
    throw new Error("The Finance acknowledgment must return each measure ID and exact amount once.");
  }
  const sorted = (review: z.infer<typeof acknowledgmentSchema>) => JSON.stringify({ ...review, measures: [...review.measures].sort((a, b) => a.id.localeCompare(b.id)) });
  if (previousInput !== undefined) {
    const previous = acknowledgmentSchema.parse(previousInput);
    if (sorted(previous) !== sorted(acknowledgment)) throw new Error("The acknowledgment differs from the recorded review. Reconcile a correction before proceeding.");
  }
  const rejected = acknowledgment.measures.filter(measure => measure.status === "rejected").map(({ id, reasonCode }) => ({ id, reasonCode }));
  return {
    batchId: batch.batchId, acknowledgmentId: acknowledgment.acknowledgmentId,
    status: rejected.length ? "requires_review" : "accepted", replay: previousInput !== undefined,
    acceptedCount: results.size - rejected.length, rejected,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length < 2 || paths.length > 3) throw new Error("Use: node scripts/finance-handoff-check.mts close.json acknowledgment.json [previous-acknowledgment.json]");
    const [batch, acknowledgment, previous] = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, "utf8"))));
    const result = reconcileFinanceReview(batch, acknowledgment, previous);
    console.log(JSON.stringify(result, null, 2));
    if (result.rejected.length) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof z.ZodError ? "Finance file does not match the review schema." : error instanceof Error ? error.message : "Finance file could not be verified.");
    process.exitCode = 1;
  }
}
