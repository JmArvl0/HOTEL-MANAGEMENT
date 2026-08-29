export const CUSTOMER_SIDEBAR_KEY="haven-customer-sidebar-collapsed";
export const parseSidebarCollapsed=(value:unknown)=>value==="true";
export const isCustomerNavActive=(pathname:string,href:string,exact=false)=>exact?pathname===href:pathname===href||pathname.startsWith(`${href}/`);