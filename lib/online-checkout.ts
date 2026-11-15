import { publicJson } from "@/lib/server-errors";
export const DEPOSIT_METHODS = ["xendit", "off"] as const;

export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export function guestDepositsEnabled(value: unknown): boolean {
  return value === "xendit";
}

export function retiredPayment(error: string): Response {
  return publicJson({ error }, { status: 410 });
}
