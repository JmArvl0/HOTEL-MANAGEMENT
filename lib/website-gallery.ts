import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent, type WebsiteGalleryCategory, type WebsiteImage, type WebsiteSamplePhoto } from "./website-content";
import { websitePhoto } from "./website-media";

export type HotelGalleryPhoto = {
  id: string;
  label: string;
  alt: string;
  caption: string;
  categories: WebsiteGalleryCategory[];
  photo: WebsiteSamplePhoto;
};

/** Older published documents have no category. Keep their copy and order intact. */
export function galleryCategory(item: WebsiteContent["media"]["gallery"][number]): WebsiteGalleryCategory {
  if (item.category) return item.category;
  const text = `${item.label} ${item.alt}`;
  if (/exterior|fa[çc]ade|entrance|arrival|courtyard|outdoor/i.test(text)) return "Exterior";
  if (/dining|restaurant|breakfast|food/i.test(text)) return "Dining";
  if (/lobby|lounge|reception|hallway|shared/i.test(text)) return "Shared Spaces";
  if (/pool|fitness|gym|amenit|bathroom/i.test(text)) return "Amenities";
  return "Rooms";
}

function concept(id: string, label: string, caption: string, categories: WebsiteGalleryCategory[]): HotelGalleryPhoto {
  const alt = `Illustrative Haven Hotel concept: ${label.toLowerCase()}`;
  return { id, label, caption, categories, alt, photo: { label, alt, caption: "AI-generated fictional Haven Hotel concept", src: `/website-samples/gallery/${id}.webp`, isIllustrative: true } };
}

/** The untouched fictional seed gets a complete visual journey. Any gallery edit,
 * including removal of all photos, opts out. Client publications never use it. */
export function hotelGalleryPhotos(content: WebsiteContent, images: WebsiteImage[], preview = false): HotelGalleryPhoto[] {
  const published = content.media.gallery.flatMap((item, index) => {
    const photo = websitePhoto(item.key, images, preview);
    return photo ? [{ id: `${item.key}-${index}`, label: item.label, alt: item.alt, caption: item.caption ?? "", categories: [galleryCategory(item)], photo }] : [];
  });
  const untouchedDemo = content.isDemo && JSON.stringify(content.media.gallery) === JSON.stringify(DEFAULT_WEBSITE_CONTENT.media.gallery);
  if (!untouchedDemo) return published;
  const room = published.find(item => item.id.startsWith("room-"));
  const bathroom = published.find(item => item.id.startsWith("bathroom-"));
  return [
    concept("exterior", `${content.identity.shortName.charAt(0)}${content.identity.shortName.slice(1).toLowerCase()} Hotel Exterior`, `A welcoming stay in the heart of ${content.identity.district}, ${content.identity.city}.`, ["Exterior"]),
    concept("entrance", "Your arrival at Haven", "Your stay begins here.", ["Exterior"]),
    concept("lobby", "A warm welcome", "A moment to settle in, a space to feel at home.", ["Shared Spaces"]),
    ...(room ? [{ ...room, label: "Deluxe King Room", caption: "Room to unwind, with thoughtful details throughout." }] : []),
    concept("dining", content.dining.name, "Gather around the table.", ["Dining"]),
    concept("evening", "Haven after hours", "A warm welcome, from morning to evening.", ["Exterior"]),
    concept("courtyard", "The garden courtyard", "Find a little calm between city adventures.", ["Exterior", "Shared Spaces"]),
    concept("pool", "Poolside at Haven", "A little sunshine. No hurry.", ["Exterior", "Amenities"]),
    ...(bathroom ? [{ ...bathroom, label: "The finer details", caption: "Thoughtfully considered, down to the last detail." }] : []),
  ];
}
