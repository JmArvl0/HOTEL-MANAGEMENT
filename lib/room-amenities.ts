/** One read model for type defaults and room-specific amenity overrides. */
export function amenityKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim().replace(/\s+/g, " ");
    if (label && !entries.has(amenityKey(label))) entries.set(amenityKey(label), label);
  }
  return [...entries.values()];
}

export type RoomAmenitySet = {
  standard: string[];
  additions: string[];
  exclusions: string[];
  inherited: string[];
  dormantExclusions: string[];
  effective: string[];
};

export function resolveRoomAmenities(standard: unknown, additions: unknown = [], exclusions: unknown = []): RoomAmenitySet {
  const base = normalizeAmenities(standard);
  const extra = normalizeAmenities(additions);
  const excluded = normalizeAmenities(exclusions);
  const excludedKeys = new Set(excluded.map(amenityKey));
  const baseKeys = new Set(base.map(amenityKey));
  return {
    standard: base,
    additions: extra,
    exclusions: excluded,
    inherited: base.filter(item => !excludedKeys.has(amenityKey(item))),
    dormantExclusions: excluded.filter(item => !baseKeys.has(amenityKey(item))),
    effective: normalizeAmenities([...base, ...extra]).filter(item => !excludedKeys.has(amenityKey(item))),
  };
}

export function hasConflictingAmenities(additions: unknown, exclusions: unknown): boolean {
  const excluded = new Set(normalizeAmenities(exclusions).map(amenityKey));
  return normalizeAmenities(additions).some(item => excluded.has(amenityKey(item)));
}
