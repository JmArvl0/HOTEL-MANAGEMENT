import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./guest-booking.css";
import "./manager-dashboard-theme.css";
import "./responsive.css";
import "@/components/ui/Modal.css";
import "@/components/booking/room-details.css";
import "./design-tokens.css";
import "./ui-primitives.css";
import "./coastal-theme.css";
import "./customer-portal.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = { title: "Haven Hotel Management", description: "Thoughtful stays, seamlessly managed." };
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

// Runs before first paint so the default light theme (and a saved one) never flashes
// the dark base palette. Key and rule must match lib/theme.ts: only a stored 'dark'
// paints dark — every other value (missing, junk, legacy 'system') is light.
const themeScript = `(function(){try{if(localStorage.getItem('haven-dashboard-theme')!=='dark')document.documentElement.classList.add('theme-light')}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <body className={`${inter.variable} ${playfair.variable}`}>
      {/* Raw markup, not a React <script>: React never executes scripts it renders
          on the client, so it warns whenever it renders one. Inside
          dangerouslySetInnerHTML there is no script fiber — the HTML parser runs
          it while parsing <body>, still before first paint. */}
      <div hidden dangerouslySetInnerHTML={{ __html: `<script>${themeScript}</script>` }} />
      <Providers>{children}</Providers>
    </body>
  </html>;
}
