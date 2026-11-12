import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Star, BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPublishedReviews } from "@/lib/stay-reviews";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { websiteText } from "@/lib/website-content";
import { getPublishedLocation } from "@/lib/location-content-server";
import { getPublicBookingInformation } from "@/lib/public-booking-information-server";
import { PublicWebsiteNav } from "./public-website-nav";
import { WebsiteFooter } from "./website-footer";
import { BookingIntentProvider, FeaturedStays, HeroBookingForm } from "./booking-intent";
import { HotelHero, HotelAmenities, HotelAmenitiesDecoration, HotelAmenitiesDivider, HotelGallery, HotelContact, HotelFaq, BookingPolicySummary } from "./hotel-information";
import { WebsiteLocation } from "./website-location";
import { LocationLoading } from "./location-sections";
import { HotelArrivalDecoration, HotelArrivalDivider } from "./hotel-faq";
import "./hotel-rooms.css";

export async function websiteHomeMetadata(): Promise<Metadata> {
  const { content } = await getPublishedWebsiteContent();
  return { title: websiteText(content.identity.metaTitle, content), description: content.identity.heroLead };
}

export async function HotelHome() {
  const [website, location, information, reviews, result] = await Promise.all([
    getPublishedWebsiteContent(), getPublishedLocation(), getPublicBookingInformation(), getPublishedReviews(),
    supabase ? supabase.from("room_types").select("id,name,description,max_guests,beds,size_sqm,amenities,base_rate,photo_urls").eq("active", true).order("base_rate", { ascending: true }) : Promise.resolve(null),
  ]);
  const { content, images } = website;
  const rooms = result?.error ? [] : result?.data ?? [];
  const maxGuests = rooms.length ? Math.min(8, Math.max(...rooms.map(room => Number(room.max_guests)))) : 4;
  return <main className="landing coastal-landing hotel-public hotel-home">
    <PublicWebsiteNav rootLinks={false} bookingHref="#book" overHero />
    <BookingIntentProvider>
      <div className="hotel-hero-stage">
        <HotelHero content={content} images={images} />
        <section className="hotel-booking" id="book" aria-labelledby="booking-title">
          <HeroBookingForm maxGuests={maxGuests} timeZone={information.operations.hotelTimezone} />
          <details className="hotel-booking-policy">
            <summary>Booking policy</summary>
            <BookingPolicySummary information={information} />
          </details>
        </section>
      </div>
      {website.unavailable && <p className="hotel-demo-banner" role="status">Some hotel information is temporarily unavailable.</p>}
      <section className="hotel-section" id="stay" aria-labelledby="stays-title"><header><h2 id="stays-title">Rooms & suites</h2><p>Compare beds, space and nightly rates, then choose your exact room.</p></header>{rooms.length ? <FeaturedStays rooms={rooms} /> : <div className="coast-catalog-empty"><h3>Room availability is being updated.</h3><p>Search your dates for the latest room information.</p><Link href="/booking/search" className="coast-button">Search rooms</Link></div>}<p className="hotel-caption">Rates and availability vary by date. Photos show the room type. Choose a room to see its amenities.</p></section>
    </BookingIntentProvider>
    {content.pageVisibility.amenities && <section className="hotel-section hotel-amenities-section" id="amenities" aria-labelledby="hotel-amenities-title"><HotelAmenitiesDecoration /><header><HotelAmenitiesDivider /><h2 id="hotel-amenities-title">Amenities & dining</h2><p>Comfort, convenience and dining throughout your stay.</p></header><HotelAmenities content={content} images={images} viewport /></section>}
    {content.pageVisibility.gallery && <section className="hotel-section hotel-gallery-section" id="gallery" aria-label="Inside Haven"><HotelGallery content={content} images={images} /></section>}
    {reviews.length > 0 && <section className="hotel-section coast-reviews" id="reviews"><header><h2>Guest experiences</h2><p>Reviews from real completed stays.</p></header><div className="coast-review-grid">{reviews.map(review => <article key={review.id} className="coast-review-card"><p className="coast-review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map(star => <Star key={star} size={15} aria-hidden="true" fill={star <= review.rating ? "currentColor" : "none"} />)}</p><p className="coast-review-comment">“{review.comment}”</p><footer><b>{review.guestName}</b><span>{review.roomType}{review.stayLabel ? ` · ${review.stayLabel}` : ""}</span><span className="coast-review-verified"><BadgeCheck size={13} aria-hidden="true" />Verified stay</span></footer></article>)}</div></section>}
    <Suspense fallback={<LocationLoading />}>
      <WebsiteLocation
        showHotelCard={false}
        showNearby={content.pageVisibility.nearby}
        nearbyIntro={content.isDemo ? undefined : content.location.localGuide}
        contact={!content.isDemo ?
          <section id="contact" aria-labelledby="hotel-contact-title">
            <header className="wl-intro" id="location">
              <h2 id="hotel-contact-title">{content.isDemo ? "Location" : "Location & contact"}</h2>
            </header>
            <HotelContact content={content} images={images} hotel={location.content.hotel} />
          </section> : undefined
        }
      />
    </Suspense>
    {content.pageVisibility.faq && <section className="hotel-section hotel-arrival" id="faq" aria-labelledby="hotel-arrival-title"><HotelArrivalDecoration /><header><h2 id="hotel-arrival-title">Before you arrive.</h2><p>Arrival, family, access and booking information.</p><HotelArrivalDivider /></header><HotelFaq content={content} information={information} /></section>}
    <section className="hotel-section hotel-closing" aria-labelledby="hotel-closing-title">
      <h2 id="hotel-closing-title">Ready to find your room?</h2>
      <div className="hotel-actions"><a href="#book" className="coast-button">Check availability</a></div>
    </section>
    <WebsiteFooter content={content} />
  </main>;
}
