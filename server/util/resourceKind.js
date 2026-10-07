// One resource classifier for the whole pricing path.
//
// A build-up line is one of five resource classes — Material, Labour, Plant,
// Consumable, Equipment. Five places used to decide that independently:
//
//   1. util/rategenUserRates.js   classifyComponentKind()  (word-boundary regex)
//   2. services/archicadCosting.js classifyKind()          (substring keywords)
//   3. util/billBudgetExporter.js  bucketFor() / kindLabel() (stored kind → sheet)
//   4. services/agentUserData.js   kindOf()                (stored kind → label)
//   5. features/projects/ProjectBudgetTab.jsx kindMeta()   (stored kind → chip)
//
// They disagreed. Measured against the 1,709 distinct component names in the
// production catalogue and project budgets, (1) and (2) returned a different
// class for 73 of them, and both were wrong on some:
//
//   * (2) matched by substring, so "TOILET DOOR" and "Cutting Subsoil" were
//     Consumable (they contain "oil"), and every "Concrete Masonry Unit" was
//     Labour (it contains "mason"). Those are materials being priced as
//     something else.
//   * (1) matched with \b...\b and no plural, so "Masons", "Carpenters",
//     "Steelfixer" and "Nails 3\"" fell through to Material, and it knew
//     nothing of "Compressor", "Bulldozer" or "Payloader".
//
// This module is the union of the two vocabularies with the mechanics fixed:
// word-boundary matching (so "toilet" is not oil and "masonry" is not a mason)
// and tolerant of plurals and the common agent suffixes.
//
// PRECEDENCE IS LABOUR FIRST, and that is a QS rule, not a coding preference:
// plant is the machine, not the man who drives it. "Tipper driver", "crane
// operator" and "mixer operator" are labour; "tipper", "crane" and "concrete
// mixer" are plant. (2) tested plant first and classed the drivers as plant.
//
// AN EXPLICIT KIND ALWAYS WINS over the name. That is what keeps this change
// inert where it matters: of the 204 breakdown lines in the production master
// catalogue, 203 already carry an explicit refKind, so the name rules are never
// consulted for them (counted 23 Sep 2026).
//
// Pure (no DB / mongoose / React), so both the server and the client can use it.

/** The canonical resource classes, lowercase — the vocabulary used on the wire. */
export const KIND = Object.freeze({
  MATERIAL: "material",
  LABOUR: "labour",
  PLANT: "plant",
  CONSUMABLE: "consumable",
  EQUIPMENT: "equipment",
});

/** Display / storage spelling. `budgetItems.componentKind` is stored capitalised. */
const LABELS = Object.freeze({
  material: "Material",
  labour: "Labour",
  plant: "Plant",
  consumable: "Consumable",
  equipment: "Equipment",
});

// Every spelling of an explicit kind seen on the wire: the website's own
// lowercase vocabulary, the capitalised spelling stored in budgetItems, the
// plugins' RateComponentKind names, and RateGen desktop's legacy 0/1 codes.
const ALIASES = new Map(
  Object.entries({
    material: KIND.MATERIAL,
    materials: KIND.MATERIAL,
    mat: KIND.MATERIAL,
    0: KIND.MATERIAL,
    labour: KIND.LABOUR,
    labor: KIND.LABOUR,
    lab: KIND.LABOUR,
    1: KIND.LABOUR,
    plant: KIND.PLANT,
    equipment: KIND.EQUIPMENT,
    equip: KIND.EQUIPMENT,
    consumable: KIND.CONSUMABLE,
    consumables: KIND.CONSUMABLE,
  }),
);

/**
 * An explicitly-declared kind, normalised — or "" when it is absent or is a
 * word we do not know. Never guesses from a name.
 */
export function canonicalKind(explicit) {
  const k = String(explicit == null ? "" : explicit)
    .trim()
    .toLowerCase();
  if (!k) return "";
  return ALIASES.get(k) || "";
}

// ── the name vocabulary ─────────────────────────────────────────────────────
//
// `(?:s|es)?` on the trades covers the plurals a schedule actually uses
// ("Masons", "Carpenters"); the (?:man|men|operator|driver|hand) tail catches
// "banksman", "crane operator", "tipper driver".

const LABOUR_RE = new RegExp(
  "\\b(?:" +
    "labou?r(?:er|ers|ing)?|" +
    "mason(?:s|ry\\s*gang)?|bricklayer(?:s)?|carpenter(?:s)?|joiner(?:s)?|" +
    "bender(?:s)?|steel\\s*fixer(?:s)?|steelfixer(?:s)?|fixer(?:s)?|fitter(?:s)?|" +
    "painter(?:s)?|plumber(?:s)?|electrician(?:s)?|welder(?:s)?|plasterer(?:s)?|" +
    "tiler(?:s)?|artisan(?:s)?|craftsman|craftsmen|" +
    "workmanship|gang|foreman|foremen|ganger|banksman|banksmen|" +
    "helper(?:s)?|operative(?:s)?|operator(?:s)?|driver(?:s)?|" +
    "skilled|unskilled|semi[\\s-]?skilled|headpan|wheelbarrow\\s*man" +
    ")\\b",
  "i",
);

const PLANT_RE = new RegExp(
  "\\b(?:" +
    "plant|excavat(?:or|ors|ion|ing)?|bulldozer(?:s)?|dozer(?:s)?|" +
    "mixer(?:s)?|vibrator(?:s)?|poker(?:s)?|compressor(?:s)?|" +
    "crane(?:s)?|hoist(?:s)?|winch(?:es)?|" +
    "loader(?:s)?|payloader(?:s)?|backhoe(?:s)?|grader(?:s)?|" +
    "roller(?:s)?|compactor(?:s)?|rammer(?:s)?|" +
    "truck(?:s)?|tipper(?:s)?|lorr(?:y|ies)|dumper(?:s)?|" +
    "scaffold(?:ing)?|formwork\\s*system|" +
    "machine(?:s|ry)?|hire|plant\\s*hire" +
    ")\\b",
  "i",
);

const CONSUMABLE_RE = new RegExp(
  "\\b(?:" +
    "nail(?:s)?|binding\\s*wire|tying\\s*wire|" +
    "fuel(?:s|ling)?|diesel|petrol|gas\\s*oil|lubricant(?:s)?|grease|mould\\s*oil|" +
    "consumable(?:s)?|disposab\\w*|electrode(?:s)?" +
    ")\\b",
  "i",
);

/**
 * The resource class of one build-up line.
 *
 * An explicit kind wins outright. Otherwise the name decides, labour first
 * (the driver of a machine is labour), then plant, then consumable, and
 * anything else is material — because anything physical and priced is.
 *
 * @param {string} name        the component / material name
 * @param {string} [explicit]  a declared kind (refKind, rateType, componentKind…)
 * @returns {"material"|"labour"|"plant"|"consumable"|"equipment"}
 */
export function classifyResourceKind(name, explicit) {
  const declared = canonicalKind(explicit);
  if (declared) return declared;

  const n = String(name || "");
  if (LABOUR_RE.test(n)) return KIND.LABOUR;
  if (PLANT_RE.test(n)) return KIND.PLANT;
  if (CONSUMABLE_RE.test(n)) return KIND.CONSUMABLE;
  return KIND.MATERIAL;
}

/**
 * How a kind is spelled in `budgetItems.componentKind` and on screen.
 *
 * A kind we do not recognise is title-cased and returned as it came, never
 * remapped: a stored row's own word is the QS's, and componentKind is part of
 * every budget merge key, so rewriting it would orphan their edits.
 */
export function kindLabel(kind, fallback = "Material") {
  const canon = canonicalKind(kind);
  if (canon) return LABELS[canon];
  const raw = String(kind == null ? "" : kind).trim();
  if (!raw) return fallback;
  return raw[0].toUpperCase() + raw.slice(1);
}

/** Labour, by the stored kind alone — no name guessing. */
export function isLabourKind(kind) {
  return canonicalKind(kind) === KIND.LABOUR;
}

/** Plant or Equipment, by the stored kind alone. Both are plant on a schedule. */
export function isPlantKind(kind) {
  const k = canonicalKind(kind);
  return k === KIND.PLANT || k === KIND.EQUIPMENT;
}

/** Material, by the stored kind alone. A blank kind is Material — see bucketFor. */
export function isMaterialKind(kind) {
  const k = canonicalKind(kind);
  return k === KIND.MATERIAL || (!k && !String(kind || "").trim());
}

/**
 * Sort rank for a budget view: materials, then labour, then plant, then the
 * rest. Stable — lines keep their order inside a kind.
 */
const RANK = { material: 0, labour: 1, plant: 2, consumable: 3, equipment: 4 };
export function kindRank(kind) {
  const k = canonicalKind(kind);
  return k ? RANK[k] : 5;
}
