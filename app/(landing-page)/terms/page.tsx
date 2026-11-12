import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { websiteText } from "@/lib/website-content";
import { WebsiteDocument } from "@/components/landing/website-document";
import Link from "next/link";
export const metadata = { title: "Booking terms" };
export const revalidate = 300;
export default async function TermsPage() { const { content } = await getPublishedWebsiteContent(); return <WebsiteDocument title="Booking terms">{!content.isDemo && <p>{websiteText(content.legal.termsDraft, content)}</p>}<p>For current deposit, cancellation and arrival rules, read the <Link href="/booking-policy">booking policy</Link> before you reserve.</p></WebsiteDocument>; }
