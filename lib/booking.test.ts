import { describe, expect, it } from "vitest";
import { calculateNights, isBlockingReservationStatus, rangesOverlap, safeInternalPath, searchSchema } from "@/lib/booking";
const date=(offset:number)=>{const value=new Date();value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)};
describe("guest booking rules",()=>{
  it("calculates nights without timezone drift",()=>expect(calculateNights("2026-09-04","2026-09-07")).toBe(3));
  it("allows same-day turnover",()=>expect(rangesOverlap("2026-09-01","2026-09-04","2026-09-04","2026-09-07")).toBe(false));
  it("detects a real date overlap",()=>expect(rangesOverlap("2026-09-01","2026-09-05","2026-09-04","2026-09-07")).toBe(true));
  it("blocks active reservations but not cancelled stays",()=>{expect(isBlockingReservationStatus("confirmed")).toBe(true);expect(isBlockingReservationStatus("checked_in")).toBe(true);expect(isBlockingReservationStatus("cancelled")).toBe(false)});
  it("rejects past and reversed dates",()=>{expect(searchSchema.safeParse({checkIn:date(-1),checkOut:date(1),guests:2}).success).toBe(false);expect(searchSchema.safeParse({checkIn:date(2),checkOut:date(1),guests:2}).success).toBe(false)});
  it("accepts a valid search",()=>expect(searchSchema.safeParse({checkIn:date(1),checkOut:date(3),guests:2}).success).toBe(true));
  it("rejects open redirects while preserving internal booking URLs",()=>{expect(safeInternalPath("https://evil.example/steal","/")).toBe("/");expect(safeInternalPath("//evil.example/steal","/")).toBe("/");expect(safeInternalPath("/booking/details?roomType=Deluxe+King","/")).toBe("/booking/details?roomType=Deluxe+King")});
});