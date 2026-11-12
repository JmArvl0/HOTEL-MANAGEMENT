import { getPublishedLocation } from "@/lib/location-content-server";
import { hotelDirections, hasCoordinates } from "@/lib/location-content";
import { LocationSections } from "./location-sections";
import { MapPin, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { websitePhoto } from "@/lib/website-media";

export async function WebsiteLocation({ showHotelCard = true, showNearby = true, nearbyIntro, contact }: { showHotelCard?: boolean; showNearby?: boolean; nearbyIntro?: string; contact?: ReactNode } = {}) {
  const [result, website] = await Promise.all([getPublishedLocation(), getPublishedWebsiteContent()]);
  const hotel = result.content.hotel;
  const savedPhoto = websitePhoto(website.content.media.contactBackgroundImageKey, website.images);
  const referencePhoto = hotel?.is_demo && hotel.maps_label.includes("Rizal Park") && website.content.isDemo && website.content.media.contactBackgroundImageKey === "rizal";
  const photo = referencePhoto ? { src: "/website-samples/location/rizal-sunset.webp", alt: "Illustrative sunset view of the Rizal Monument and gardens in Manila" } : savedPhoto;
  const label = hotel?.is_demo ? `${website.content.identity.district}, ${website.content.identity.city}` : hotel?.name;
  const structured = hotel?.status === "published" && !hotel.is_demo && hotel.verified_at && hasCoordinates(hotel) ? { "@context": "https://schema.org", "@type": "Hotel", name: hotel.name, address: hotel.address, geo: { "@type": "GeoCoordinates", latitude: hotel.latitude, longitude: hotel.longitude }, hasMap: hotelDirections(hotel) } : null;
  return <>{structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />}<LocationSections content={result.content} unavailable={result.unavailable} showHotelCard={showHotelCard} showNearby={showNearby} nearbyIntro={nearbyIntro} contact={contact} photo={photo} label={label} /></>;
}
export async function HotelContactMapLink() {
  const { content } = await getPublishedLocation(), href = hotelDirections(content.hotel);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer"><MapPin size={17} />Open in Maps <ArrowRight size={14} /></a> : null;
}
