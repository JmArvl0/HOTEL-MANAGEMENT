import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("Manage online checkout in Payment Settings.");
}

export function DELETE() {
  return retiredPayment("Manage online checkout in Payment Settings.");
}
