import { BookingPolicySummary } from "@/components/landing/hotel-information";
import { getPublicBookingInformation } from "@/lib/public-booking-information-server";
/* eslint-disable @next/next/no-img-element -- catalog URLs are managed by the hotel */
import Link from 'next/link';
import {getServerSession} from 'next-auth';
import {notFound} from 'next/navigation';
import {authOptions} from '@/lib/auth';
import {getRoomCatalog,getRoomType,searchSchema} from '@/lib/booking';
import {getExactRooms,type ExactRoom} from '@/lib/exact-rooms';
import {resolveRoomAmenities} from '@/lib/room-amenities';
import {roomPhotosFor} from '@/lib/room-images';
import {formatPeso} from '@/lib/format';
import {BookingSearchForm} from '@/components/booking/booking-search-form';
import {RoomPhotoTrigger} from '@/components/booking/room-photo-lightbox';
import {PublicWebsiteNav} from '@/components/landing/public-website-nav';
import '../../search/search.css';
import './rooms.css';
export default async function RoomsPage({params,searchParams}:{params:Promise<{type:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const [{type:encodedType},raw,session]=await Promise.all([params,searchParams,getServerSession(authOptions)]);
 let type:string;try{type=decodeURIComponent(encodedType)}catch{notFound()}
 const information=await getPublicBookingInformation();
 const catalog=await getRoomCatalog();const room=catalog.find(r=>r.name===type);if(!room)notFound();
 const parsed=searchSchema.safeParse(raw);const stay=parsed.success?parsed.data:null;
 let choices:ExactRoom[]=[];let error=false;let priced=null;
 try{if(stay){[choices,priced]=await Promise.all([getExactRooms(type,stay),getRoomType(type,stay)]);}else{const {supabase}=await import('@/lib/supabase');if(supabase){const result=await supabase.from('rooms').select('id,number,floor,amenity_additions,amenity_exclusions').eq('type',type).eq('administratively_active',true).order('number');if(result.error)throw result.error;choices=(result.data??[]).map(r=>({...r,available:false,amenities:resolveRoomAmenities(room.amenities,r.amenity_additions,r.amenity_exclusions).effective}));}}}catch{error=true;}
 const photos=roomPhotosFor(room.photos,room.name);const capacity=!!stay&&stay.guests<=room.maxGuests;
 return <main className="booking-page exact-room-page"><PublicWebsiteNav bookingHref="#book-form" active="Rooms" rootLinks/><div className="exact-room-content"><nav aria-label="Breadcrumb"><Link href="/#stay">Room types</Link><span> / {room.name}</span></nav><section className="exact-type-intro"><div><h1>{room.name}</h1><p>{room.description}</p><p>{room.beds} · {room.sizeSqm?`${room.sizeSqm} m² · `:''}Up to {room.maxGuests} guests</p><div className="exact-amenities">{room.amenities.map(a=><span key={a}>{a}</span>)}</div></div><RoomGallery photos={photos} roomName={room.name}/></section>
 <section id="book-form" className="exact-room-search" aria-label="Stay dates"><BookingSearchForm maxGuests={Math.min(8,room.maxGuests)} timeZone={information.operations.hotelTimezone} compact action={`/booking/rooms/${encodeURIComponent(type)}`} initial={{...(stay??{}),guests:stay?.guests??2}} searched={stay??undefined}/><BookingPolicySummary information={information}/></section>
 <h2>Choose your room</h2><p>Choose the exact room number for your stay. Your room is held after you submit Guest details.</p>
 {!stay&&<p role="status">Choose your dates and check availability to book a room.</p>}{stay&&!capacity&&<p role="alert">This type accommodates up to {room.maxGuests} guests. Adjust your party size or <Link href="/booking/search">choose another type</Link>.</p>}
 {raw.changed&&<p role="alert">That room is no longer available. Please choose another room below.</p>}
 {error?<div role="alert"><p>Live rooms are temporarily unavailable.</p><Link href={`/booking/rooms/${encodeURIComponent(type)}?${new URLSearchParams(raw as Record<string,string>)}`}>Try again</Link></div>:<div className="exact-room-grid">{choices.map(choice=>{
 const available=!!stay&&capacity&&choice.available;const query=new URLSearchParams({...stay,guests:String(stay?.guests??2),roomType:type,roomId:choice.id});const details=`/booking/details?${query}`;const href=session?details:`/login?booking=1&callbackUrl=${encodeURIComponent(details)}`;
 return <article key={choice.id} className={`exact-room-card${stay&&!available?' is-unavailable':''}`}><RoomGallery photos={photos} roomName={`${room.name}, Room ${choice.number}`}/><div className="exact-room-card-body"><div className="exact-room-heading"><h3>Room {choice.number}</h3><span>{!stay?'Check dates':available?'Available':'Unavailable'}</span></div><p>{room.name} · Floor {choice.floor}</p><p>{room.beds} · Up to {room.maxGuests} guests</p>{(choice.amenity_additions?.length>0||choice.amenity_exclusions?.length>0)&&<p className="exact-room-adjustments"><strong>Room amenities:</strong> {choice.amenities.join(' · ')||'None configured'}</p>}<strong>{formatPeso(priced?.nightlyRate??room.nightlyRate)} / night</strong>{priced&&<p>{formatPeso(priced.subtotal)} for {priced.nights} night{priced.nights===1?'':'s'}</p>}{available?<Link className="btn btn-accent" href={href}>Book Room {choice.number}</Link>:<button className="btn" disabled>{stay?'Unavailable':'Choose dates first'}</button>}<details><summary>View room details</summary><p>{room.description}</p><p>{choice.amenities.join(' · ')||'No amenities configured.'}</p></details></div></article>})}</div>}{!error&&!choices.length&&<p>No rooms are currently published for this type.</p>}</div></main>;
}

function RoomGallery({photos,roomName}:{photos:string[];roomName:string}){return <figure><img src={photos[0]||"/hotel-hero.png"} alt={roomName}/><RoomPhotoTrigger photos={photos} roomName={roomName}/></figure>}
