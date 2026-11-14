import Link from "next/link";
import { MapPin } from "lucide-react";
import { requireCustomerSession } from "@/lib/customer-auth";
import { displayTime, getOperationalPolicy } from "@/lib/hotel-policy";
import { getPublishedWebsiteContent } from "@/lib/website-content-server";
import { getPublishedLocation } from "@/lib/location-content-server";
import { hotelDirections } from "@/lib/location-content";
import { FrontDeskSupport } from "@/components/customer/front-desk-support";

export default async function StayGuidePage() {
  await requireCustomerSession();
  const [policy, website, location] = await Promise.all([getOperationalPolicy(), getPublishedWebsiteContent(), getPublishedLocation()]);
  const { content } = website;
  const hotel = location.content.hotel;
  const directions = hotelDirections(hotel);
  return <div className="my-stay-guide">
    <header className="customer-page-title"><h1>Your stay guide</h1><p>Arrival essentials, hotel facilities and help, all in one place.</p></header>
    <section className="my-stay-guide-section"><h2>Before you arrive</h2><dl>
      <div><dt>Check-in</dt><dd>From {displayTime(policy.checkInTime)}</dd></div>
      <div><dt>Check-out</dt><dd>By {displayTime(policy.checkOutTime)}</dd></div>
      <div><dt>Hotel time</dt><dd>{policy.hotelTimezone}</dd></div>
      <div><dt>Identification</dt><dd>{policy.validIdRequired ? "Bring a valid government-issued ID for check-in at Front Desk." : "Contact Front Desk to check which arrival documents to bring."}</dd></div>
      <div><dt>Balance & incidentals</dt><dd>Due {policy.incidentalsDue.toLowerCase()}.</dd></div>
    </dl><p>For the terms that apply to your booking, open its reservation details. Those use the policy saved when you booked.</p><Link href="/my-reservations">Open my reservations</Link></section>
    <section className="my-stay-guide-section"><h2>Getting here</h2>
      {hotel ? <><p>{hotel.name}<br />{hotel.address}</p><p>{hotel.entrance_notes}</p>{hotel.is_demo && <p>Illustrative demo location. Confirm the hotel address with Front Desk before travelling.</p>}{directions && <a href={directions} target="_blank" rel="noopener noreferrer"><MapPin size={17} aria-hidden="true" />Open directions</a>}</> : <p>Directions are currently unavailable. Contact Front Desk before travelling.</p>}
    </section>
    <section className="my-stay-guide-section"><h2>Breakfast & facilities</h2>
      {website.unavailable ? <p>Facility information is currently unavailable. Please check with Front Desk.</p> : <>
        {content.isDemo && <p>Demo hotel information. Check your reservation for booked breakfast inclusions.</p>}
        <p><strong>{content.dining.name}</strong><br />Breakfast: {displayTime(content.dining.breakfastStart)}–{displayTime(content.dining.breakfastEnd)}. {content.dining.breakfastSchedule}</p>
        <ul>{content.amenities.filter((item) => item.enabled).map((item) => <li key={item.id}><strong>{item.name}</strong> — {item.description}</li>)}</ul>
        <p>For facility hours that are not listed, ask Front Desk before visiting.</p>
      </>}
    </section>
    <section className="my-stay-guide-section"><h2>Hotel rules & booking changes</h2><ul>
      <li>{policy.petsAllowed ? "Pets are permitted under the hotel's guidelines." : "Pets are not permitted."}</li>
      <li>{policy.smokingAllowed ? "Ask Front Desk about designated smoking areas." : "Smoking is not permitted."}</li>
      <li>Room preferences and special requests are subject to hotel confirmation.</li>
    </ul><p>Open your reservation to see applicable cancellation deadlines, refund eligibility and change-request progress before making a request.</p><Link href="/my-reservations">View booking & cancellation details</Link></section>
    <FrontDeskSupport />
  </div>;
}
