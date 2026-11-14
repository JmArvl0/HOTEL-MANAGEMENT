import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";

export async function FrontDeskSupport() {
  const { content, unavailable } = await getPublishedWebsiteContent();
  const available = !unavailable && (content.isDemo || content.clientInformationReviewed);
  return <aside className="my-stay-support" aria-label="Front Desk assistance">
    <h2>Here to help</h2><p>Questions about booking or payment? Contact Front Desk, even before your stay is confirmed.</p>
    {available ? <><div className="my-stay-support-actions"><a href={`tel:${content.contact.phone.replace(/[^+\d]/g, "")}`}><Phone size={16} aria-hidden="true" />{content.contact.phone}</a><a href={`mailto:${content.contact.email}`}><Mail size={16} aria-hidden="true" />Email Front Desk</a></div><small>{content.contact.frontDeskHours}{content.isDemo && " · Demo contact details"}</small></> : <p>Contact details are currently unavailable. Please check the hotel&apos;s published contact page.</p>}
    <Link href="/account/help">Booking & payment help</Link>
  </aside>;
}
