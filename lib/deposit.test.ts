import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPOSIT_POLICY, calculateFinancialState, calculateReservationDeposit,
  depositPolicyLabel, depositSubmissionSchema, policyFromSnapshot, toCentavos
} from "@/lib/booking";

const migration=readFileSync("supabase/migrations/20260828010000_reservation_deposit_model.sql","utf8");
const noDeadlineMigration=readFileSync("supabase/migrations/20260907010000_verification_no_time_limit.sql","utf8");
const paymentPage=readFileSync("app/(booking)/booking/payment/[token]/page.tsx","utf8");
const submitRoute=readFileSync("app/api/booking/holds/[token]/confirm/route.ts","utf8");
const verifyRoute=readFileSync("app/api/front-desk/deposits/[id]/verify/route.ts","utf8");
const checkInRoute=readFileSync("app/api/front-desk/check-in/route.ts","utf8");
const proofMigration=readFileSync("supabase/migrations/20260921010000_payment_proof.sql","utf8");
const proofRoute=readFileSync("app/api/booking/holds/[token]/proof/route.ts","utf8");
const proofViewRoute=readFileSync("app/api/booking/payments/[id]/proof/route.ts","utf8");
const proofHelper=readFileSync("lib/payment-proof.ts","utf8");
const confirmForm=readFileSync("components/booking/confirm-booking-form.tsx","utf8");

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

describe("online deposit submission validation",()=>{
 it("accepts only supported manual verification methods",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_gcash",paymentReference:"GC-1234",proofPath:"pending/0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f/1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.jpg"}).success).toBe(true));
 it("rejects pay-at-hotel as an online confirmation method",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"pay_at_hotel",paymentReference:"TEST",proofPath:"pending/0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f/1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.jpg"}).success).toBe(false));
 it("rejects cash guarantee at arrival",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"cash_guarantee",paymentReference:"TEST",proofPath:"pending/0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f/1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.jpg"}).success).toBe(false));
 it("requires an external payment reference",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_bank_transfer",paymentReference:""}).success).toBe(false));
 it("does not accept a browser supplied amount as an authoritative field",()=>expect(Object.keys(depositSubmissionSchema.parse({paymentMethod:"manual_gcash",paymentReference:"GC-1234",proofPath:"pending/0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f/1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.jpg",amount:1}))).toEqual(["paymentMethod","paymentReference","proofPath"]));
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
 it("shows a reservation deposit screen",()=>expect(paymentPage).toContain("Reservation deposit"));
 it("states that manual submission is not automatic payment success",()=>expect(paymentPage).toContain("verifies GCash and bank transfers manually"));
 it("never offers obsolete online guarantees",()=>{expect(paymentPage).not.toContain("Pay at the hotel");expect(paymentPage).not.toContain("Cash guarantee")});
 it("uses the server submission RPC without accepting an amount",()=>{expect(submitRoute).toContain("submit_reservation_deposit");expect(submitRoute).not.toContain("p_amount")});
 it("requires guest ownership for deposit submission",()=>expect(submitRoute).toContain('session.user.role !== "guest"'));
 it("restricts verification to Accounting alone",()=>expect(verifyRoute).toContain('const permitted = new Set(["accounting"])'));
 it("uses the idempotent verification RPC",()=>expect(verifyRoute).toContain("verify_reservation_deposit"));
 it("prevents website check-in without a verified deposit",()=>expect(checkInRoute).toContain("RESERVATION_DEPOSIT_REQUIRED"));
});

describe("payment proof is a required part of deposit submission",()=>{
 it("adds proof metadata columns to payments",()=>{expect(proofMigration).toContain("add column if not exists proof_storage_path");expect(proofMigration).toContain("add column if not exists proof_original_name");expect(proofMigration).toContain("add column if not exists proof_mime_type");expect(proofMigration).toContain("add column if not exists proof_size_bytes");expect(proofMigration).toContain("add column if not exists proof_uploaded_at")});
 it("creates a private payment-proofs bucket with size and mime limits",()=>{expect(proofMigration).toContain("'payment-proofs'");expect(proofMigration).toContain("false");expect(proofMigration).toContain("5242880");expect(proofMigration).toContain("image/webp")});
 it("creates no public read policy on payment proofs",()=>{expect(proofMigration).not.toMatch(/create policy/i);expect(proofMigration).not.toMatch(/for select using/i)});
 it("requires proof in the RPC for manual methods",()=>{expect(proofMigration).toContain("PROOF_REQUIRED");expect(proofMigration).toContain("p_proof_storage_path text")});
 it("stores the storage path, never a URL, on the payment row",()=>{expect(proofMigration).toContain("proof_storage_path,proof_original_name,proof_mime_type,proof_size_bytes,proof_uploaded_at");expect(proofMigration).not.toMatch(/proof_(public_)?url/)});
 it("keeps the RPC executable by the service role only",()=>{expect(proofMigration).toContain("revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer)from public,anon,authenticated");expect(proofMigration).toContain("grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer)to service_role")});
});

describe("payment proof upload validation",()=>{
 it("sniffs image type from magic bytes, never the filename or browser MIME",()=>{expect(proofHelper).toContain("sniffProofKind");expect(proofRoute).toContain("sniffProofKind(bytes)");expect(proofRoute).not.toMatch(/file\.type\]/)});
 it("caps proof size at 5 MB from the actual bytes",()=>expect(proofRoute).toContain("bytes.byteLength > PROOF_MAX_BYTES"));
 it("stages uploads under the hold token namespace",()=>expect(proofRoute).toContain("pending/${token}/${crypto.randomUUID()}"));
 it("guards the staged upload by hold ownership, expiry and state",()=>{expect(proofRoute).toContain('hold.user_id !== session.user.id');expect(proofRoute).toContain('hold.status !== "active"')});
 it("deletes only staged proof paths for this hold",()=>{expect(proofRoute).toContain("stagedProofPathPattern(token).test(path)");expect(proofRoute).not.toMatch(/remove\(\[url\]/)});
});

describe("deposit submission re-validates the proof server-side",()=>{
 it("requires a proof path in the submission schema",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_gcash",paymentReference:"GC-1234"}).success).toBe(false));
 it("accepts a submission with reference and staged proof path",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_gcash",paymentReference:"GC-1234",proofPath:"pending/0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f/1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.jpg"}).success).toBe(true));
 it("rejects a proof path outside the pending namespace",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_gcash",paymentReference:"GC-1234",proofPath:"../../etc/passwd"}).success).toBe(false));
 it("re-downloads and re-sniffs the proof object before the RPC",()=>{expect(submitRoute).toContain("storage.from(PROOF_BUCKET).download(proofPath)");expect(submitRoute).toContain("sniffProofKind(bytes)")});
 it("cleans up the staged upload when submission fails",()=>{expect(submitRoute).toContain("remove([proofPath])");expect(submitRoute).toContain("idempotentReplay")});
 it("maps the PROOF_REQUIRED RPC error to a guest-readable message",()=>expect(submitRoute).toContain("PROOF_REQUIRED:"));
 it("requires the proof path to belong to this hold",()=>expect(submitRoute).toContain("stagedProofPathPattern(token).test(proofPath)"));
});

describe("payment proof viewing is private and narrow",()=>{
 it("serves proofs only through short-lived signed URLs",()=>{expect(proofViewRoute).toContain("createSignedUrl");expect(proofViewRoute).toContain("60");expect(proofViewRoute).not.toContain("getPublicUrl")});
 it("allows the paying guest and Accounting only",()=>{expect(proofViewRoute).toContain('session.user.role === "accounting"');expect(proofViewRoute).toContain("owner === session.user.id")});
 it("never lists Front Desk or Manager as proof viewers",()=>{expect(proofViewRoute).not.toContain("front_desk");expect(proofViewRoute).not.toContain("manager")});
 it("returns 404 rather than confirming existence for other guests",()=>expect(proofViewRoute).toContain('"Not found."'));
});

describe("proof upload form wiring",()=>{
 it("disables submission until reference and proof are both present",()=>expect(confirmForm).toContain("disabled={loading || uploading || !staged}"));
 it("validates type and size on the client before uploading",()=>{expect(confirmForm).toContain("PROOF_TYPES.includes(file.type)");expect(confirmForm).toContain("file.size > PROOF_MAX_BYTES")});
 it("uploads to the hold-scoped proof endpoint, then confirms with the staged path",()=>{expect(confirmForm).toContain("/api/booking/holds/${token}/proof");expect(confirmForm).toContain("proofPath")});
 it("releases the staged upload when the hold fails permanently",()=>expect(confirmForm).toContain("discardStaged()"));
});
