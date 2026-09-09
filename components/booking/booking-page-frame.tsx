import type { Session } from "next-auth";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/Navigation";
import { BookingHeader } from "@/components/booking/booking-shell";
import { CustomerShell } from "@/components/customer/customer-shell";

export function BookingPageFrame({ session, step, breadcrumb, children }: { session: Session | null; step?: string; breadcrumb?: BreadcrumbItem[]; children: React.ReactNode }) {
  if (session?.user.role === "guest") return <CustomerShell user={session.user}><div className="customer-booking-flow">{breadcrumb && <Breadcrumb items={breadcrumb}/>}{children}</div></CustomerShell>;
  return <main className="booking-page"><BookingHeader step={step}/>{breadcrumb && <Breadcrumb items={breadcrumb} className="booking-breadcrumb-light"/>}{children}</main>;
}
