import { ExpressKiosk } from "@/components/checkin/express-kiosk";

export const metadata = { title: "Express Check-In — Haven" };

/**
 * Public kiosk surface: the guest signs in (or is already signed in on their
 * phone) and scans their stay QR. Auth + eligibility stay server-side.
 */
export default function KioskPage() {
  return (
    <main className="kiosk-shell">
      <ExpressKiosk />
    </main>
  );
}
