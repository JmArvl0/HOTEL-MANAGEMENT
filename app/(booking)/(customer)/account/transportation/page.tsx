import{getGuestReservations}from"@/lib/booking";
import{requireCustomerSession}from"@/lib/customer-auth";
import{getCustomerTransportation,getHotelTransferLabel}from"@/lib/transportation";
import{TransportationRequestForm}from"@/components/customer/transportation-request-form";
import{TransportationRequestList}from"@/components/customer/transportation-request-list";

export default async function TransportationPage(){
 const session=await requireCustomerSession();
 const[requests,reservations,hotelLabel]=await Promise.all([getCustomerTransportation(session.user.id),getGuestReservations(session.user.id),getHotelTransferLabel()]);
 const eligible=reservations.filter((item)=>["confirmed","checked_in"].includes(String(item.status))).map((item)=>({id:item.id,confirmation_number:item.confirmation_number,room_type:item.room_type,check_in:item.check_in,check_out:item.check_out}));
 return <div className="customer-transportation-page"><section className="customer-transportation-intro"><h1>Getting you here &amp; back</h1><p>Request hotel transportation for a confirmed stay. Our Front Desk reviews, schedules, and assigns airport pickups, hotel drop-offs, and round trips.</p></section><TransportationRequestForm reservations={eligible} hotelLabel={hotelLabel}/><TransportationRequestList requests={requests}/></div>;
}
