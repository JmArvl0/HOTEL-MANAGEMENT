export const CUSTOMER_SIDEBAR_KEY="haven-customer-sidebar-collapsed";
export const parseSidebarCollapsed=(value:unknown)=>value==="true";
export const isCustomerNavActive=(pathname:string,href:string,exact=false)=>exact?pathname===href:pathname===href||pathname.startsWith(`${href}/`);
// Booking-flow pages (/booking/details|review|payment|confirmation) launch from Find a Room
// and render inside the customer shell — the sidebar keeps Find a Room as the active parent
// module there. /booking/search never renders the shell, so the public path is unaffected.
export const isBookingFlow=(pathname:string)=>pathname.startsWith("/booking/");