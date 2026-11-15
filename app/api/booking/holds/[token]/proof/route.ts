import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("Guest payment proof uploads have closed.");
}

export function DELETE() {
  return retiredPayment("Guest payment proof uploads have closed.");
}
