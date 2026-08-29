import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./guest-booking.css";
import "./manager-dashboard-theme.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = { title: "Haven Hotel Management", description: "Thoughtful stays, seamlessly managed." };

// Runs before first paint so a saved light theme never flashes the dark palette.
// Key and fallback must match lib/theme.ts.
const themeScript = `(function(){try{var m=localStorage.getItem('haven-dashboard-theme');if(m!=='light'&&m!=='dark')m='system';if(m==='light'||(m==='system'&&!window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('theme-light')}catch(e){}})()`;

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
