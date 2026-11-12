import areaPhotos from "./website-area-photos.json";
import { roomPhotos } from "./room-images";
import { websiteImageUrl, type WebsiteImage, type WebsiteSamplePhoto } from "./website-content";

export const WEBSITE_SAMPLE_PHOTOS: Record<string, WebsiteSamplePhoto> = {
  room: { label: "Deluxe King concept", src: "/room-samples/deluxe-king-room.webp", alt: "Illustrative Deluxe King room concept", caption: "Illustrative room concept", isIllustrative: true },
  bathroom: { label: "Bathroom concept", src: "/room-samples/deluxe-king-bathroom.webp", alt: "Illustrative guest bathroom concept", caption: "Illustrative bathroom concept", isIllustrative: true },
  ocean: { label: "Suite reference", src: roomPhotos("Ocean Suite")[0], alt: "Illustrative suite interior reference", caption: "Illustrative stock room photo", isIllustrative: true },
  executive: { label: "Executive room reference", src: roomPhotos("Executive Suite")[0], alt: "Illustrative executive room reference", caption: "Illustrative stock room photo", isIllustrative: true },
  ...areaPhotos,
};

export function websitePhoto(key: string, images: WebsiteImage[] = [], preview = false): WebsiteSamplePhoto | null {
  if (WEBSITE_SAMPLE_PHOTOS[key]) return WEBSITE_SAMPLE_PHOTOS[key];
  const image = images.find(item => item.id === key && !item.deleting);
  return image ? { label: image.alt, src: websiteImageUrl(key, preview), alt: image.alt, caption: image.alt, isIllustrative: false } : null;
}
