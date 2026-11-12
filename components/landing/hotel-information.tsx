import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, CarFront, Coins, ConciergeBell, Dumbbell, Mail, MapPin, Phone, Plane, Sprout, Utensils, WashingMachine, Waves, Wifi } from "lucide-react";
import type { WebsiteContent, WebsiteImage, WebsiteSamplePhoto } from "@/lib/website-content";
import { DEFAULT_WEBSITE_CONTENT, websiteText } from "@/lib/website-content";
import { websitePhoto } from "@/lib/website-media";
import { hotelDirections, hasCoordinates, type LocationHotel } from "@/lib/location-content";
import { publicCancellationSummary, publicDepositLabel, publicHotelTime, type PublicBookingInformation } from "@/lib/public-booking-information";
import { hotelGalleryPhotos } from "@/lib/website-gallery";
import { HotelGalleryCarousel } from "./hotel-gallery";
import { HotelFaqAccordion } from "./hotel-faq";
import "./hotel-information.css";

export function PhotoCredit({ photo }: { photo: WebsiteSamplePhoto | null }) {
  if (!photo?.sourceUrl) return null;
  return <details className="hotel-photo-credit"><summary>Photo credit</summary><p><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{photo.caption}</a> · {photo.author} · {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : photo.license}{photo.creditNote ? ` · ${photo.creditNote}` : ""}</p><p>{photo.changes}</p></details>;
}

export function HotelHero({ content, images, preview = false }: { content: WebsiteContent; images: WebsiteImage[]; preview?: boolean }) {
  const photo = websitePhoto(content.media.heroImageKey, images, preview);
  const headline = websiteText(content.identity.headline, content);
  return <section className="hotel-hero" aria-labelledby={preview ? undefined : "hotel-title"}>
    {photo && <Image src={photo.src} alt={photo.alt} fill loading={preview ? undefined : "eager"} fetchPriority={preview ? undefined : "high"} unoptimized={preview} sizes={preview ? "400px" : "(max-width: 600px) 840px, 100vw"} className="hotel-hero-image" />}
    <div className="hotel-hero-copy">
      <p className="hotel-place"><MapPin size={17} aria-hidden="true" />{content.identity.district} · {content.identity.city}</p>
      {preview ? <h2>{headline}</h2> : <h1 id="hotel-title">{headline}</h1>}
      <p className="hotel-hero-lead">{content.identity.heroLead}</p>
      {preview ? <span className="hotel-rooms-link">View rooms <ArrowRight size={17} aria-hidden="true" /></span> :
        <a className="hotel-rooms-link" href="#stay">View rooms <ArrowRight size={17} aria-hidden="true" /></a>}
    </div>
    {!preview && <svg className="hotel-hero-wave" viewBox="0 0 1440 124" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 99C202 36 355 50 547 75S1015 127 1440 30V124H0Z" />
      <path d="M0 114C213 52 370 65 561 89S1038 142 1440 46" />
    </svg>}
  </section>;
}

export function BookingPolicySummary({ information }: { information: PublicBookingInformation }) {
  const { deposit, operations } = information;
  return <div className="hotel-policy-summary"><div><h3>Before you reserve</h3><p>{deposit.enabled ? `${publicDepositLabel(deposit)} deposit required. Your reservation is confirmed after deposit verification.` : "Online deposit reservations are currently unavailable. Contact Front Desk for assistance."}</p><p className="hotel-caption">{deposit.remainingBalanceDue}. Rates include {operations.vatRateBp / 100}% VAT and {operations.serviceChargeBp / 100}% service charge.</p></div><div className="hotel-policy-links"><Link href="/booking-policy">Deposit & cancellation policy</Link><Link href="/terms">Booking terms</Link><Link href="/privacy">Privacy policy</Link></div><p className="hotel-caption">Your {deposit.holdMinutes}-minute room hold begins after you submit guest details.</p></div>;
}

export function HotelContact({ content, images, hotel, preview = false }: { content: WebsiteContent; images: WebsiteImage[]; hotel: LocationHotel | null; preview?: boolean }) {
  const photo = websitePhoto(content.media.contactBackgroundImageKey, images, preview);
  const verified = hotel && !hotel.is_demo && hotel.status === "published" && hotel.verified_at && hasCoordinates(hotel);
  const directions = !content.isDemo && verified ? hotelDirections(hotel) : null;
  const phoneHref = `tel:${content.contact.phone.replace(/[^+0-9]/g, "")}`;
  return <div className="hotel-contact-layout">
    <div>
      <div className="hotel-contact-photo">
        {photo && <Image src={photo.src} alt="" fill unoptimized={preview} sizes="(max-width:900px) 100vw,50vw" />}
        <div>
          <h3>{content.isDemo ? `${content.identity.district}, ${content.identity.city}` : content.identity.name}</h3>
          {!content.isDemo && <><p>{verified ? hotel.address : "Contact Front Desk for current directions."}</p>{verified && <p>{content.location.entranceNotes}</p>}</>}
          {!preview && <div className="hotel-actions">
            {content.isDemo ? <a className="coast-button" href="#how-to-go">View area map <ArrowRight size={16} /></a> : <>
              {directions && <a className="coast-button" href={directions} target="_blank" rel="noopener noreferrer">Get directions</a>}
              <a className="coast-button" href={phoneHref}><Phone size={16} />Call Front Desk</a>
            </>}
          </div>}
        </div>
      </div>
      <PhotoCredit photo={photo} />
    </div>
    {(!content.isDemo || preview) && <div className="hotel-contact-details">
      {content.isDemo ? <><h3>Explore the area</h3><p>Find landmarks, museums and transport connections in Manila.</p></> : <>
        <h3>Plan your arrival</h3><p>Front Desk: {content.contact.frontDeskHours}</p>
        <div className="hotel-contact-links"><a href={phoneHref}><Phone size={17} />{content.contact.phone}</a><a href={`mailto:${content.contact.email}`}><Mail size={17} />{content.contact.email}</a></div>
        <p className="hotel-caption">{content.family.summary}</p><p className="hotel-caption">{content.accessibility.summary}</p>
      </>}
    </div>}
  </div>;
}

const amenityIcons = new Map([
  ["wifi", Wifi],
  ["parking", CarFront],
  ["pool", Waves],
  ["fitness", Dumbbell],
  ["transfers", Plane],
  ["laundry", WashingMachine],
  ["service", ConciergeBell],
]);

// Facility hours are published as part of the description. Keep the original wording.
const amenityTimeRange = /(\b\d{1,2}:\d{2}(?:\s*[ap]m\b)?\s*(?:[–—-]|\bto\b)\s*\d{1,2}:\d{2}(?:\s*[ap]m\b)?)/gi;
const breakfastCurrency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
});

function AmenitiesList({ amenities, label = "Hotel amenities" }: { amenities: WebsiteContent["amenities"]; label?: string }) {
  return <ul className="hotel-amenity-list" role="list" aria-label={label}>
    {amenities.map(amenity => {
      const Icon = amenityIcons.get(amenity.icon ?? amenity.id) ?? ConciergeBell;
      const description = amenity.description.split(amenityTimeRange);
      return <li key={amenity.id} className="hotel-amenity-card">
        <span className="hotel-amenity-icon"><Icon aria-hidden="true" /></span>
        <div><h3>{amenity.name}</h3><p>{description.map((part, index) => index % 2 === 0 ? part : <strong key={index} className="hotel-amenity-hours">{part}</strong>)}</p></div>
      </li>;
    })}
  </ul>;
}

export function HotelAmenitiesDecoration() {
  return <>
    <Image className="hotel-amenities-leaves" src="/decor/amenities-leaves.png" alt="" width={360} height={240} sizes="(max-width: 680px) 170px, 360px" aria-hidden="true" />
    <svg className="hotel-amenities-waves" viewBox="0 0 1600 140" preserveAspectRatio="none" aria-hidden="true"><path d="M-60 115C190-30 300-10 550 73S830 128 1010 60S1380-10 1660 45" /><path d="M-60 127C190-18 300 2 550 85S830 140 1010 72S1380 2 1660 57" /><path d="M-60 139C190-6 300 14 550 97S830 152 1010 84S1380 14 1660 69" /></svg>
  </>;
}

export function HotelAmenitiesDivider() {
  return <span className="hotel-amenities-divider" aria-hidden="true"><Sprout size={34} strokeWidth={1.5} /></span>;
}

export function HotelAmenities({ content, images = [], preview = false, viewport = false }: { content: WebsiteContent; images?: WebsiteImage[]; preview?: boolean; viewport?: boolean }) {
  const amenities = content.amenities.filter(amenity => amenity.enabled);
  const { dining } = content;
  const diningPhoto = hotelGalleryPhotos(content, images, preview).find(item => item.categories.includes("Dining"));
  const untouchedDemo = content.isDemo && JSON.stringify(content.media.gallery) === JSON.stringify(DEFAULT_WEBSITE_CONTENT.media.gallery);
  const photo = untouchedDemo ? { src: "/website-samples/dining/breakfast.png", alt: "Illustrative breakfast concept with eggs, toast and cappuccino" } : diningPhoto?.photo;

  return (
    <div className="hotel-amenities">
      <div className="hotel-amenities-layout" tabIndex={viewport ? 0 : undefined} role={viewport ? "region" : undefined} aria-label={viewport ? "Amenities and dining details" : undefined}>
        {amenities.length > 0 && (
          <div className="hotel-amenities-facilities" tabIndex={viewport ? 0 : undefined} role={viewport ? "region" : undefined} aria-label={viewport ? "Hotel facilities" : undefined}>
            <AmenitiesList amenities={amenities.slice(0, 8)} />
            {amenities.length > 8 && <details className="hotel-amenities-overflow"><summary><span className="hotel-amenities-show">View all {amenities.length} amenities</span><span className="hotel-amenities-hide">Show fewer amenities</span></summary><AmenitiesList amenities={amenities.slice(8)} label="More hotel amenities" /></details>}
          </div>
        )}
        <article className={`hotel-dining${photo ? " hotel-dining-with-photo" : ""}`} id={preview ? undefined : "dining"} aria-label={dining.name} tabIndex={viewport ? 0 : undefined}>
          {photo && <Image className="hotel-dining-photo" src={photo.src} alt={photo.alt} fill sizes="(min-width: 1200px) 42vw, 100vw" unoptimized={preview} />}
          <div className="hotel-dining-intro">
            <span className="hotel-amenity-icon"><Utensils aria-hidden="true" /></span>
            <div>
              <h3>{dining.name}</h3>
              <p>{dining.description}</p>
            </div>
          </div>
          <dl className="hotel-breakfast-details">
            <div>
              <dt>Breakfast hours</dt>
              <dd>
                <strong><time dateTime={dining.breakfastStart}>{publicHotelTime(dining.breakfastStart)}</time>{" – "}<time dateTime={dining.breakfastEnd}>{publicHotelTime(dining.breakfastEnd)}</time></strong>
                <span>{dining.breakfastSchedule ?? "Daily"}</span>
              </dd>
              <CalendarDays className="hotel-breakfast-icon" aria-hidden="true" />
            </div>
            <div>
              <dt>{dining.breakfastIncluded ? "Breakfast" : "Optional breakfast"}</dt>
              <dd>
                <strong className="hotel-breakfast-price">{dining.breakfastIncluded ? "Included" : breakfastCurrency.format(dining.breakfastPrice)}</strong>
                <span>{dining.priceCaption ?? (dining.breakfastIncluded ? "In the room rate" : "Per person, per breakfast")}</span>
              </dd>
              <Coins className="hotel-breakfast-icon" aria-hidden="true" />
            </div>
          </dl>
          <Link className="hotel-dining-note" href={dining.ctaLink ?? "/booking/search"}>{dining.ctaText ?? "Review the inclusions for your selected offer."}</Link>
          {photo && (untouchedDemo || diningPhoto?.photo.isIllustrative) && <small className="hotel-dining-disclosure">Illustrative dining concept</small>}
        </article>
      </div>
    </div>
  );
}

export function HotelGallery({ content, images, preview = false }: { content: WebsiteContent; images: WebsiteImage[]; preview?: boolean }) {
  return <HotelGalleryCarousel photos={hotelGalleryPhotos(content, images, preview)} preview={preview} />;
}

export function HotelFaq({ content, information }: { content: WebsiteContent; information: PublicBookingInformation }) {
  const p = information.operations, d = information.deposit;
  const entries = [
    ["What are the check-in and check-out times?", `Check-in is from ${publicHotelTime(p.checkInTime)}; checkout is by ${publicHotelTime(p.checkOutTime)} (${p.hotelTimezone}). Early arrival and late departure require confirmation and may carry a charge.`],
    ["Is breakfast included?", content.dining.breakfastIncluded ? `Breakfast is included. Served at ${content.dining.name}, ${publicHotelTime(content.dining.breakfastStart)}–${publicHotelTime(content.dining.breakfastEnd)}.` : `Breakfast is optional at ₱${content.dining.breakfastPrice.toLocaleString("en-PH")} per person, per breakfast. Served at ${content.dining.name}, ${publicHotelTime(content.dining.breakfastStart)}–${publicHotelTime(content.dining.breakfastEnd)}.`],
    ["Can children stay, or can we request an extra bed?", content.isDemo ? "Choose a room that accommodates everyone in your party. Confirm any extra bed or cot requirements before booking." : `${content.family.summary} ${content.family.extraBeds}`],
    ["Can the hotel accommodate my access needs?", content.isDemo ? "Confirm the room layout and assistance you need before reserving." : content.accessibility.summary],
    ["How is my reservation confirmed?", `Choose a room type and room number, then submit guest details to begin a ${d.holdMinutes}-minute hold. Follow the displayed ${publicDepositLabel(d)} deposit instructions. Confirmation follows verification; selecting a room alone does not hold it.`],
    ["What are the cancellation terms?", publicCancellationSummary(p)],
    ["What should I bring for check-in?", `${p.validIdRequired ? "Bring a valid government-issued ID and your reservation details. " : "Bring your reservation details. "}The lead guest must be at least ${p.minimumBookingAge}. ${d.remainingBalanceDue}.`],
    ["Are pets or smoking allowed?", `${p.petsAllowed ? "Contact Front Desk to confirm the pet arrangements before booking." : "Pets are not permitted under the current hotel policy; ask Front Desk about assistance-animal arrangements."} ${p.smokingAllowed ? "Contact Front Desk for the designated smoking arrangements." : "Guest rooms and indoor shared spaces are smoke-free."}`],
    ...content.customFaq.map(item => [item.question, item.answer]),
  ];
  return <HotelFaqAccordion entries={entries} contact={content.contact} />;
}
