/**
 * Landing imagery (royalty-free CDN stock, images.unsplash.com).
 *
 * Pure, imports nothing, so both server components (RoomResults card band)
 * and client components (the details overlay) can use it.
 * Room photos: DB `photo_urls` wins; the stock map is the fallback — swap in
 * real property photos later by editing the PHOTOS map.
 * Scene photos: editorial sections (brand story, experience, gallery,
 * location, final CTA) pull from SCENES below.
 * All URLs below are verified to return HTTP 200.
 */
const cdn = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

const PHOTOS: Record<string, string[]> = {
  // Garden Twin — two twin beds, calm and light.
  "garden twin": [
    cdn("photo-1737517302831-e7b8a8eaa97c"),
    cdn("photo-1680210851458-b7dc5685e06e"),
    cdn("photo-1673687778498-5ddd20749408"),
  ],
  // Deluxe King — king bed, clean contemporary finishes.
  "deluxe king": [
    cdn("photo-1631049307264-da0ec9d70304"),
    cdn("photo-1631049421450-348ccd7f8949"),
    cdn("photo-1631049307485-2bfb23080676"),
  ],
  // Ocean Suite — king bed + separate lounge, expansive ocean outlook.
  "ocean suite": [
    cdn("photo-1590381105924-c72589b9ef3f"),
    cdn("photo-1515362778563-6a8d0e44bc0b"),
    cdn("photo-1702830499141-a0634d87d6af"),
    cdn("photo-1721355694821-05b1b98c199a"),
  ],
};

const FALLBACK: string[] = [
  cdn("photo-1631049307264-da0ec9d70304"),
  cdn("photo-1590381105924-c72589b9ef3f"),
  cdn("photo-1515362778563-6a8d0e44bc0b"),
];

export function roomPhotos(name: string): string[] {
  return PHOTOS[name.trim().toLowerCase()] ?? FALLBACK;
}

export function roomPrimaryPhoto(name: string): string | undefined {
  return roomPhotos(name)[0];
}

/** Room photos for a type: DB-backed gallery wins; falls back to the stock map by room name. */
export function roomPhotosFor(photos?: string[], name?: string): string[] {
  return photos && photos.length > 0 ? photos : roomPhotos(name ?? "");
}

/** Primary display image for a room type, honouring DB photos first. */
export function roomPrimary(photos?: string[], name?: string): string | undefined {
  return roomPhotosFor(photos, name)[0];
}

// --- Editorial scene imagery -------------------------------------------------
// One image per moment of the landing narrative; all verified 200s.

export const SCENES = {
  // Brand story — architectural calm, tropical lobby light.
  story: cdn("photo-1600585154340-be6161a56a0c", 1800),
  // Experience: morning (breakfast, warm light) / afternoon (pool) / evening (room calm).
  morning: cdn("photo-1544148103-0773bf10d330", 1600),
  afternoon: cdn("photo-1571003123894-1f0594d2b5d9", 1600),
  evening: cdn("photo-1611892440504-42a792e24d32", 1600),
  // Gallery mosaic — varied subjects, no hero-image repeats.
  gallery: [
    cdn("photo-1566073771259-6a8506099945", 1400), // hotel exterior/pool
    cdn("photo-1582719508461-905c673771fd", 1200), // suite detail
    cdn("photo-1414235077428-338989a2e8c0", 1400), // dining
    cdn("photo-1590490360182-c33d57733427", 1400), // bathroom detail
    cdn("photo-1519690889869-e705e59f72e1", 1400), // seaside
    cdn("photo-1520250497591-112f2f40a3f4", 1400), // lobby
  ],
  // Location — Mactan coastal property feel.
  location: cdn("photo-1584132967334-10e028bd69f7", 1800),
  // Final CTA — dark room at dusk behind the band.
  final: cdn("photo-1611892440504-42a792e24d32", 1800),
} as const;
