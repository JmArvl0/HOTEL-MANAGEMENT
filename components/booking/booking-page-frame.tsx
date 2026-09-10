import type { Session } from "next-auth";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/Navigation";
import { BackButton } from "@/components/booking/back-button";
import { BookingHeader } from "@/components/booking/booking-shell";
import { CustomerShell } from "@/components/customer/customer-shell";

export function BookingPageFrame({ session, step, breadcrumb, children }: { session: Session | null; step?: string; breadcrumb?: BreadcrumbItem[]; children: React.ReactNode }) {
  // Previous flow step (last breadcrumb entry with a href) — the back link returns
  // there deterministically instead of router.back(), so the same booking params survive.
  const stepLink = breadcrumb?.filter((item) => item.href).at(-1);
  const backLabel = stepLink ? `Back to ${stepLink.label}` : "Go back";
  if (session?.user.role === "guest") return <CustomerShell user={session.user}><div className="customer-booking-flow">{breadcrumb && <div className="booking-flow-navigation"><Breadcrumb items={breadcrumb}/><BackButton to={stepLink?.href} label={backLabel} className="booking-back--flow"/></div>}{children}</div></CustomerShell>;
  return <main className="booking-page"><BookingHeader step={step}/>{breadcrumb && <div className="booking-flow-navigation booking-flow-navigation--public"><Breadcrumb items={breadcrumb} className="booking-breadcrumb-light"/><BackButton to={stepLink?.href} label={backLabel} className="booking-back--flow"/></div>}{children}</main>;
}
