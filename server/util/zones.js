export const ZONES = [
  { key: "north_west", label: "North West" },
  { key: "north_east", label: "North East" },
  { key: "north_central", label: "North Central" },
  { key: "south_west", label: "South West" },
  { key: "south_east", label: "South East" },
  { key: "south_south", label: "South South" },
];

// normalize anything to a valid key (or null)
export function normalizeZone(input) {
  if (!input) return null;
  const k = String(input).trim().toLowerCase().replace(/\s+/g, "_");
  const hit = ZONES.find((z) => z.key === k);
  return hit ? hit.key : null;
}
