import { retiredPayment } from "@/lib/online-checkout";

export function POST() {
  return retiredPayment("This payment webhook has been retired.");
}
