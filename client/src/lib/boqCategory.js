/**
 * Classify a BoQ item into a category based on description / takeoff line / type / material name.
 *
 * Mirror of `server/util/boqCategory.js` so the client can derive a category for legacy
 * items that were saved before the field existed, and so the table can group rows
 * regardless of whether the server-side persisted category is present yet.
 *
 * Category sets:
 *   - QUIV (revit, revit-materials, planswift, etc.) -> Substructure | Frames | Superstructure
 *   - Revit MEP (revitmep / mep)                     -> HVAC | Plumbing | Electrical
 */

export const QUIV_CATEGORIES = ["Substructure", "Frames", "Superstructure"];
export const MEP_CATEGORIES = ["HVAC", "Plumbing", "Electrical"];
export const UNCATEGORIZED = "Uncategorized";

const QUIV_RULES = [
  {
    name: "Substructure",
    re: /\b(foundation|footing|pile|pad|raft|blinding|hardcore|d\s*p\s*m|membrane|ground[\s-]?beam|substructure|excavat|sub[-\s]?structure|oversite|lateri?te|fill(?:ing)?|backfill|trench)\b/i,
  },
  {
    name: "Frames",
    re: /\b(column|beam|slab|lintel|frame|reinforce(?:ment)?|rebar|stanchion|post|truss|girder|joist|rafter|purlin)\b/i,
  },
  {
    name: "Superstructure",
    re: /\b(wall|roof|door|window|stair|finish(?:es|ing)?|ceiling|floor[\s-]?finish|plaster|tiling|tile|paint|cladding|partition|skirting|screed|render|coping|fascia|gutter|opening|blockwork|brickwork|block|brick|carpentry|joinery|balustrade|handrail|railing)\b/i,
  },
];

const MEP_RULES = [
  {
    name: "HVAC",
    re: /\b(duct(?:work)?|fan|vrf|ahu|fcu|grille|diffuser|hvac|chiller|cooling|heating|thermostat|damper|air[\s-]?handling|air[\s-]?terminal|mech(?:anical)?[\s-]?equipment|exhaust|ventilation|condens(?:er|ing)|refrigerant|register)\b/i,
  },
  {
    name: "Plumbing",
    re: /\b(pipe|fitting|valve|tank|toilet|wc|water[\s-]?closet|basin|lavatory|shower|drain(?:age)?|sewer|sanitary|plumb(?:ing)?|sprinkler|hose|tap|faucet|cistern|gully|trap|pump|hydrant|riser|stack|waste)\b/i,
  },
  {
    name: "Electrical",
    re: /\b(cable|conduit|wire|tray|light(?:ing|s)?|lamp|luminaire|panel|switch|socket|outlet|receptacle|breaker|busbar|bus[\s-]?bar|distribution[\s-]?board|electric(?:al)?|junction|motor|generator|transformer|earthing|grounding|raceway|fixture[\s-]?ec|emt)\b/i,
  },
];

function isMepProductKey(key) {
  const k = String(key || "").toLowerCase().replace(/[^a-z]/g, "");
  return k.includes("mep");
}

export function categoriesForProductKey(productKey) {
  return isMepProductKey(productKey) ? MEP_CATEGORIES : QUIV_CATEGORIES;
}

export function allCategoriesForProductKey(productKey) {
  return [...categoriesForProductKey(productKey), UNCATEGORIZED];
}

export function rulesForProductKey(productKey) {
  return isMepProductKey(productKey) ? MEP_RULES : QUIV_RULES;
}

export function deriveItemCategory(item, productKey) {
  const cats = categoriesForProductKey(productKey);
  const existing = String(item?.category || "").trim();
  if (existing && (cats.includes(existing) || existing === UNCATEGORIZED)) {
    return existing;
  }

  const haystack = [
    item?.description,
    item?.takeoffLine,
    item?.materialName,
    item?.type,
    item?.code,
  ]
    .map((v) => String(v || ""))
    .join(" ");

  if (!haystack.trim()) return UNCATEGORIZED;

  for (const rule of rulesForProductKey(productKey)) {
    if (rule.re.test(haystack)) return rule.name;
  }
  return UNCATEGORIZED;
}
