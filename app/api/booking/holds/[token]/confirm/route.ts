import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("Return to checkout to pay your reservation online.");
}
