import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { LandingNav } from "./landing-nav";

export async function PublicWebsiteNav({ active, rootLinks = true, bookingHref = "/#book", overHero = false }: { active?: string; rootLinks?: boolean; bookingHref?: string; overHero?: boolean }) {
  const { content } = await getPublishedWebsiteContent();
  return <LandingNav active={active} rootLinks={rootLinks} bookingHref={bookingHref} identity={content.identity} contact={{ ...content.contact, isDemo: content.isDemo }} visibleSections={content.pageVisibility} overHero={overHero} />;
}
