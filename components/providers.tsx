"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HavenLoader } from "@/components/ui/haven-loader";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Show the homepage in the initial HTML, including visits with a section hash.
  const [ready, setReady] = useState(() => pathname === "/");
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (ready) return;
    const t1 = window.setTimeout(() => setHiding(true), 880);
    const t2 = window.setTimeout(() => setReady(true), 1220);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [ready]);

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
