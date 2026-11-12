import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { HotelGalleryGrid } from "@/components/landing/hotel-gallery";
import { PublicWebsiteNav } from "@/components/landing/public-website-nav";
import { WebsiteFooter } from "@/components/landing/website-footer";
import { hotelGalleryPhotos } from "@/lib/website-gallery";
export const metadata = { title: "Hotel gallery" };
export const revalidate = 300;
export default async function GalleryPage() {
  const { content, images } = await getPublishedWebsiteContent();
  return <main className="landing coastal-landing hotel-public hotel-gallery-page"><PublicWebsiteNav active="Gallery" /><HotelGalleryGrid photos={hotelGalleryPhotos(content, images)} /><WebsiteFooter content={content} /></main>;
}
