import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("This checkout has closed. Return to your reservation to check available payment options.");
}
