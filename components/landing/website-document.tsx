import type { ReactNode } from "react";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { PublicWebsiteNav } from "./public-website-nav";
import { WebsiteFooter } from "./website-footer";

export async function WebsiteDocument({ title, children }: { title: string; children: ReactNode }) {
  const { content } = await getPublishedWebsiteContent();
  return <main className="landing coastal-landing hotel-public"><PublicWebsiteNav /><article className="hotel-section hotel-legal"><h1>{title}</h1>{children}</article><WebsiteFooter content={content} /></main>;
}
