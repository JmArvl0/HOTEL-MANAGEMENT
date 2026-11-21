import Link from "next/link";
import { ExpressKiosk } from "@/components/checkin/express-kiosk";
import { HavenLogo } from "@/components/ui/haven-logo";
import "./kiosk.css";

export const metadata = { title: "Express Check-In — Haven" };

/**
 * Public kiosk surface: the guest signs in (or is already signed in on their
 * phone) and scans their stay QR. Auth + eligibility stay server-side.
 */
export default function KioskPage() {
  return (
    <main className="kiosk-shell">
      <header className="kiosk-header">
        <Link href="/" className="kiosk-brand" aria-label="Haven home">
          <HavenLogo size={36} />
          <span>HAVEN <small>Hotel &amp; Residences</small></span>
        </Link>
        <Link href="/#contact" className="kiosk-help">Ask Front Desk</Link>
      </header>
      <ExpressKiosk />
    </main>
  );
}
