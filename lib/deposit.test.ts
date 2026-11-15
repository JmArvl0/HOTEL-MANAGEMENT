import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPOSIT_POLICY, calculateFinancialState, calculateReservationDeposit,
  depositPolicyLabel, policyFromSnapshot, toCentavos
} from "@/lib/booking";

const migration=readFileSync("supabase/migrations/20260828010000_reservation_deposit_model.sql","utf8");
const noDeadlineMigration=readFileSync("supabase/migrations/20260907010000_verification_no_time_limit.sql","utf8");
const paymentPage=readFileSync("app/(booking)/booking/payment/[token]/page.tsx","utf8");
const checkInRoute=readFileSync("app/api/front-desk/check-in/route.ts","utf8");
const proofMigration=readFileSync("supabase/migrations/20260921010000_payment_proof.sql","utf8");
const proofViewRoute=readFileSync("app/api/booking/payments/[id]/proof/route.ts","utf8");

describe("reservation deposit policy",()=>{
 it("uses the centralized 30 percent development policy",()=>{expect(DEFAULT_DEPOSIT_POLICY.percentageBasisPoints).toBe(3000);expect(DEFAULT_DEPOSIT_POLICY.holdMinutes).toBe(15)});
 it("calculates a percentage deposit in centavos",()=>expect(calculateReservationDeposit(8900,DEFAULT_DEPOSIT_POLICY)).toEqual({total:8900,requiredDeposit:2670,remainingBalance:6230}));
 it("rounds percentage deposits to the nearest centavo",()=>expect(calculateReservationDeposit(100.01,{...DEFAULT_DEPOSIT_POLICY,percentageBasisPoints:3333}).requiredDeposit).toBe(33.33));
 it("supports a configured fixed deposit",()=>expect(calculateReservationDeposit(8900,{...DEFAULT_DEPOSIT_POLICY,calculationType:"fixed",fixedAmount:2500}).requiredDeposit).toBe(2500));
 it("caps fixed deposits at the stay total",()=>expect(calculateReservationDeposit(1000,{...DEFAULT_DEPOSIT_POLICY,calculationType:"fixed",fixedAmount:2500}).requiredDeposit).toBe(1000));
 it("does not expose floating point centavo drift",()=>expect(toCentavos(26.7)).toBe(2670));
 it("calculates paid and remaining folio values from authoritative totals",()=>expect(calculateFinancialState(8900,2670)).toEqual({total:8900,paid:2670,balance:6230}));
 it("prevents presentation-level overpayment",()=>expect(calculateFinancialState(8900,9900)).toEqual({total:8900,paid:8900,balance:0}));
 it("labels the configured percentage",()=>expect(depositPolicyLabel(DEFAULT_DEPOSIT_POLICY)).toBe("30%"));
 it("reads a reservation policy snapshot",()=>expect(policyFromSnapshot({calculationType:"fixed",fixedAmount:1000,remainingBalanceDue:"At check-in"})).toMatchObject({calculationType:"fixed",fixedAmount:1000,remainingBalanceDue:"At check-in"}));
});

describe("database-backed deposit lifecycle",()=>{
 it("creates online reservations as pending before verification",()=>expect(migration).toContain("'pending','Website'"));
 it("creates the deposit payment as pending verification",()=>expect(migration).toContain("'reservation_deposit','pending_verification'"));
 it("confirms only inside the staff verification function",()=>expect(migration).toContain("update reservations set status='confirmed'"));
 it("updates the invoice from paid payment records",()=>expect(migration).toContain("status='paid'and purpose<>'refund'"));
 it("makes deposit submission idempotent by hold token",()=>expect(migration).toContain("payments_idempotency_unique"));
 it("returns an existing reservation on a repeated submission",()=>expect(migration).toContain("if h.reservation_id is not null"));
 it("expires stale holds and pending website reservations",()=>{expect(migration).toContain("expire_booking_holds");expect(migration).toContain("status='cancelled'")});
 it("revalidates inventory before payment submission and verification",()=>expect(migration.match(/ROOM_TYPE_UNAVAILABLE/g)?.length).toBeGreaterThanOrEqual(4));
 it("enforces customer ownership in the database function",()=>expect(migration).toContain("token=p_token and user_id=p_user_id"));
 it("keeps historical reservations untouched by backfill",()=>expect(migration).not.toMatch(/update reservations set deposit_required/));
 it("removes the old online guarantee RPC",()=>expect(migration).toContain("drop function if exists public.confirm_booking_hold"));
});

describe("staff verification has no time limit",()=>{
 it("expires only holds the guest never submitted payment for",()=>expect(noDeadlineMigration).toContain("where status='active' and expires_at<=now()"));
 it("keeps the customer-side submission deadline on the hold",()=>expect(noDeadlineMigration).toContain("if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED'"));
 it("drops the time check from staff verification",()=>{expect(noDeadlineMigration).toContain("if h.status<>'payment_submitted'or r.status<>'pending'then raise exception'HOLD_EXPIRED'");expect(noDeadlineMigration).not.toContain("h.expires_at<=now()or r.status")});
 it("keeps pending-verification reservations blocking inventory with no payment deadline",()=>expect(noDeadlineMigration).toContain("'unpaid',p_payment_method,null,confirmation,p_token)"));
});

describe("end-to-end UI and authorization wiring",()=>{
 it("uses Xendit with the quoted hold deposit",()=>expect(paymentPage).toContain("<XenditCheckout holdToken={token} amount={deposit} />"));
 it("never offers obsolete online guarantees",()=>{expect(paymentPage).not.toContain("Pay at the hotel");expect(paymentPage).not.toContain("Cash guarantee")});
 it("prevents website check-in without a verified deposit",()=>expect(checkInRoute).toContain("RESERVATION_DEPOSIT_REQUIRED"));
});

describe("historical deposit proof storage",()=>{
 it("adds proof metadata columns to payments",()=>{expect(proofMigration).toContain("add column if not exists proof_storage_path");expect(proofMigration).toContain("add column if not exists proof_original_name");expect(proofMigration).toContain("add column if not exists proof_mime_type");expect(proofMigration).toContain("add column if not exists proof_size_bytes");expect(proofMigration).toContain("add column if not exists proof_uploaded_at")});
 it("creates a private payment-proofs bucket with size and mime limits",()=>{expect(proofMigration).toContain("'payment-proofs'");expect(proofMigration).toContain("false");expect(proofMigration).toContain("5242880");expect(proofMigration).toContain("image/webp")});
 it("creates no public read policy on payment proofs",()=>{expect(proofMigration).not.toMatch(/create policy/i);expect(proofMigration).not.toMatch(/for select using/i)});
 it("requires proof in the RPC for manual methods",()=>{expect(proofMigration).toContain("PROOF_REQUIRED");expect(proofMigration).toContain("p_proof_storage_path text")});
 it("stores the storage path, never a URL, on the payment row",()=>{expect(proofMigration).toContain("proof_storage_path,proof_original_name,proof_mime_type,proof_size_bytes,proof_uploaded_at");expect(proofMigration).not.toMatch(/proof_(public_)?url/)});
 it("keeps the RPC executable by the service role only",()=>{expect(proofMigration).toContain("revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer)from public,anon,authenticated");expect(proofMigration).toContain("grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer)to service_role")});
});

describe("payment proof viewing is private and narrow",()=>{
 it("serves proofs only through short-lived signed URLs",()=>{expect(proofViewRoute).toContain("createSignedUrl");expect(proofViewRoute).toContain("60");expect(proofViewRoute).not.toContain("getPublicUrl")});
 it("allows the paying guest and Accounting only",()=>{expect(proofViewRoute).toContain('session.user.role === "accounting"');expect(proofViewRoute).toContain("owner === session.user.id")});
 it("never lists Front Desk or Manager as proof viewers",()=>{expect(proofViewRoute).not.toContain("front_desk");expect(proofViewRoute).not.toContain("manager")});
 it("returns 404 rather than confirming existence for other guests",()=>expect(proofViewRoute).toContain('"Not found."'));
});
