import { describe, expect, it } from "vitest";
import { calculateNights, countAvailableUnits, guestDetailsSchema, isBlockingReservationStatus, parseSearchIntent, rangesOverlap, safeInternalPath, searchSchema, transportTotal } from "@/lib/booking";
import { formatArrival } from "@/lib/arrival-time-options";
const date=(offset:number)=>{const value=new Date();value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)};
describe("guest booking rules",()=>{
  it("calculates nights without timezone drift",()=>expect(calculateNights("2026-09-04","2026-09-07")).toBe(3));
  it("allows same-day turnover",()=>expect(rangesOverlap("2026-09-01","2026-09-04","2026-09-04","2026-09-07")).toBe(false));
  it("detects a real date overlap",()=>expect(rangesOverlap("2026-09-01","2026-09-05","2026-09-04","2026-09-07")).toBe(true));
  it("blocks active reservations but not cancelled stays",()=>{expect(isBlockingReservationStatus("confirmed")).toBe(true);expect(isBlockingReservationStatus("checked_in")).toBe(true);expect(isBlockingReservationStatus("cancelled")).toBe(false)});
  it("rejects past and reversed dates",()=>{expect(searchSchema.safeParse({checkIn:date(-1),checkOut:date(1),guests:2}).success).toBe(false);expect(searchSchema.safeParse({checkIn:date(2),checkOut:date(1),guests:2}).success).toBe(false)});
  it("accepts a valid search",()=>expect(searchSchema.safeParse({checkIn:date(1),checkOut:date(3),guests:2}).success).toBe(true));
  it("excludes administratively inactive and Maintenance-blocked inventory",()=>{const window={checkIn:"2026-09-05",checkOut:"2026-09-07",now:"2026-09-01T00:00:00Z",today:"2026-09-01"};const rows={rooms:[{id:"safe",type:"King",status:"available",housekeeping:"clean",administratively_active:true},{id:"inactive",type:"King",status:"available",housekeeping:"clean",administratively_active:false},{id:"blocked",type:"King",status:"available",housekeeping:"clean",administratively_active:true}],reservations:[],holds:[],blockedRoomIds:new Set(["blocked"])};expect(countAvailableUnits("King",window,rows)).toBe(1)});
  it("rejects open redirects while preserving internal booking URLs",()=>{expect(safeInternalPath("https://evil.example/steal","/")).toBe("/");expect(safeInternalPath("//evil.example/steal","/")).toBe("/");expect(safeInternalPath("/booking/details?roomType=Deluxe+King","/")).toBe("/booking/details?roomType=Deluxe+King")});
});
describe("search intent (landing → /booking/search modes)",()=>{
  it("treats a dateless arrival as browse, keeping an optional room-type focus",()=>{
    expect(parseSearchIntent({})).toEqual({mode:"browse"});
    expect(parseSearchIntent({roomType:"Garden Twin"})).toEqual({mode:"browse",roomType:"Garden Twin"});
  });
  it("reads a valid date pair as availability, carrying dates, guests and focus",()=>{
    expect(parseSearchIntent({checkIn:date(1),checkOut:date(3),guests:"4",roomType:"Ocean Suite"})).toEqual({mode:"availability",checkIn:date(1),checkOut:date(3),guests:4,roomType:"Ocean Suite"});
    expect(parseSearchIntent({checkIn:date(1),checkOut:date(2)})).toEqual({mode:"availability",checkIn:date(1),checkOut:date(2),guests:2});
  });
  it("falls back to browse with a notice for invalid dates or guests",()=>{
    const reversed=parseSearchIntent({checkIn:date(2),checkOut:date(1),guests:"2"});
    expect(reversed.mode).toBe("browse");
    expect(reversed.mode==="browse"&&reversed.notice).toContain("after check-in");
    const tooMany=parseSearchIntent({checkIn:date(1),checkOut:date(2),guests:"99"});
    expect(tooMany.mode).toBe("browse");
    expect(parseSearchIntent({checkIn:date(1)})).toEqual({mode:"browse"});
  });
});
describe("stored transport lines (historical)",()=>{
  it("sums stored transport lines centavo-safe without rounding drift",()=>{expect(transportTotal(null)).toBe(0);expect(transportTotal([{name:"a",price:0.1},{name:"b",price:0.2}])).toBeCloseTo(0.3,10);expect(transportTotal([{name:"a",price:1850},{name:"b",price:900.5}])).toBe(2750.5)});
});
describe("expected arrival",()=>{
  it("renders canonical stored values as hotel-locale 12-hour, and passes anything else through",()=>{
    expect(formatArrival("00:00")).toBe("12:00 AM");expect(formatArrival("13:00")).toBe("1:00 PM");expect(formatArrival("23:30")).toBe("11:30 PM");
    expect(formatArrival("Walk-in (at the desk)")).toBe("Walk-in (at the desk)");expect(formatArrival("")).toBe("");
  });
  it("rejects malformed arrival times at the API boundary",()=>{
    const base={roomType:"King",checkIn:"2026-09-08",checkOut:"2026-09-10",guests:2,firstName:"A",lastName:"B",email:"a@b.co",mobile:"09171234567",address:"123 St",expectedArrival:"",requestOptions:[],specialRequests:""};
    const fill=(value:string)=>({...base,expectedArrival:value});
    expect(guestDetailsSchema.safeParse(fill("13:00")).success).toBe(true);
    expect(guestDetailsSchema.safeParse(fill("1:00pm")).success).toBe(false);
    expect(guestDetailsSchema.safeParse(fill("25:00")).success).toBe(false);
    expect(guestDetailsSchema.safeParse(fill("asdf")).success).toBe(false);
    expect(guestDetailsSchema.safeParse(fill("")).success).toBe(false);
  });
});