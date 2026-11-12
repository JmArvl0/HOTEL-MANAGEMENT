import Link from "next/link";
import type { WebsiteContent } from "@/lib/website-content";

export function WebsiteFooter({ content }: { content: WebsiteContent }) {
  return <footer className="hotel-footer"><div className="hotel-footer-inner"><div><h2>{content.identity.name}</h2><p>{content.identity.district}, {content.identity.city}</p>{!content.isDemo && <p>{content.contact.phone}<br />{content.contact.email}</p>}</div><nav aria-label="Footer"><Link href="/#stay">Rooms & suites</Link>{content.pageVisibility.amenities && <Link href="/#amenities">Amenities & dining</Link>}{content.pageVisibility.gallery && <Link href="/#gallery">Photo gallery</Link>}<Link href="/#how-to-go">Location</Link><Link href="/#contact">Contact</Link>{content.pageVisibility.faq && <Link href="/#faq">FAQ</Link>}<Link href="/privacy">Privacy policy</Link><Link href="/terms">Booking terms</Link><Link href="/booking-policy">Deposit & cancellation</Link><Link href="/account">My account</Link><Link href="/booking/search">Check availability</Link></nav><small>© {new Date().getFullYear()} {content.identity.name}</small></div></footer>;
}
