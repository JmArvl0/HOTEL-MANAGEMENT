import "server-only";
import { cache } from "react";
import { getDepositPolicy } from "./booking";
import { getOperationalPolicy } from "./hotel-policy";

export const getPublicBookingInformation = cache(async () => {
  const [deposit, operations] = await Promise.all([getDepositPolicy(), getOperationalPolicy()]);
  return { deposit, operations };
});
