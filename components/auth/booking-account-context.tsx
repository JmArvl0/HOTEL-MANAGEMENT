import {formatPeso} from "@/lib/format";
import Link from 'next/link';
import Image from 'next/image';
import {getRoomCatalog,getRoomType,searchSchema} from '@/lib/booking';
import {getExactRooms} from '@/lib/exact-rooms';
import {roomPhotosFor,roomPhotoNeedsDirectUrl} from '@/lib/room-images';
import {formatStayRange} from '@/lib/customer';
export async function bookingAccountContext(callback:string){
 const url=new URL(callback,'http://localhost');if(url.pathname!=='/booking/details')return null;
 const stay=searchSchema.safeParse(Object.fromEntries(url.searchParams));if(!stay.success)return null;
 const type=url.searchParams.get('roomType');const id=url.searchParams.get('roomId');if(!type||!id)return null;
 const room=(await getRoomCatalog()).find(r=>r.name===type);if(!room)return null;
 const selected=(await getExactRooms(type,stay.data)).find(r=>r.id===id);if(!selected)return null;
 const priced=await getRoomType(type,stay.data);
 const photo=roomPhotosFor(room.photos,type)[0];
 const changeRoom = `/booking/rooms/${encodeURIComponent(type)}?${new URLSearchParams({...stay.data,guests:String(stay.data.guests)})}`;
 const image = photo || '/hotel-hero.png';
 return <div className="booking-account-context">
   <h2>Continue with Room {selected.number}</h2>
   <p>{type} · {formatStayRange(stay.data.checkIn, stay.data.checkOut)} · {stay.data.guests} {stay.data.guests === 1 ? 'guest' : 'guests'}</p>
   <details className="booking-account-stay">
     <summary>View stay details</summary>
     <Image src={image} alt={`${type} representative room photo`} width={560} height={280} sizes="(max-width: 900px) 100vw, 45vw" unoptimized={roomPhotoNeedsDirectUrl(image)} />
     <p>Floor {selected.floor}{priced && <> · <strong>{formatPeso(priced.subtotal)}</strong> estimated total for {priced.nights} {priced.nights === 1 ? 'night' : 'nights'}</>}</p>
     <Link href={changeRoom}>Change room or dates</Link>
   </details>
   <p>Your room hold begins after you submit guest details.</p>
 </div>;
}
