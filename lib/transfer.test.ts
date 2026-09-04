import { describe, expect, it } from "vitest";
import { parseGeocode, parseRouteSummary, rideFare } from "@/lib/transfer";

describe("hotel transfer fares",()=>{
  it("itemizes the GrabCar 4-seat model exactly (base + km + min + fee)",()=>{
    expect(rideFare({baseFare:45,perKm:15,perMinute:2,bookingFee:20},12.4,32)).toEqual({
      base:45,distanceCharge:186,timeCharge:64,bookingFee:20,total:315,
    });
  });
  it("keeps fractional km/minute centavo-exact (no float drift)",()=>{
    expect(rideFare({baseFare:45,perKm:15,perMinute:2,bookingFee:20},0.3,1.5)).toEqual({
      base:45,distanceCharge:4.5,timeCharge:3,bookingFee:20,total:72.5,
    });
  });
  it("stays exact on 0.1+0.2-style values",()=>{
    expect(rideFare({baseFare:0,perKm:0.1,perMinute:0.2,bookingFee:0},1,1).total).toBe(0.3);
  });
  it("rounds partial-centavo charge legs up to the centavo",()=>{
    // 15/km x 0.333 km -> 500 cents exactly; 2/min x 0.334 min -> 67 cents (rounded from 66.8)
    expect(rideFare({baseFare:0,perKm:15,perMinute:2,bookingFee:0},0.333,0.334)).toEqual({
      base:0,distanceCharge:5,timeCharge:0.67,bookingFee:0,total:5.67,
    });
  });
});

describe("tomtom response parsers",()=>{
  it("extracts the top geocode position",()=>{
    expect(parseGeocode({results:[{position:{lat:14.5547,lon:121.0244}},{position:{lat:0,lon:0}}]})).toEqual({lat:14.5547,lon:121.0244});
  });
  it("returns null for an empty or malformed geocode",()=>{
    expect(parseGeocode({results:[]})).toBeNull();
    expect(parseGeocode({results:[{}]})).toBeNull();
    expect(parseGeocode({})).toBeNull();
  });
  it("extracts the routing summary",()=>{
    expect(parseRouteSummary({routes:[{summary:{lengthInMeters:12400,travelTimeInSeconds:1920}}]})).toEqual({meters:12400,seconds:1920});
  });
  it("returns null when routing has no usable summary",()=>{
    expect(parseRouteSummary({routes:[]})).toBeNull();
    expect(parseRouteSummary({routes:[{summary:{lengthInMeters:0,travelTimeInSeconds:0}}]})).toBeNull();
    expect(parseRouteSummary({})).toBeNull();
  });
});
