import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  cache: <T>(callback: T) => callback,
}));

import { GET } from "@/app/api/location/route";
import { EMPTY_LOCATION } from "@/lib/location-content";
import { getPublishedLocation } from "@/lib/location-content-server";

beforeEach(() => rpc.mockReset());

describe("published location response boundary", () => {
  it.each([
    { caseName: "array", data: [] },
    { caseName: "empty object", data: {} },
    { caseName: "missing collection", data: { hotel: null, places: [], routes: [] } },
    { caseName: "null collection member", data: { ...EMPTY_LOCATION, routes: [null] } },
  ])(
    "reports an unavailable guide for a $caseName result", async ({ data }) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect(getPublishedLocation()).resolves.toEqual({ content: EMPTY_LOCATION, unavailable: true });
      expect((await GET()).status).toBe(503);
    },
  );

  it("keeps a genuine empty guide distinct from an unavailable response", async () => {
    rpc.mockResolvedValue({ data: EMPTY_LOCATION, error: null });
    await expect(getPublishedLocation()).resolves.toEqual({ content: EMPTY_LOCATION, unavailable: false });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: EMPTY_LOCATION });
  });
});
