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

/* ------------------------------------------------------------------ */
/* Trade / work-section classifier — groups items by the WORK being    */
/* done (concrete, formwork, reinforcement, masonry, etc.) rather than */
/* by building element. Used by the Trade-format exports on the client */
/* side (generic BoQ XLSX, materials view).                            */
/* ------------------------------------------------------------------ */

export const QUIV_TRADES = [
  "Earthworks",
  "Concrete Works",
  "Formwork",
  "Reinforcement",
  "Masonry",
  "Damp-proofing",
  "Carpentry & Roofing",
  "Joinery",
  "Finishes — Floor",
  "Finishes — Wall",
  "Finishes — Ceiling",
  "Decoration",
  "Structural Steelwork",
  "External Works",
];

export const MEP_TRADES = [
  "HVAC",
  "Plumbing & Drainage",
  "Electrical Installations",
];

const QUIV_TRADE_RULES = [
  {
    name: "Earthworks",
    re: /\b(clear[\s-]?site|strip\s+topsoil|site\s+clearance|excavat|earthwork[\s-]?support|dispos|cart\s+away|surplus|backfill(?:ing)?|hardcore|sub[\s-]?base|laterite|level(?:ing|ling)?|compact(?:ion|ing)?|formation|anti[\s-]?termite|soil\s+treatment|surface\s+treatment)\b/i,
  },
  {
    name: "Formwork",
    re: /\bformwork\b/i,
  },
  {
    name: "Reinforcement",
    re: /\b(reinforcement|rebar|brc|mesh|fabric)\b/i,
  },
  {
    name: "Concrete Works",
    re: /\b(concrete|blinding|rcc|r\.c\.c|lintel.*concrete)\b/i,
  },
  {
    name: "Damp-proofing",
    re: /\b(dpm|dpc|damp[\s-]?proof)\b/i,
  },
  {
    name: "Masonry",
    re: /\b(blockwork|brickwork|block\b|brick\b|masonry|sandcrete)\b/i,
  },
  {
    name: "Carpentry & Roofing",
    re: /\b(roof|rafter|purlin|wall[\s-]?plate|king[\s-]?post|strut|tie[\s-]?beam|tiebeam|noggin|carpentry|roof\s+cover|roof\s+area)\b/i,
  },
  {
    name: "Joinery",
    re: /\b(door|window|joinery|ironmongery|frame\b|glazing|glass\b)\b/i,
  },
  {
    name: "Structural Steelwork",
    re: /\b(steelwork|steel[\s-]?section|steel\s+weight|structural\s+steel)\b/i,
  },
  {
    name: "Finishes — Floor",
    re: /\b(floor[\s-]?finish|floor\s+tile|screed|floors?\s+(?:default|area)|floor\s+cover)\b/i,
  },
  {
    name: "Finishes — Ceiling",
    re: /\b(ceiling[\s-]?finish|ceiling\s+area|p\.?o\.?p\.?|pop\s+ceiling|plaster\s+of\s+paris)\b/i,
  },
  {
    name: "Decoration",
    re: /\b(paint(?:ing)?|texcote|emulsion|decorat|model\s+item)\b/i,
  },
  {
    name: "Finishes — Wall",
    re: /\b(rendering|plaster(?:ing)?|wall\s+finish|finishes\s+walls?|wall\s+tile)\b/i,
  },
  {
    name: "External Works",
    re: /\b(landscap|external\s+work|paving|fencing|pavement|driveway)\b/i,
  },
];

const MEP_TRADE_RULES = [
  {
    name: "HVAC",
    re: /\b(duct(?:work)?|fan|vrf|ahu|fcu|grille|diffuser|hvac|chiller|cooling|heating|thermostat|damper|air[\s-]?handling|air[\s-]?terminal|mech(?:anical)?[\s-]?equipment|exhaust|ventilation|condens(?:er|ing)|refrigerant|register)\b/i,
  },
  {
    name: "Plumbing & Drainage",
    re: /\b(pipe|fitting|valve|tank|toilet|wc|water[\s-]?closet|basin|lavatory|shower|drain(?:age)?|sewer|sanitary|plumb(?:ing)?|sprinkler|hose|tap|faucet|cistern|gully|trap|pump|hydrant|riser|stack|waste)\b/i,
  },
  {
    name: "Electrical Installations",
    re: /\b(cable|conduit|wire|tray|light(?:ing|s)?|lamp|luminaire|panel|switch|socket|outlet|receptacle|breaker|busbar|bus[\s-]?bar|distribution[\s-]?board|electric(?:al)?|junction|motor|generator|transformer|earthing|grounding|raceway|fixture[\s-]?ec|emt)\b/i,
  },
];

export function tradesForProductKey(productKey) {
  return isMepProductKey(productKey) ? MEP_TRADES : QUIV_TRADES;
}

export function deriveItemTrade(item, productKey) {
  const rules = isMepProductKey(productKey) ? MEP_TRADE_RULES : QUIV_TRADE_RULES;

  const haystack = [
    item?.description,
    item?.takeoffLine,
    item?.materialName,
    item?.type,
    item?.code,
  ]
    .map((v) => String(v || ""))
    .join(" ");

  if (!haystack.trim()) return "Other";

  for (const rule of rules) {
    if (rule.re.test(haystack)) return rule.name;
  }
  return "Other";
}
