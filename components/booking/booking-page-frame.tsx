import type { Session } from "next-auth";
import { BookingHeader } from "@/components/booking/booking-shell";
import { CustomerShell } from "@/components/customer/customer-shell";

export function BookingPageFrame({ session, step, children }: { session: Session | null; step?: string; children: React.ReactNode }) {
  if (session?.user.role === "guest") return <CustomerShell user={session.user}><div className="customer-booking-flow">{children}</div></CustomerShell>;
  return <main className="booking-page"><BookingHeader step={step}/>{children}</main>;
}
