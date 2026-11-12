import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { websiteText } from "@/lib/website-content";
import { WebsiteDocument } from "@/components/landing/website-document";
export const metadata = { title: "Privacy policy" };
export const revalidate = 300;
export default async function PrivacyPage() { const { content } = await getPublishedWebsiteContent(); return <WebsiteDocument title="Privacy policy"><p>{content.isDemo ? "The property’s privacy notice is being prepared." : websiteText(content.legal.privacyDraft, content)}</p></WebsiteDocument>; }
