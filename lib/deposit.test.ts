import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPOSIT_POLICY, calculateFinancialState, calculateReservationDeposit,
  depositPolicyLabel, depositSubmissionSchema, policyFromSnapshot, toCentavos
} from "@/lib/booking";

const migration=readFileSync("supabase/migrations/20260828010000_reservation_deposit_model.sql","utf8");
const paymentPage=readFileSync("app/(booking)/booking/payment/[token]/page.tsx","utf8");
const submitRoute=readFileSync("app/api/booking/holds/[token]/confirm/route.ts","utf8");
const verifyRoute=readFileSync("app/api/front-desk/deposits/[id]/verify/route.ts","utf8");
const checkInRoute=readFileSync("app/api/front-desk/check-in/route.ts","utf8");

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
 it("accepts only supported manual verification methods",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_gcash",paymentReference:"GC-1234"}).success).toBe(true));
 it("rejects pay-at-hotel as an online confirmation method",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"pay_at_hotel",paymentReference:"TEST"}).success).toBe(false));
 it("rejects cash guarantee at arrival",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"cash_guarantee",paymentReference:"TEST"}).success).toBe(false));
 it("requires an external payment reference",()=>expect(depositSubmissionSchema.safeParse({paymentMethod:"manual_bank_transfer",paymentReference:""}).success).toBe(false));
 it("does not accept a browser supplied amount as an authoritative field",()=>expect(Object.keys(depositSubmissionSchema.parse({paymentMethod:"manual_gcash",paymentReference:"GC-1234",amount:1}))).toEqual(["paymentMethod","paymentReference"]));
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

describe("end-to-end UI and authorization wiring",()=>{
 it("shows a reservation deposit screen",()=>expect(paymentPage).toContain("Reservation deposit"));
 it("states that manual submission is not automatic payment success",()=>expect(paymentPage).toContain("verifies GCash and bank transfers manually"));
 it("never offers obsolete online guarantees",()=>{expect(paymentPage).not.toContain("Pay at the hotel");expect(paymentPage).not.toContain("Cash guarantee")});
 it("uses the server submission RPC without accepting an amount",()=>{expect(submitRoute).toContain("submit_reservation_deposit");expect(submitRoute).not.toContain("p_amount")});
 it("requires guest ownership for deposit submission",()=>expect(submitRoute).toContain('session.user.role !== "guest"'));
 it("restricts verification to authorized staff roles",()=>expect(verifyRoute).toContain('const permitted = new Set(["front_desk","accounting"])'));
 it("uses the idempotent verification RPC",()=>expect(verifyRoute).toContain("verify_reservation_deposit"));
 it("prevents website check-in without a verified deposit",()=>expect(checkInRoute).toContain("RESERVATION_DEPOSIT_REQUIRED"));
});
