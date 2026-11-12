import "server-only";
import { cache } from "react";
import { supabase } from "./supabase";
import { DEFAULT_WEBSITE_CONTENT, websiteContentSchema, type WebsiteImage } from "./website-content";

export const getPublishedWebsiteContent = cache(async () => {
  if (!supabase) return { content: DEFAULT_WEBSITE_CONTENT, images: [] as WebsiteImage[], unavailable: false, version: 0 };
  try {
    const { data, error } = await supabase.rpc("website_landing_public");
    if (error || !data) return { content: DEFAULT_WEBSITE_CONTENT, images: [] as WebsiteImage[], unavailable: true, version: 0 };
    const parsed = websiteContentSchema.safeParse(data.content);
    return { content: parsed.success ? parsed.data : DEFAULT_WEBSITE_CONTENT, images: (data.images ?? []) as WebsiteImage[], unavailable: false, version: Number(data.version ?? 0) };
  } catch { return { content: DEFAULT_WEBSITE_CONTENT, images: [] as WebsiteImage[], unavailable: true, version: 0 }; }
});
