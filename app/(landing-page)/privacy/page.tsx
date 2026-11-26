import Link from "next/link";
import { PublicWebsiteNav } from "@/components/landing/public-website-nav";
import { WebsiteFooter } from "@/components/landing/website-footer";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import "@/components/landing/booking-policy-page.css";

export const metadata = { title: "Guest privacy information" };

export default async function PrivacyPage() {
  const { content } = await getPublishedWebsiteContent();
  return <main className="landing coastal-landing hotel-public hotel-booking-policy">
    <PublicWebsiteNav rootLinks />
    <article className="booking-policy guest-privacy" aria-labelledby="guest-privacy-title">
      <header className="booking-policy-header">
        <h1 id="guest-privacy-title">Guest privacy information</h1>
        <p>How {content.identity.name} uses information for your account, reservation and stay.</p>
      </header>
      <div className="booking-policy-content">
        <section className="booking-policy-section">
          <h2>Account and reservation details</h2>
          <p>Haven uses your name and contact details to create your account, confirm reservations and answer requests. Stay dates, room choices, guest counts and preferences help the hotel prepare and deliver your stay. Front Desk may use identification for check-in when the hotel’s policy requires it.</p>
        </section>
        <section className="booking-policy-section">
          <h2>Payment, services and sharing</h2>
          <p>Haven keeps payment references and settlement information for your folio, receipts and refunds. If you choose a hosted payment service, the provider handles the payment on its own page. Authorized hotel staff use reservation details to operate your stay. If you request transportation and agree to share details, the Fleet service receives the contact and trip information needed to arrange it.</p>
        </section>
        <section className="booking-policy-section">
          <h2>Sessions and account security</h2>
          <p>Haven uses session cookies for sign-in and account protection. Security and verification records support sign-in, recovery and review of account activity.</p>
        </section>
        <section className="booking-policy-section">
          <h2>Questions about your information</h2>
          <p>Contact the hotel to ask how long it keeps your information or to request access or a correction. Include your booking reference if it helps identify the stay. Keep passwords and payment credentials private.</p>
          <Link href="/#contact">Contact Front Desk</Link>
        </section>
      </div>
    </article>
    <WebsiteFooter content={content} />
  </main>;
}
