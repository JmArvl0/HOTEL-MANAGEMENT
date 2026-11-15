import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("Manual payment review has closed. See Payment history for the recorded status.");
}
