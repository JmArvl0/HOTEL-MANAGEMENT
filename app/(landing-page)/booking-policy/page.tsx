import { getPublicBookingInformation } from "@/lib/public-booking-information-server";
import { BookingPolicyPage } from "@/components/landing/booking-policy-page";
import { PublicWebsiteNav } from "@/components/landing/public-website-nav";
import Link from "next/link";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
export const metadata = { title: "Deposit, cancellation & arrival policy" };
export const revalidate = 300;
export default async function PolicyPage() {
  const [information, { content }] = await Promise.all([
    getPublicBookingInformation(),
    getPublishedWebsiteContent(),
  ]);
  return <main className="landing coastal-landing hotel-public hotel-booking-policy">
    <PublicWebsiteNav />
    <BookingPolicyPage information={information} content={content} />
    <footer className="booking-policy-footer">
      <small>© {new Date().getFullYear()} {content.identity.name}</small>
      <nav aria-label="Policies"><Link href="/booking-policy" aria-current="page">Booking policy</Link></nav>
    </footer>
  </main>;
}
