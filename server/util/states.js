// The 36 states of Nigeria plus the FCT, each mapped to its geopolitical zone.
//
// WHY BOTH EXIST
// Prices are evidenced at ZONE level: the six-zone factors were derived from the
// library's own data, from the materials priced in all six. There is no
// state-level price evidence yet. So a state row is seeded from its zone and is
// then independently editable, which is the point: Lagos can move away from Ogun
// the day someone has a Lagos quotation, without waiting for a schema change.
//
// Until a state is edited, every state in a zone carries the same price. That is
// honest rather than convenient. Do not present it as thirty-seven independent
// price sets, because it is six until the overrides land.
export const ZONES = [
  { key: "north_west", label: "North West" },
  { key: "north_east", label: "North East" },
  { key: "north_central", label: "North Central" },
  { key: "south_west", label: "South West" },
  { key: "south_east", label: "South East" },
  { key: "south_south", label: "South South" },
];

export const STATES = [
  // North Central
  { key: "benue", label: "Benue", zone: "north_central" },
  { key: "fct", label: "FCT (Abuja)", zone: "north_central" },
  { key: "kogi", label: "Kogi", zone: "north_central" },
  { key: "kwara", label: "Kwara", zone: "north_central" },
  { key: "nasarawa", label: "Nasarawa", zone: "north_central" },
  { key: "niger", label: "Niger", zone: "north_central" },
  { key: "plateau", label: "Plateau", zone: "north_central" },

  // North East
  { key: "adamawa", label: "Adamawa", zone: "north_east" },
  { key: "bauchi", label: "Bauchi", zone: "north_east" },
  { key: "borno", label: "Borno", zone: "north_east" },
  { key: "gombe", label: "Gombe", zone: "north_east" },
  { key: "taraba", label: "Taraba", zone: "north_east" },
  { key: "yobe", label: "Yobe", zone: "north_east" },

  // North West
  { key: "jigawa", label: "Jigawa", zone: "north_west" },
  { key: "kaduna", label: "Kaduna", zone: "north_west" },
  { key: "kano", label: "Kano", zone: "north_west" },
  { key: "katsina", label: "Katsina", zone: "north_west" },
  { key: "kebbi", label: "Kebbi", zone: "north_west" },
  { key: "sokoto", label: "Sokoto", zone: "north_west" },
  { key: "zamfara", label: "Zamfara", zone: "north_west" },

  // South East
  { key: "abia", label: "Abia", zone: "south_east" },
  { key: "anambra", label: "Anambra", zone: "south_east" },
  { key: "ebonyi", label: "Ebonyi", zone: "south_east" },
  { key: "enugu", label: "Enugu", zone: "south_east" },
  { key: "imo", label: "Imo", zone: "south_east" },

  // South South
  { key: "akwa_ibom", label: "Akwa Ibom", zone: "south_south" },
  { key: "bayelsa", label: "Bayelsa", zone: "south_south" },
  { key: "cross_river", label: "Cross River", zone: "south_south" },
  { key: "delta", label: "Delta", zone: "south_south" },
  { key: "edo", label: "Edo", zone: "south_south" },
  { key: "rivers", label: "Rivers", zone: "south_south" },

  // South West
  { key: "ekiti", label: "Ekiti", zone: "south_west" },
  { key: "lagos", label: "Lagos", zone: "south_west" },
  { key: "ogun", label: "Ogun", zone: "south_west" },
  { key: "ondo", label: "Ondo", zone: "south_west" },
  { key: "osun", label: "Osun", zone: "south_west" },
  { key: "oyo", label: "Oyo", zone: "south_west" },
];

export const STATE_KEYS = STATES.map((s) => s.key);

const BY_KEY = new Map(STATES.map((s) => [s.key, s]));

// Accepts a key, a label, or the loose spellings that turn up in real data:
// "Lagos", "lagos state", "FCT", "Abuja", "Akwa-Ibom", "Cross River State".
const ALIASES = {
  abuja: "fct",
  "federal capital territory": "fct",
  "fct abuja": "fct",
};

export function normalizeState(input) {
  if (!input) return null;
  let k = String(input).trim().toLowerCase()
    .replace(/\bstate\b/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ALIASES[k]) return ALIASES[k];
  k = k.replace(/ /g, "_");
  if (BY_KEY.has(k)) return k;
  const byLabel = STATES.find(
    (s) => s.label.toLowerCase().replace(/[^a-z]/g, "") === k.replace(/[^a-z]/g, ""),
  );
  return byLabel ? byLabel.key : null;
}

export function zoneForState(stateKey) {
  const s = BY_KEY.get(normalizeState(stateKey) || "");
  return s ? s.zone : null;
}

export function statesInZone(zoneKey) {
  return STATES.filter((s) => s.zone === zoneKey).map((s) => s.key);
}

// The state a zone falls back to when only a zone is known. Deliberately the
// commercial centre of each zone, because that is where the underlying prices
// were observed.
export const ZONE_ANCHOR_STATE = {
  south_west: "lagos",
  south_east: "enugu",
  south_south: "rivers",
  north_central: "fct",
  north_east: "bauchi",
  north_west: "kano",
};
