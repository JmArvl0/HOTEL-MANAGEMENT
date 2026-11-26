import { bookingCheckoutEnabled } from "@/lib/booking-checkout-policy";
import { BookingPolicySummary } from "@/components/landing/hotel-information";
import { publicDepositEstimate } from "@/lib/public-booking-information";
import { getPublicBookingInformation } from "@/lib/public-booking-information-server";
import Link from 'next/link';
import {getServerSession} from 'next-auth';
import {notFound} from 'next/navigation';
import {authOptions} from '@/lib/auth';
import {getRoomCatalog,getRoomType,parseSearchIntent, hotelToday} from '@/lib/booking';
import {getExactRooms,type ExactRoom} from '@/lib/exact-rooms';
import {resolveRoomAmenities} from '@/lib/room-amenities';
import {roomPhotosFor} from '@/lib/room-images';
import {formatPeso} from '@/lib/format';
import {StaySearchPanel} from '@/components/booking/stay-search-panel';
import {RoomPhotoTrigger} from '@/components/booking/room-photo-lightbox';
import {RoomPhoto} from '@/components/booking/room-photo';
import {ChooseDatesButton} from '@/components/booking/choose-dates-button';
import {PublicWebsiteNav} from '@/components/landing/public-website-nav';
import { getBreakfastChoice } from '@/lib/breakfast-server';
import '../../search/search.css';
import './rooms.css';
import '@/components/customer/breakfast-pass.css';
export default async function RoomsPage({params,searchParams}:{params:Promise<{type:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const [{type:encodedType},raw,session]=await Promise.all([params,searchParams,getServerSession(authOptions)]);
 let type:string;try{type=decodeURIComponent(encodedType)}catch{notFound()}
 const information=await getPublicBookingInformation();
 const catalog=await getRoomCatalog();const room=catalog.find(r=>r.name===type);if(!room)notFound();
 const intent=parseSearchIntent(raw,hotelToday(information.operations.hotelTimezone));
 const stay=intent.mode==='availability'?{checkIn:intent.checkIn,checkOut:intent.checkOut,guests:intent.guests}:null;
 const correction=intent.mode==='browse'?intent.correction:undefined;
 const validation=correction && intent.mode==='browse' && intent.notice?{field:correction.field,message:intent.notice}:undefined;
 let choices:ExactRoom[]=[];let error=false;let priced=null;
 try{if(stay){[choices,priced]=await Promise.all([getExactRooms(type,stay),getRoomType(type,stay)]);}else{const {supabase}=await import('@/lib/supabase');if(supabase){const result=await supabase.from('rooms').select('id,number,floor,amenity_additions,amenity_exclusions').eq('type',type).eq('administratively_active',true).order('number');if(result.error)throw result.error;choices=(result.data??[]).map(r=>({...r,available:false,amenities:resolveRoomAmenities(room.amenities,r.amenity_additions,r.amenity_exclusions).effective}));}}}catch{error=true;}
 const photos=roomPhotosFor(room.photos,room.name);const capacity=!!stay&&stay.guests<=room.maxGuests;
 const checkoutOpen=stay ? await bookingCheckoutEnabled() : false;
 const breakfast=stay&&capacity&&priced ? await getBreakfastChoice(room.id,stay.checkIn,stay.checkOut,stay.guests,priced.subtotal) : null;
 const availableCount = choices.filter(choice => choice.available && capacity).length;
 const resultCount = stay ? availableCount : choices.length;
 const illustrative = !room.photos.some(url => url.trim());
 return <main className="booking-page exact-room-page"><PublicWebsiteNav bookingHref="#book-form" active="Rooms" rootLinks/><div className="exact-room-content"><nav aria-label="Breadcrumb"><Link href="/#stay">Room types</Link><span> / {room.name}</span></nav><section className="exact-type-intro"><div><h1>{room.name}</h1><p>{room.description}</p><p>{room.beds} · {room.sizeSqm?`${room.sizeSqm} m² · `:''}Up to {room.maxGuests} guests</p><div className="exact-amenities">{room.amenities.map(a=><span key={a}>{a}</span>)}</div></div><RoomGallery photos={photos} roomName={room.name} illustrative={illustrative}/></section>
 <StaySearchPanel className="exact-room-search" maxGuests={Math.min(8,room.maxGuests)} timeZone={information.operations.hotelTimezone} action={`/booking/rooms/${encodeURIComponent(type)}`} initial={{checkIn:stay?.checkIn??correction?.checkIn,checkOut:stay?.checkOut??correction?.checkOut,guests:stay?.guests??Math.min(99,Math.max(1,Math.trunc(Number(raw.guests))||Math.min(2,room.maxGuests)))}} searched={stay??undefined} validation={validation}/>
 <div className="exact-room-results-heading">
   <h2>Choose your room</h2>
   {!error && <span>{resultCount} {resultCount === 1 ? "room" : "rooms"}{stay ? " available" : ""}</span>}
 </div>
 {!stay&&<p role="status">Choose your dates and check availability to book a room.</p>}{stay&&!capacity&&<p role="alert">This type accommodates up to {room.maxGuests} guests. Adjust your party size or <Link href="/booking/search">choose another type</Link>.</p>}
 {stay&&availableCount>0&&!checkoutOpen&&<p role="status" className="booking-checkout-notice">Online checkout is unavailable. <Link href="/#contact">Contact Front Desk to book an available room.</Link></p>}
 {stay&&capacity&&!error&&availableCount===0&&<div className="booking-empty" role="status"><h2>No rooms of this type are available</h2><p>Try other dates or compare all room types for your stay.</p><div className="room-actions"><ChooseDatesButton label="Edit stay dates" /><Link className="btn btn-soft" href={`/booking/search?${new URLSearchParams({...stay,guests:String(stay.guests)})}`}>Compare room types</Link></div></div>}
 {raw.changed&&<p role="alert">That room is no longer available. Please choose another room below.</p>}
 {error?<div role="alert"><p>Live rooms are temporarily unavailable.</p><Link href={`/booking/rooms/${encodeURIComponent(type)}?${new URLSearchParams(raw as Record<string,string>)}`}>Try again</Link></div>:<div className="exact-room-grid">{choices.map(choice=>{
 const available=!!stay&&capacity&&choice.available;const query=new URLSearchParams({...stay,guests:String(stay?.guests??2),roomType:type,roomId:choice.id});
 const bookingLink=(offer?:string)=>{
   const params=new URLSearchParams(query);
  if(offer) params.set('breakfast',offer);
   const details=`/booking/details?${params}`;
   return session&&!session.user.otpPending ? details : `/login?booking=1&callbackUrl=${encodeURIComponent(details)}`;
 };
 const deposit = priced ? publicDepositEstimate(priced.subtotal, information.deposit) : null;
 const canPay = checkoutOpen && Number(deposit) > 0;
 const href=bookingLink(breakfast?.mode==='included' ? breakfast.id : undefined);
 return (
   <article key={choice.id} className={`exact-room-card${stay && !available ? ' is-unavailable' : ''}`}>
     <RoomGallery photos={photos} roomName={room.name} illustrative={illustrative} />
     <div className="exact-room-card-body">
       <div className="exact-room-heading"><h3>Room {choice.number}</h3><span>{!stay ? "Check dates" : available ? "Available" : "Unavailable"}</span></div>
       <p>Floor {choice.floor} · {room.beds} · Up to {room.maxGuests} guests</p>
       {priced ? <div className="exact-room-price">
         <strong>{formatPeso(priced.subtotal)} estimated total</strong>
         <p>{priced.nights} {priced.nights === 1 ? "night" : "nights"} · {priced.rateVaries && "From "}{formatPeso(priced.nightlyRate)} / night</p>
         {deposit !== null && <small className="room-deposit-estimate">{formatPeso(deposit)} estimated deposit</small>}
       </div> : <strong>From {formatPeso(room.nightlyRate)} / night</strong>}
       {available && canPay ? breakfast?.mode === "optional" ? (
         <div className="exact-breakfast-actions">
           <Link className="btn btn-accent" href={href}>Book Room {choice.number} · room only</Link>
           <Link className="btn btn-soft" href={bookingLink(breakfast.id)}>Room {choice.number} with breakfast · {formatPeso(breakfast.total)}</Link>
         </div>
       ) : <Link className="btn btn-accent" href={href}>Book Room {choice.number}{breakfast?.mode === "included" ? " · breakfast included" : ""}</Link>
       : available ? <Link className="btn btn-soft" href="/#contact">Contact Front Desk to book</Link>
       : <button className="btn" disabled>{stay ? "Unavailable" : "Choose dates first"}</button>}
       <details>
         <summary>View room details</summary>
         <p>{room.description}</p>
         <p><strong>Room amenities</strong> · {choice.amenities.join(" · ") || "No amenities configured."}</p>
       </details>
     </div>
   </article>
 )})}</div>}{!error&&!choices.length&&<p>No rooms are currently published for this type.</p>}
 <section className="exact-room-policy" aria-label="Booking terms"><BookingPolicySummary information={information} /></section>
 </div></main>;
}

function RoomGallery({ photos, roomName, illustrative }: { photos: string[]; roomName: string; illustrative: boolean }) {
  return <figure>
    <RoomPhoto src={photos[0]} alt={illustrative ? "Illustrative hotel room" : `${roomName} room type`} />
    <figcaption className="room-photo-source">{illustrative ? "Illustrative photo" : "Room type photo"}</figcaption>
    <RoomPhotoTrigger photos={photos} roomName={roomName} />
  </figure>;
}
