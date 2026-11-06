import { getPublishedLocation } from "@/lib/location-content-server";
import { hotelDirections, hasCoordinates } from "@/lib/location-content";
import { LocationSections } from "./location-sections";
import { MapPin, ArrowRight } from "lucide-react";

export async function WebsiteLocation() {
  const result = await getPublishedLocation(), hotel = result.content.hotel;
  const structured = hotel?.status === "published" && !hotel.is_demo && hotel.verified_at && hasCoordinates(hotel) ? { "@context": "https://schema.org", "@type": "Hotel", name: hotel.name, address: hotel.address, geo: { "@type": "GeoCoordinates", latitude: hotel.latitude, longitude: hotel.longitude }, hasMap: hotelDirections(hotel) } : null;
  return <>{structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />}<LocationSections content={result.content} unavailable={result.unavailable} /></>;
}
export async function HotelContactMapLink() {
  const { content } = await getPublishedLocation(), href = hotelDirections(content.hotel);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer"><MapPin size={17} />Open in Maps <ArrowRight size={14} /></a> : null;
}
