/**
 * Room-type photo galleries (royalty-free CDN stock, images.unsplash.com).
 *
 * Pure, imports nothing, so both server components (RoomResults card band) and
 * client components (the details overlay) can use it. Rooms have no image
 * column in the DB — swap in real property photos later by editing this one map.
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
