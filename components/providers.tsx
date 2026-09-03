"use client";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState } from "react";
import { HavenLoader } from "@/components/ui/haven-loader";

function HavenBootGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    // quick bespoke intro — only on first mount, not on every route (app/loading.tsx covers Suspense)
    const t1 = window.setTimeout(() => setHiding(true), 880);
    const t2 = window.setTimeout(() => setReady(true), 1220);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (ready) return <>{children}</>;
  return (
    <>
      <div className={hiding ? "haven-boot-hiding" : ""}>
        <HavenLoader variant="fullscreen" label="Opening Haven" />
      </div>
      <div style={{ visibility: "hidden", height: 0, overflow: "hidden" }} aria-hidden="true">
        {children}
      </div>
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HavenBootGate>{children}</HavenBootGate>
    </SessionProvider>
  );
}
