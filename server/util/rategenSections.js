// server/util/rategenSections.js
/** canonical section keys */
// Exported so the catalogue register can build its section filter from the
// canonical list rather than from whatever sections happen to have rates in
// them. A section with nothing in it is a real state and must stay visible:
// Carbon and Others was invisible on the website for exactly that reason.
export const ALLOWED_SECTION_KEYS = new Set([
  "ground",
  "concrete",
  "blockwork",
  "finishes",
  "roofing",
  "doors_windows",
  "paint",
  "steelwork",
  "carbon",
  "mep",
]);

export const SECTION_LABELS = {
  ground: "Groundwork",
  concrete: "Concrete Works",
  blockwork: "Blockwork",
  finishes: "Finishes",
  roofing: "Roofing",
  doors_windows: "Windows & Doors",
  paint: "Painting",
  steelwork: "Steelwork",
  carbon: "Carbon and Others",
  mep: "MEP"
};

