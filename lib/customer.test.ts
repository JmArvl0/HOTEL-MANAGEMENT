import{describe,expect,it}from"vitest";import{filterFinancialRecords,filterReservationHistory,financialPaymentState,folioMoney,formatStayRange,friendlyStatus,groupReservations,reservationCategory}from"@/lib/customer";import{isBookingFlow,isCustomerNavActive,parseSidebarCollapsed}from"@/lib/customer-nav";
const reservation=(status:string,check_in:string,check_out:string)=>({status,check_in,check_out});
describe("customer portal presentation rules",()=>{it("derives reservation categories without changing backend statuses",()=>{expect(reservationCategory(reservation("checked_in","2026-08-25","2026-08-28"),"2026-08-26")).toBe("current");expect(reservationCategory(reservation("confirmed","2026-09-01","2026-09-03"),"2026-08-26")).toBe("upcoming");expect(reservationCategory(reservation("checked_out","2026-08-20","2026-08-22"),"2026-08-26")).toBe("past");expect(reservationCategory(reservation("cancelled","2026-09-01","2026-09-03"),"2026-08-26")).toBe("cancelled");expect(reservationCategory(reservation("no_show","2026-08-26","2026-08-28"),"2026-08-26")).toBe("cancelled")});it("groups and sorts reservations for customer sections",()=>{const groups=groupReservations([reservation("confirmed","2026-09-10","2026-09-12"),reservation("confirmed","2026-09-01","2026-09-03"),reservation("checked_out","2026-08-01","2026-08-03")],"2026-08-26");expect(groups.upcoming.map((item)=>item.check_in)).toEqual(["2026-09-01","2026-09-10"]);expect(groups.past).toHaveLength(1)});it("uses friendly status and stay labels",()=>{expect(friendlyStatus("checked_in")).toBe("Checked in");expect(friendlyStatus("partial")).toBe("Partially paid");expect(formatStayRange("2026-08-27","2026-08-30")).toBe("Aug 27 - Aug 30, 2026")});it("matches active sidebar routes without prefix collisions",()=>{expect(isCustomerNavActive("/account","/account",true)).toBe(true);expect(isCustomerNavActive("/account/payments","/account",true)).toBe(false);expect(isCustomerNavActive("/my-reservations/RSV-1","/my-reservations")).toBe(true);expect(isCustomerNavActive("/account/find-room","/account/find-room")).toBe(true);expect(isCustomerNavActive("/account/find-room","/account",true)).toBe(false)});it("parses only the persisted true collapse state",()=>{expect(parseSidebarCollapsed("true")).toBe(true);expect(parseSidebarCollapsed("false")).toBe(false);expect(parseSidebarCollapsed(null)).toBe(false)});it("keeps Find a Room as the parent module across booking-flow routes",()=>{expect(isBookingFlow("/booking/details")).toBe(true);expect(isBookingFlow("/booking/review/abc123")).toBe(true);expect(isBookingFlow("/booking/payment/abc123")).toBe(true);expect(isBookingFlow("/booking/confirmation/42")).toBe(true);expect(isBookingFlow("/account/find-room")).toBe(false);expect(isBookingFlow("/account/payments")).toBe(false);expect(isBookingFlow("/")).toBe(false)})});
/* Payments & folio filter derivation — mirrors the /account/payments chip filters */
const folio=(overrides:Partial<Parameters<typeof financialPaymentState>[0]>)=>({total:10000,deposit:0,invoice:{amount:10000,paid:0,balance:10000,status:"unpaid"},status:"confirmed",check_in:"2026-09-01",check_out:"2026-09-03",payments:[]as{status:string}[],refunds:[]as unknown[],...overrides});
describe("payments folio filters",()=>{it("derives the payment-state bucket from live record fields",()=>{expect(financialPaymentState(folio({invoice:{amount:10000,paid:0,balance:10000,status:"unpaid"},payments:[{status:"pending_verification"}]}))).toBe("pending");expect(financialPaymentState(folio({invoice:{amount:10000,paid:2500,balance:7500,status:"partial"}}))).toBe("due");expect(financialPaymentState(folio({invoice:{amount:10000,paid:10000,balance:0,status:"paid"},refunds:[{reason:"late cancellation"}]}))).toBe("refund");expect(financialPaymentState(folio({invoice:{amount:10000,paid:10000,balance:0,status:"paid"}}))).toBe("settled")});
it("an in-flight payment outranks the balance it covers",()=>{expect(financialPaymentState(folio({invoice:{amount:10000,paid:10000,balance:0,status:"pending_verification"},payments:[{status:"pending_verification"}]}))).toBe("pending")});
it("a cancelled reservation with a residual balance is not due",()=>{expect(financialPaymentState(folio({status:"cancelled",invoice:{amount:10000,paid:0,balance:10000,status:"unpaid"}}))).toBe("settled")});
it("falls back to invoice-less reservation money the same way the page does",()=>{expect(folioMoney({total:"12000",deposit:"3000",invoice:null})).toEqual({total:12000,paid:3000,balance:9000})});
it("filters folios by stay, payment state, and both",()=>{const records=[folio({status:"checked_in",check_in:"2026-08-25",check_out:"2026-08-28",invoice:{amount:10000,paid:10000,balance:0,status:"paid"}}),folio({}),folio({status:"cancelled",check_in:"2026-08-20",check_out:"2026-08-22",invoice:{amount:10000,paid:0,balance:10000,status:"unpaid"}})];const today="2026-08-26";expect(filterFinancialRecords(records,{stay:"current"},today)).toHaveLength(1);expect(filterFinancialRecords(records,{pay:"due"},today)).toHaveLength(1);expect(filterFinancialRecords(records,{stay:"current",pay:"settled"},today)).toHaveLength(1);expect(filterFinancialRecords(records,{},today)).toHaveLength(3)});
it("invalid or missing filter values mean all folios",()=>{const records=[folio({})];expect(filterFinancialRecords(records,{stay:"bogus",pay:"nope"})).toHaveLength(1);expect(filterFinancialRecords(records,{stay:null,pay:undefined})).toHaveLength(1)})});

const historyReservation=(overrides:Partial<{id:string;confirmation_number:string;guest_name:string;room_type:string;status:string;check_in:string;check_out:string;created_at:string}>)=>({id:"reservation-1",confirmation_number:"HVN-001",guest_name:"Mark Cruz",room_type:"Garden Twin",status:"confirmed",check_in:"2026-09-12",check_out:"2026-09-14",created_at:"2026-08-01T00:00:00Z",...overrides});
describe("reservation history filters",()=>{
  const records=[
    historyReservation({id:"current",status:"checked_in",room_type:"Ocean Suite",check_in:"2026-09-09",check_out:"2026-09-12"}),
    historyReservation({id:"upcoming",confirmation_number:"HVN-SEARCH",check_in:"2026-10-01",check_out:"2026-10-03"}),
    historyReservation({id:"completed",status:"checked_out",check_in:"2026-08-01",check_out:"2026-08-03"}),
    historyReservation({id:"cancelled",status:"cancelled",check_in:"2026-11-01",check_out:"2026-11-03"}),
  ];
  it("keeps completed and cancelled reservations in separate filter results",()=>{
    expect(filterReservationHistory(records,{status:"completed"},"2026-09-10").map((item)=>item.id)).toEqual(["completed"]);
    expect(filterReservationHistory(records,{status:"cancelled"},"2026-09-10").map((item)=>item.id)).toEqual(["cancelled"]);
  });
  it("searches confirmation numbers, room types, and guest names case-insensitively",()=>{
    expect(filterReservationHistory(records,{query:"hvn-search"},"2026-09-10").map((item)=>item.id)).toEqual(["upcoming"]);
    expect(filterReservationHistory(records,{query:"ocean suite"},"2026-09-10").map((item)=>item.id)).toEqual(["current"]);
    expect(filterReservationHistory(records,{query:"mark cruz"},"2026-09-10")).toHaveLength(4);
  });
  it("sorts a copy without changing the Supabase result order",()=>{
    const original=records.map((item)=>item.id);
    expect(filterReservationHistory(records,{sort:"stay-oldest"},"2026-09-10").map((item)=>item.id)).toEqual(["completed","current","upcoming","cancelled"]);
    expect(records.map((item)=>item.id)).toEqual(original);
  });
  it("defaults to a flat list with the latest stay date first",()=>{
    expect(filterReservationHistory(records,{},"2026-09-10").map((item)=>item.id)).toEqual(["cancelled","upcoming","current","completed"]);
  });
  it("treats unsupported URL filters as the default view",()=>{
    expect(filterReservationHistory(records,{status:"unknown",sort:"unknown"},"2026-09-10")).toHaveLength(4);
  });
});
