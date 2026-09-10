import { describe, expect, it } from "vitest";
import {
  MOTION_CSS_VARS,
  MOTION_DURATION,
  MOTION_EASING,
  MOTION_TRAVEL,
} from "./motion-config";

describe("motion tokens", () => {
  it("keeps durations inside their documented category windows", () => {
    expect(MOTION_DURATION.fast).toBeGreaterThanOrEqual(120);
    expect(MOTION_DURATION.fast).toBeLessThanOrEqual(180);
    expect(MOTION_DURATION.standard).toBeGreaterThanOrEqual(180);
    expect(MOTION_DURATION.standard).toBeLessThanOrEqual(260);
    expect(MOTION_DURATION.relaxed).toBeGreaterThanOrEqual(300);
    expect(MOTION_DURATION.relaxed).toBeLessThanOrEqual(450);
    expect(MOTION_DURATION.cinematic).toBeGreaterThanOrEqual(600);
    expect(MOTION_DURATION.cinematic).toBeLessThanOrEqual(1200);
  });

  it("exposes CSS vars matching the ms values", () => {
    expect(MOTION_CSS_VARS["--motion-fast"]).toBe(`${MOTION_DURATION.fast}ms`);
    expect(MOTION_CSS_VARS["--motion-standard"]).toBe(`${MOTION_DURATION.standard}ms`);
  });

  it("holds the easing set to the documented three", () => {
    expect(Object.keys(MOTION_EASING).filter((k) => !k.endsWith("Css"))).toEqual([
      "standard",
      "premium",
      "cinematic",
    ]);
  });

  it("keeps travel distances restrained", () => {
    expect(MOTION_TRAVEL.micro).toBeLessThanOrEqual(8);
    expect(MOTION_TRAVEL.standard).toBeLessThanOrEqual(16);
    expect(MOTION_TRAVEL.relaxed).toBeLessThanOrEqual(28);
  });
});
