"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, MapPin, RotateCw } from "lucide-react";
import { EMPTY_LOCATION, hotelDirections, locationDistance, locationImageUrl, placeNavigation, routeDirections, safeGoogleEmbedUrl, type LocationContent, type LocationPlace, type LocationRoute } from "@/lib/location-content";
import "./location-sections.css";

function Photo({ record, className = "" }: { record: Pick<LocationPlace, "image_id" | "sample_image" | "image_alt">; className?: string }) {
  const src = locationImageUrl(record); const [failed, setFailed] = useState<string | null>(null);
  if (!src) return null;
  return <div className={`wl-photo ${className}`}>{failed === src ? <span>Photo unavailable</span> : <Image src={src} alt={record.image_alt} fill sizes="(max-width: 600px) 100vw, 50vw" unoptimized onError={() => setFailed(src)} />}</div>;
}
function Map({ embed, name }: { embed: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="wl-live-map">{!loaded && <p role="status" className="wl-map-loading">Loading map…</p>}<iframe title={`Interactive Google Map: ${name}`} src={embed} width="600" height="400" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" onLoad={() => setLoaded(true)} /></div>;
}
function MapsLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a className="wl-text-link" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={16} aria-hidden="true" /></a> : null;
}
export function LocationLoading() {
  return <div className="website-location wl-loading" aria-busy="true"><section id="how-to-go" className="coast-section"><h2>Find your way here.</h2><p role="status">Loading arrival information…</p></section><section id="nearby" className="coast-section"><h2>A little beyond your stay.</h2><p>Preparing the local guide…</p></section></div>;
}
export function LocationSections({ content: initialContent, unavailable: initialUnavailable = false }: { content: LocationContent; unavailable?: boolean }) {
  const [recovered, setRecovered] = useState<{ original: LocationContent; content: LocationContent; unavailable: boolean } | null>(null);
  const { content, unavailable } = recovered?.original === initialContent ? recovered : { content: initialContent, unavailable: initialUnavailable };
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [selectedRoute, setSelectedRoute] = useState<string | null>(null), [retrying, setRetrying] = useState(false);
  const hotel = content.hotel, hotelUrl = hotelDirections(hotel), embed = hotel?.embed_url ? safeGoogleEmbedUrl(hotel.embed_url) : null;
  const featured = content.places.find(place => place.featured), activeRoute = content.routes.find(route => route.id === selectedRoute) ?? content.routes[0];
  const places = content.places.filter(place => (category === "all" || place.category_id === category) && `${place.name} ${place.description} ${content.categories.find(item => item.id === place.category_id)?.name ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function retry() { setRetrying(true); try { const response = await fetch("/api/location", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(); setRecovered({ original: initialContent, content: body.data ?? EMPTY_LOCATION, unavailable: false }); } catch { setRecovered({ original: initialContent, content: initialContent, unavailable: true }); } finally { setRetrying(false); } }
  const empty = <div className="wl-empty"><h3>{unavailable ? "The local guide is unavailable." : "Your local guide is on its way."}</h3><p>{unavailable ? "Please try again, or contact Front Desk for help with your arrival." : "Our team is preparing the location and local guide. Contact Front Desk for help with your plans."}</p><div className="wl-empty-actions"><a href="#location" className="wl-text-link">Contact Front Desk <ArrowUpRight size={16} aria-hidden="true" /></a>{unavailable && <button className="wl-text-link" type="button" disabled={retrying} onClick={() => void retry()}><RotateCw size={16} aria-hidden="true" />{retrying ? "Loading…" : "Try again"}</button>}</div></div>;
  return <div className="website-location">
    <section className="coast-section wl-arrival-section" id="how-to-go" aria-labelledby="wl-arrival-title">
      <header className="wl-intro"><h2 id="wl-arrival-title">{hotel?.directions_title || "Find your way here."}</h2><p>{hotel?.directions_description || "Our location and your route, together. For a calmer start to your stay."}</p></header>
      {hotel?.is_demo && <p className="wl-demo-note">Demo only · This map uses a temporary example pin, not a verified hotel address. Photos are AI concepts and distances are manually maintained samples.</p>}
      {!hotel ? <div role={unavailable ? "alert" : undefined}>{empty}</div> : <>
        <div className="wl-arrival"><div className="wl-hotel">{hotel.is_demo && <span className="wl-demo-label">Temporary demo location</span>}<h3>{hotel.name}</h3><address>{hotel.address}</address>{hotel.entrance_notes && <p>{hotel.entrance_notes}</p>}{hotelUrl && <a className="coast-button coast-button-light" href={hotelUrl} target="_blank" rel="noopener noreferrer">{hotel.is_demo ? "Directions to demo pin" : "Get hotel directions"}<ArrowUpRight size={17} aria-hidden="true" /></a>}</div>
          <div className="wl-map-panel">{embed ? <Map key={embed} embed={embed} name={hotel.maps_label || hotel.name} /> : <div className="wl-map-missing"><MapPin aria-hidden="true" size={28} /><h3>Map not available yet.</h3><p>Use the directions link or contact Front Desk for arrival assistance.</p></div>}<div className="wl-map-caption"><span>{hotel.is_demo ? "Interactive map · Demo location" : "Explore our location"}</span><MapsLink href={hotelUrl}>Open in Google Maps</MapsLink></div></div>
        </div>
        <div className="wl-route-area"><h3>Where are you coming from?</h3>{content.routes.length ? <><div className="wl-routes">{content.routes.map((route: LocationRoute) => <article key={route.id} className={`wl-route${activeRoute?.id === route.id ? " is-selected" : ""}`}><Photo record={route} /><button type="button" className="wl-route-selector" aria-pressed={activeRoute?.id === route.id} onClick={() => setSelectedRoute(route.id)}><strong>{route.origin_name}</strong><span>{route.maps_label || "Route to the hotel"}</span></button>{locationDistance(route, hotel.is_demo) && <p className="wl-distance">{locationDistance(route, hotel.is_demo)}</p>}<div className="wl-route-action"><MapsLink href={routeDirections(route, hotel)}>Navigate with Google Maps</MapsLink></div></article>)}</div><p className="wl-route-guide" aria-live="polite">{activeRoute?.description}</p></> : <p className="wl-muted">Our arrival guides are being prepared. Use hotel directions or contact Front Desk.</p>}</div>
      </>}
    </section>
    <section className="coast-section wl-nearby-section" id="nearby" aria-labelledby="wl-nearby-title"><header className="wl-intro"><h2 id="wl-nearby-title">{hotel?.nearby_title || "A little beyond your stay."}</h2><p>{hotel?.nearby_description || "Discover dining, local landmarks, and useful connections for your stay."}</p></header>
      {!hotel || !content.places.length ? empty : <>
        {featured && <article className={`wl-feature${!locationImageUrl(featured) ? " wl-no-photo" : ""}`}><div className="wl-feature-visual"><Photo record={featured} />{featured.sample_image && <span className="wl-photo-caption">AI concept photo · sample destination</span>}</div><div className="wl-feature-copy"><h3>{featured.name}</h3><p>{featured.description}</p>{locationDistance(featured, hotel.is_demo) && <p className="wl-distance">{locationDistance(featured, hotel.is_demo)}</p>}<MapsLink href={placeNavigation(featured, hotel)}>{featured.maps_search && hotel.is_demo ? "Explore on Google Maps" : "Explore the destination"}</MapsLink></div></article>}
        <div className="wl-finder"><div className="wl-categories" aria-label="Nearby place categories"><button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All places</button>{content.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div><label className="wl-search">Find a place<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search places" /></label></div>
        <div className="wl-results-line"><span aria-live="polite">{places.length} {hotel.is_demo ? "sample " : ""}{places.length === 1 ? "place" : "places"}</span><span>{hotel.is_demo ? "AI concept photos · Sample distances" : "Distances are manually maintained by the hotel team"}</span></div>
        <div className="wl-places">{places.length ? places.map(place => <article key={place.id} className={`wl-place${!locationImageUrl(place) ? " wl-no-photo" : ""}`}><Photo record={place} /><div><span className="wl-category-name">{content.categories.find(item => item.id === place.category_id)?.name}</span><h3>{place.name}</h3><p>{place.description}</p>{locationDistance(place, hotel.is_demo) && <p className="wl-distance">{locationDistance(place, hotel.is_demo)}</p>}</div><MapsLink href={placeNavigation(place, hotel)}>{hotel.is_demo && place.maps_search ? "View on Google Maps" : "Get directions"}</MapsLink></article>) : <div className="wl-empty"><h3>No places match.</h3><p>Try a different name or category.</p><button type="button" className="wl-text-link" onClick={() => { setQuery(""); setCategory("all"); }}>Clear filters <RotateCw size={16} aria-hidden="true" /></button></div>}</div>
      </>}
    </section>
  </div>;
}
