import { z } from "zod";
import seed from "./website-content-defaults.json";

const copy = z.string().trim().min(1).max(1000);
const short = z.string().trim().min(1).max(150);
export const WEBSITE_GALLERY_CATEGORIES = ["Exterior", "Rooms", "Dining", "Amenities", "Shared Spaces"] as const;
export const WEBSITE_AMENITY_ICONS = ["wifi", "parking", "pool", "fitness", "transfers", "laundry", "service"] as const;
export type WebsiteGalleryCategory = typeof WEBSITE_GALLERY_CATEGORIES[number];
export const websitePhotoKey = z.union([z.enum(["room", "bathroom", "ocean", "executive", "rizal", "museum", "transport"]), z.string().uuid()]);
export const websiteContentSchema = z.object({
  schemaVersion: z.literal(1),
  isDemo: z.boolean(),
  clientInformationReviewed: z.boolean(),
  identity: z.object({ name: short, shortName: z.string().trim().min(1).max(10), city: short, district: short, headline: short, heroLead: short, introduction: copy, metaTitle: short }),
  contact: z.object({ phone: z.string().trim().min(3).max(50), email: z.string().trim().email().max(150), frontDeskHours: short }),
  location: z.object({ demoAddress: copy, entranceNotes: copy, localGuide: copy }),
  amenities: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), name: short, description: copy, enabled: z.boolean(), icon: z.enum(WEBSITE_AMENITY_ICONS).optional() })).max(32)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, "Amenities must have distinct identifiers."),
  dining: z.object({ name: short, description: copy, breakfastIncluded: z.boolean(), breakfastPrice: z.number().min(0).max(100000), breakfastStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), breakfastEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), breakfastSchedule: short.optional(), priceCaption: short.optional(), ctaText: short.optional(), ctaLink: z.string().trim().max(500).regex(/^\/(?!\/)[^\s\\]*$/, "Use a website path starting with /.").optional() }),
  family: z.object({ summary: copy, extraBeds: copy }),
  accessibility: z.object({ summary: copy }),
  media: z.object({ heroImageKey: websitePhotoKey, contactBackgroundImageKey: websitePhotoKey, gallery: z.array(z.object({ key: websitePhotoKey, label: short, alt: short, category: z.enum(WEBSITE_GALLERY_CATEGORIES).optional(), caption: z.string().trim().max(250).optional() })).max(24) }),
  legal: z.object({ privacyDraft: z.string().trim().min(20).max(8000), termsDraft: z.string().trim().min(20).max(8000) }),
  customFaq: z.array(z.object({ question: short, answer: copy })).max(20),
  pageVisibility: z.object({ introduction: z.boolean(), gallery: z.boolean(), amenities: z.boolean(), nearby: z.boolean(), faq: z.boolean() }),
});

export type WebsiteContent = z.infer<typeof websiteContentSchema>;
export const DEFAULT_WEBSITE_CONTENT = websiteContentSchema.parse(seed);
export const websiteDocumentLimit = 48000;
export function websiteText(value: string, content: WebsiteContent) {
  return value.replaceAll("{name}", content.identity.name).replaceAll("{city}", content.identity.city).replaceAll("{district}", content.identity.district);
}
export function websitePhotoKeys(content: WebsiteContent) {
  return [...new Set([content.media.heroImageKey, content.media.contactBackgroundImageKey, ...content.media.gallery.map(item => item.key)])];
}
export type WebsiteImage = { id: string; alt: string; image_kind: "property" | "area"; bytes: number; width: number; height: number; deleting?: boolean; created_at?: string };
export type WebsiteSamplePhoto = { label: string; src: string; alt: string; caption: string; author?: string; sourceUrl?: string; license?: string; licenseUrl?: string; changes?: string; creditNote?: string; objectPosition?: string; isIllustrative: boolean };
export function websiteImageUrl(key: string, preview = false) {
  return `/api/website/images/${encodeURIComponent(key)}${preview ? "?preview=1" : ""}`;
}

export function websiteContentChanges(before: WebsiteContent, after: WebsiteContent) {
  const changes: { field: string; before: string; after: string }[] = [];
  const display = (value: unknown) => value === undefined || value === null ? "—" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
  function compare(old: unknown, next: unknown, path: string[]) {
    if (JSON.stringify(old) === JSON.stringify(next)) return;
    if ((old && typeof old === "object") || (next && typeof next === "object")) {
      for (const key of new Set([...Object.keys(old ?? {}), ...Object.keys(next ?? {})])) {
        if (key !== "id" && key !== "schemaVersion") compare((old as Record<string, unknown> | null)?.[key], (next as Record<string, unknown> | null)?.[key], [...path, /^\d+$/.test(key) ? `Item ${Number(key) + 1}` : key]);
      }
    } else changes.push({ field: path.join(" / ").replace(/([a-z])([A-Z])/g, "$1 $2"), before: display(old), after: display(next) });
  }
  compare(before, after, []);
  return changes;
}
