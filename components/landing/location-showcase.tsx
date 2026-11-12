"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Footprints, Landmark, Trees, Utensils } from "lucide-react";
import { hotelDirections, locationDistance, locationImageUrl, placeNavigation, type LocationContent, type LocationPlace } from "@/lib/location-content";
import areaPhotos from "@/lib/website-area-photos.json";
import { PhotoCredit } from "./hotel-information";
import "./location-showcase.css";

export type LocationPhoto = { src: string; alt: string };

function ShowcasePhoto({ photo, sizes, fill = true }: { photo: LocationPhoto; sizes: string; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="location-photo-error">Photo unavailable</span> :
    <Image src={photo.src} alt={photo.alt} {...(fill ? { fill: true } : { width: 1860, height: 846 })} sizes={sizes} onError={() => setFailed(true)} />;
}
function referencePlace(place: LocationPlace) {
  const originalDescriptions: Record<string, string> = {
    rizal: "Explore Rizal Park and its monument in Ermita, Manila. Check current visitor information before you go.",
    museum: "Discover the National Museum complex in Manila. The photograph shows the National Museum of Fine Arts. Check opening hours and admission information with the museum.",
    cafe: "Coffee, fresh pastries, and a sunlit corner to start your day.",
  };
  if (place.image_id || place.description !== originalDescriptions[place.sample_image ?? ""]) return null;
  if (place.sample_image === "rizal" && place.name === "Rizal Park") return { title: "Rizal Park", meta: "3 min walk", description: "A national landmark and cultural green space." };
  if (place.sample_image === "museum" && place.name === "Manila museum district") return { title: "National Museum", meta: "5 min walk", description: "Explore the Philippines’ rich history and heritage." };
  if (place.sample_image === "cafe" && place.name === "A local café") return { title: "Restaurants nearby", meta: "Within 5–10 min walk", description: "A variety of local and international dining options." };
  return null;
}

export function orderedNearbyPlaces({ hotel, places }: LocationContent) {
  const first = hotel?.is_demo
    ? (["rizal", "museum", "cafe"] as const).flatMap(sample => places.find(place => place.sample_image === sample) ?? [])
    : places.filter(place => place.featured);
  const featuredIds = new Set(first.map(place => place.id));
  return [...first, ...places.filter(place => !featuredIds.has(place.id))];
}

export function LocationHighlights({ content }: { content: LocationContent }) {
  const hotel = content.hotel;
  if (!hotel || !content.places.length) return null;
  const highlights = orderedNearbyPlaces(content).slice(0, 3);
  return <div className="location-nearby" aria-labelledby="location-highlights-title">
    <div className="location-nearby-heading"><h3 id="location-highlights-title">Nearby highlights</h3></div>
    <div className="location-nearby-grid" role="group" aria-label="Nearby highlight cards" tabIndex={0}>{highlights.map(place => {
      const sample = hotel.is_demo ? referencePlace(place) : null;
      const dining = content.categories.find(category => category.id === place.category_id)?.slug === "dining";
      const src = sample && dining ? "/website-samples/location/dining.webp" : locationImageUrl(place);
      const href = placeNavigation(place, hotel);
      const meta = sample?.meta || locationDistance(place, hotel.is_demo);
      return <article className={`location-nearby-card${src ? "" : " location-nearby-no-photo"}`} key={place.id}>
        {src && <div className="location-nearby-photo"><ShowcasePhoto key={src} photo={{ src, alt: sample && dining ? "Illustrative restaurant dish: seared fish with vegetables" : place.image_alt }} sizes="(max-width: 680px) 38vw, (max-width: 1100px) 22vw, 15vw" /></div>}
        <div className="location-nearby-copy"><h4>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{sample?.title || place.name}</a> : place.name}</h4>
          {meta && <p className="location-nearby-meta">{dining ? <Utensils size={19} aria-hidden="true" /> : <Footprints size={19} aria-hidden="true" />}<span>{meta}</span></p>}
          <p className="location-nearby-description">{sample?.description || place.description}</p>
        </div>
      </article>;
    })}</div>
    <details className="location-photo-notes"><summary>About this area guide & photos</summary>
      {hotel.is_demo && <p>The Manila setting is illustrative. Walking times are sample values from this design, not verified routes from a hotel. Confirm your journey in Google Maps. The sunset scene and plated meal are AI-generated illustrations.</p>}
      {highlights.some(place => place.sample_image === "rizal") && <PhotoCredit photo={areaPhotos.rizal} />}
      {highlights.some(place => place.sample_image === "museum") && <PhotoCredit photo={areaPhotos.museum} />}
    </details>
  </div>;
}

export function LocationPhotoCard({ content, photo, label }: { content: LocationContent; photo?: LocationPhoto | null; label?: string }) {
  const hotel = content.hotel;
  if (!hotel) return null;
  const href = hotelDirections(hotel);
  const rizalDemo = hotel.is_demo && hotel.maps_label.includes("Rizal Park");
  const featured = content.places.find(place => place.featured && locationImageUrl(place));
  const src = featured && locationImageUrl(featured);
  const image = photo ?? (rizalDemo ? { src: "/website-samples/location/rizal-sunset.webp", alt: "Illustrative sunset view of the Rizal Monument and gardens in Manila" } : src && featured ? { src, alt: featured.image_alt } : null);
  return <div className="location-photo-card">
    {image && <ShowcasePhoto key={image.src} photo={image} fill={false} sizes="(max-width: 1100px) 100vw, 58vw" />}
    <div className="location-photo-overlay" aria-hidden="true" /><span className="location-photo-arc" aria-hidden="true" />
    <div className="location-photo-content"><h3>{label || (rizalDemo ? "Ermita, Manila" : hotel.name)}</h3>
      {rizalDemo ? <ul className="location-chips" aria-label="Neighborhood features"><li><Landmark aria-hidden="true" />Historic district</li><li><Trees aria-hidden="true" />Near Rizal Park</li><li><Utensils aria-hidden="true" />Dining nearby</li></ul> : <><address>{hotel.address}</address>{hotel.entrance_notes && <p>{hotel.entrance_notes}</p>}</>}
      {href && <a className="location-directions" href={href} target="_blank" rel="noopener noreferrer">View Directions <ArrowRight size={25} aria-hidden="true" /></a>}
    </div>
  </div>;
}
