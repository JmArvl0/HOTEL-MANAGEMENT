"use client";

import Image from "next/image";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, List, Map as MapIcon, MapPin, RotateCw, Search, X } from "lucide-react";
import { EMPTY_LOCATION, hotelDirections, locationDistance, locationImageUrl, nearbyPlaceMap, placeNavigation, routeDirections, safeGoogleEmbedUrl, type LocationContent, type LocationPlace, type LocationRoute } from "@/lib/location-content";
import "./location-sections.css";
import "./nearby-guide.css";
import areaPhotos from "@/lib/website-area-photos.json";
import { PhotoCredit } from "./hotel-information";
import { LocationHighlights, LocationPhotoCard, orderedNearbyPlaces, type LocationPhoto } from "./location-showcase";

function Photo({ record, sizes = "(max-width: 680px) 90vw, 24vw" }: { record: Pick<LocationPlace, "image_id" | "sample_image" | "image_alt">; sizes?: string }) {
  const src = locationImageUrl(record); const [failed, setFailed] = useState<string | null>(null);
  if (!src) return null;
  const key = record.sample_image === "manila-transit" ? "transport" : record.sample_image === "transport" ? null : record.sample_image;
  const credit = key && key in areaPhotos ? areaPhotos[key as keyof typeof areaPhotos] : null;
  return <div className="wl-photo-with-credit"><div className="wl-photo">{failed === src ? <span>Photo unavailable</span> : <Image src={src} alt={record.image_alt} fill sizes={sizes} onError={() => setFailed(src)} />}</div>{credit && <PhotoCredit photo={credit} />}</div>;
}
function LocationMap({ embed, name }: { embed: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="wl-live-map">{!loaded && <p role="status" className="wl-map-loading">Loading map…</p>}<iframe title={`Interactive Google Map: ${name}`} src={embed} width="600" height="400" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" onLoad={() => setLoaded(true)} /></div>;
}
function MapsLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a className="wl-text-link" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={16} aria-hidden="true" /></a> : null;
}
export function LocationLoading() {
  return <div className="website-location wl-loading" aria-busy="true"><section id="how-to-go" className="coast-section"><h2>Find your way here.</h2><p role="status">Loading arrival information…</p></section><section id="nearby" className="coast-section"><h2>A little beyond your stay.</h2><p>Preparing the local guide…</p></section></div>;
}
export function LocationSections({ content: initialContent, unavailable: initialUnavailable = false, showHotelCard = true, showNearby = true, nearbyIntro, contact, photo, label }: { content: LocationContent; unavailable?: boolean; showHotelCard?: boolean; showNearby?: boolean; nearbyIntro?: string; contact?: ReactNode; photo?: LocationPhoto | null; label?: string }) {
  const [recovered, setRecovered] = useState<{ original: LocationContent; content: LocationContent; unavailable: boolean } | null>(null);
  const { content, unavailable } = recovered?.original === initialContent ? recovered : { content: initialContent, unavailable: initialUnavailable };
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [selectedRoute, setSelectedRoute] = useState<string | null>(null), [retrying, setRetrying] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const guideId = useId();
  const guide = useRef<HTMLDialogElement>(null);
  const guideTrigger = useRef<HTMLButtonElement>(null);
  const guideClose = useRef<HTMLButtonElement>(null);
  const guideBody = useRef<HTMLDivElement>(null);
  const guideMap = useRef<HTMLDivElement>(null);
  const guideViewToggle = useRef<HTMLButtonElement>(null);
  const hotel = content.hotel, embed = hotel?.embed_url ? safeGoogleEmbedUrl(hotel.embed_url) : null;
  const areaLabel = hotel?.maps_label || "Local area";
  const mapName = hotel?.is_demo ? areaLabel : hotel?.maps_label || hotel?.name || areaLabel;
  const guideTitle = showNearby
    ? (!hotel?.is_demo && hotel?.nearby_title) || "Explore Nearby Places"
    : "Arrival Guides";
  const showGuide = showNearby || (hotel && !hotel.is_demo && (showHotelCard || content.routes.length > 0));
  const activeRoute = content.routes.find(route => route.id === selectedRoute) ?? content.routes[0];
  const search = query.trim().toLocaleLowerCase();
  const categories = new Map(content.categories.map(item => [item.id, item.name]));
  const places = orderedNearbyPlaces(content).filter(place => {
    if (category !== "all" && place.category_id !== category) return false;
    const categoryName = place.category_id ? categories.get(place.category_id) : undefined;
    return `${place.name} ${place.description} ${categoryName ?? ""}`.toLocaleLowerCase().includes(search);
  });
  const selectedPlace = places.find(place => place.id === selectedPlaceId);
  const placeEmbed = selectedPlace && hotel ? nearbyPlaceMap(selectedPlace, hotel) : null;
  const guideEmbed = placeEmbed ?? embed;
  async function retry() { setRetrying(true); try { const response = await fetch("/api/location", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(); setRecovered({ original: initialContent, content: body.data ?? EMPTY_LOCATION, unavailable: false }); } catch { setRecovered({ original: initialContent, content: initialContent, unavailable: true }); } finally { setRetrying(false); } }
  function openGuide() {
    if (!guide.current || guide.current.open) return;
    setMapView(false);
    setSelectedPlaceId(null);
    guide.current.showModal();
    if (guideBody.current) guideBody.current.scrollTop = 0;
    guideClose.current?.focus({ preventScroll: true });
    setGuideOpen(true);
  }

  function closeGuide() {
    guide.current?.close();
  }

  function restoreGuideFocus() {
    if (guide.current?.open) return;
    setGuideOpen(false);
    guideTrigger.current?.focus({ preventScroll: true });
  }

  function switchGuideView() {
    if (guideBody.current) guideBody.current.scrollTop = 0;
    setMapView(value => !value);
  }

  function selectPlace(id: string) {
    setSelectedPlaceId(id);
    const toggle = guideViewToggle.current;
    if (toggle?.getClientRects().length) {
      toggle.focus({ preventScroll: true });
      if (guideBody.current) guideBody.current.scrollTop = 0;
      setMapView(true);
    }
  }

  function renderEmpty(inGuide = false) {
    return <div className="wl-empty">
      <h3>{unavailable ? "The local guide is unavailable." : "Your local guide is on its way."}</h3>
      <p>{unavailable ? "Please try again, or contact Front Desk for help with your arrival." : "Our team is preparing the location and local guide. Contact Front Desk for help with your plans."}</p>
      <div className="wl-empty-actions">
        <a href="#location" className="wl-text-link" onClick={inGuide ? closeGuide : undefined}>Contact Front Desk <ArrowUpRight size={16} aria-hidden="true" /></a>
        {unavailable && <button className="wl-text-link" type="button" disabled={retrying} onClick={() => void retry()}><RotateCw size={16} aria-hidden="true" />{retrying ? "Loading…" : "Try again"}</button>}
      </div>
    </div>;
  }
  return <div className="website-location">
    <section className="location-showcase wl-arrival-section" id="how-to-go" aria-labelledby="wl-arrival-title">
      {!contact && <><span id="contact" className="location-contact-anchor" /><span id="location" /></>}
      <div className="location-intro">
        <div className="location-intro-content">
          <header className="location-heading"><p className="location-eyebrow">Our location</p><h2 id="wl-arrival-title">{hotel?.is_demo ? "Find Us Easily" : hotel?.directions_title || "Find Us Easily"}</h2><p className="location-subtitle">{hotel?.is_demo ? "Everything you need to reach the hotel and explore the neighborhood." : hotel?.directions_description || "Everything you need to reach the hotel and explore the neighborhood."}</p></header>
          {!hotel ? <div role={unavailable ? "alert" : undefined}>{renderEmpty()}</div> : (
            <div className="location-main-grid">
              <LocationPhotoCard content={content} photo={photo} label={label} />
              <div className="location-map-card">{embed ? <LocationMap key={embed} embed={embed} name={mapName} /> : <div className="wl-map-missing"><MapPin aria-hidden="true" size={28} /><h3>Map not available yet.</h3><p>Use View Directions to open Google Maps.</p></div>}</div>
            </div>
          )}
        </div>
      </div>
      {showNearby && <div id="nearby"><LocationHighlights content={content} /></div>}
      {showGuide && <div className="location-guide">
        <div className="location-guide-actions">
          <button ref={guideTrigger} type="button" className="location-guide-toggle" aria-haspopup="dialog" aria-controls={guideId} onClick={openGuide}>
            {showNearby ? "Explore Nearby Places" : "View Arrival Guides"}<ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
        <dialog
          ref={guide}
          id={guideId}
          className="nearby-guide-dialog"
          aria-labelledby={`${guideId}-title`}
          onClose={restoreGuideFocus}
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeGuide();
            }
          }}
        >
          <header className="nearby-guide-bar">
            <div className="nearby-guide-brand"><span aria-hidden="true">HAVEN</span><span>{showNearby ? "Nearby Guide" : "Arrival Guide"}</span></div>
            <button ref={guideClose} type="button" className="nearby-guide-close" aria-label="Close guide" onClick={closeGuide}><X size={23} aria-hidden="true" /></button>
          </header>
          <div ref={guideBody} className="nearby-guide-body" data-view={mapView ? "map" : "places"}>
            <div className="nearby-guide-heading">
              <h2 id={`${guideId}-title`}>{guideTitle}</h2>
              {showNearby && <p>{hotel?.is_demo ? "Discover the neighborhood around Haven." : nearbyIntro || hotel?.nearby_description || "Discover dining, landmarks, and useful connections for your stay."}</p>}
              {showNearby && hotel && content.places.length > 0 && <div className="nearby-guide-filters">
                <label className="nearby-guide-search"><Search size={20} aria-hidden="true" /><input type="search" aria-label="Search places" placeholder="Search places" value={query} onChange={event => setQuery(event.target.value)} /></label>
                <div className="wl-categories" role="group" aria-label="Nearby place categories">
                  <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All places</button>
                  {content.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}
                </div>
              </div>}
            </div>
            {guideOpen && <div className="nearby-guide-columns">
              <div ref={guideMap} id={`${guideId}-map`} className="nearby-guide-map" aria-label="Area map" role="region" tabIndex={-1}>
                {placeEmbed && selectedPlace && <div className="nearby-guide-map-selection">
                  <p role="status"><MapPin size={17} aria-hidden="true" />{selectedPlace.name}</p>
                  <button type="button" className="wl-text-link" onClick={() => { setSelectedPlaceId(null); guideMap.current?.focus({ preventScroll: true }); }}>Reset map</button>
                </div>}
                {guideEmbed ? <LocationMap key={guideEmbed} embed={guideEmbed} name={placeEmbed && selectedPlace ? selectedPlace.name : `${mapName} neighborhood guide`} /> : <div className="wl-map-missing">
                  <MapPin aria-hidden="true" size={28} /><h3>Map not available yet.</h3>
                  <MapsLink href={hotelDirections(hotel)}>Open directions in Google Maps</MapsLink>
                </div>}
                {hotel?.is_demo && <p className="nearby-guide-map-note">Illustrative guide. Confirm your route in Google Maps.</p>}
              </div>
              <div id={`${guideId}-places`} className="nearby-guide-results" aria-label={showNearby ? "Nearby places" : "Arrival routes"} role="region">
                {showNearby && (!hotel || !content.places.length ? renderEmpty(true) : <>
                  <p className="nearby-guide-count" role="status">{places.length} {places.length === 1 ? "place" : "places"}</p>
                  <div className="wl-places">
                    {places.length ? places.map(place => {
                      const categoryName = place.category_id ? categories.get(place.category_id) : undefined;
                      const distance = place.distance_reviewed_at ? locationDistance(place, hotel.is_demo) : null;
                      const canFocusMap = Boolean(nearbyPlaceMap(place, hotel));
                      const selected = Boolean(placeEmbed && place.id === selectedPlaceId);
                      return <article key={place.id} className={`wl-place${locationImageUrl(place) ? "" : " wl-no-photo"}`} data-selected={selected}>
                        <Photo record={place} sizes="(max-width: 680px) 30vw, 20vw" />
                        <div className="nearby-guide-place-copy">
                          <h3>{place.name}</h3>
                          {categoryName && <p className="nearby-guide-category"><MapPin size={14} aria-hidden="true" />{categoryName}</p>}
                          <p>{place.description}</p>
                          {distance && <p className="wl-distance">{distance}</p>}
                          <div className="nearby-guide-place-actions">
                            {canFocusMap && <button
                              type="button"
                              className="nearby-guide-focus-place"
                              aria-label={`Show on map: ${place.name}`}
                              aria-pressed={selected}
                              aria-controls={`${guideId}-map`}
                              onClick={() => selectPlace(place.id)}
                            ><MapPin size={15} aria-hidden="true" />Show on map</button>}
                            <MapsLink href={placeNavigation(place, hotel)}>{hotel.is_demo && place.maps_search ? "View on Google Maps" : "Get directions"}</MapsLink>
                          </div>
                        </div>
                      </article>;
                    }) : <div className="wl-empty">
                      <h3>No places match.</h3><p>Try a different name or category.</p>
                      <button type="button" className="wl-text-link" onClick={() => { setQuery(""); setCategory("all"); }}>Clear filters <RotateCw size={16} aria-hidden="true" /></button>
                    </div>}
                  </div>
                </>)}
                {hotel && !hotel.is_demo && <div className="wl-route-area">
                  <h3>Where are you coming from?</h3>
                  {content.routes.length ? <>
                    <div className="wl-routes">{content.routes.map((route: LocationRoute) => <article key={route.id} className={`wl-route${activeRoute?.id === route.id ? " is-selected" : ""}`}>
                      <Photo record={route} />
                      <button type="button" className="wl-route-selector" aria-pressed={activeRoute?.id === route.id} onClick={() => setSelectedRoute(route.id)}><strong>{route.origin_name}</strong><span>{route.maps_label || "Route to the hotel"}</span></button>
                      {locationDistance(route, hotel.is_demo) && <p className="wl-distance">{locationDistance(route, hotel.is_demo)}</p>}
                      <div className="wl-route-action"><MapsLink href={routeDirections(route, hotel)}>Navigate with Google Maps</MapsLink></div>
                    </article>)}</div>
                    <p className="wl-route-guide" aria-live="polite">{activeRoute?.description}</p>
                  </> : <p className="wl-muted">Our arrival guides are being prepared. Use hotel directions or contact Front Desk.</p>}
                </div>}
              </div>
            </div>}
          </div>
          <div className="nearby-guide-mobile-actions">
            <button ref={guideViewToggle} type="button" aria-controls={`${guideId}-map ${guideId}-places`} onClick={switchGuideView}>
              {mapView ? <List size={20} aria-hidden="true" /> : <MapIcon size={20} aria-hidden="true" />}{mapView ? "View list" : "View map"}
            </button>
          </div>
        </dialog>
      </div>}
    </section>
    {contact && <div className="hotel-section location-contact">{contact}</div>}
  </div>;
}
