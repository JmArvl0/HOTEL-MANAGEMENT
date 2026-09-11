// Room-type change reasons and the financial responsibility the SERVER derives from each
// (request_manager_approval in migration 20260922010000; SQL helper
// room_type_change_responsibility is authoritative). This list only feeds UI selects and
// previews — client-safe, no server imports.
export type RoomTypeChangeResponsibility="hotel"|"guest";
export type RoomTypeChangeReason={code:string;label:string;responsibility:RoomTypeChangeResponsibility};
export const ROOM_TYPE_CHANGE_REASONS:RoomTypeChangeReason[]=[
 {code:"hotel_type_unavailable",label:"Reserved room type unavailable at arrival",responsibility:"hotel"},
 {code:"hotel_room_unserviceable",label:"Reserved-type rooms unserviceable",responsibility:"hotel"},
 {code:"hotel_maintenance",label:"Maintenance blocking reserved-type rooms",responsibility:"hotel"},
 {code:"hotel_overbooking",label:"Overbooking",responsibility:"hotel"},
 {code:"hotel_error",label:"Hotel booking or assignment error",responsibility:"hotel"},
 {code:"hotel_early_checkin_failure",label:"Failed approved early check-in",responsibility:"hotel"},
 {code:"guest_larger_room",label:"Guest wants a larger room",responsibility:"guest"},
 {code:"guest_premium_type",label:"Guest wants a premium room type",responsibility:"guest"},
 {code:"guest_better_view",label:"Guest wants a better view or preference",responsibility:"guest"},
 {code:"guest_early_arrival_upgrade",label:"Guest requested an early-arrival upgrade",responsibility:"guest"},
];
export const roomTypeChangeResponsibility=(code:string):RoomTypeChangeResponsibility|null=>ROOM_TYPE_CHANGE_REASONS.find(reason=>reason.code===code)?.responsibility??null;
export const roomTypeChangeReasonLabel=(code:string):string=>ROOM_TYPE_CHANGE_REASONS.find(reason=>reason.code===code)?.label??code;
// Stamped by request_manager_approval into requested_action.financials; consumed verbatim
// by approval and execution. Numeric fields arrive as strings from Postgres jsonb.
export type RoomTypeChangeFinancials={reasonCode?:string;responsibility?:string;originalTotal?:string|number;targetRate?:string|number|null;nights?:string|number;targetTotal?:string|number;nightlyRates?:{date:string;rate:number}[];difference?:string|number};
export const financialDifference=(financials:RoomTypeChangeFinancials|null|undefined):number=>round2(Number(financials?.difference??0));
function round2(n:number){return Math.round(n*100)/100}
