// server/util/icmsMap.js
//
// Puts each bill line of a QUIV, HERON or SERVIQ project into the ICMS 3
// structure (International Cost Management Standard, 3rd edition) for
// Buildings, Construction Costs: Level 3 Group (mandatory) and, where the line
// says enough, Level 4 Sub-Group (discretionary). Code tables in
// assets/icms/icms3.json, copied from the standard.
//
// The line is read in this order, most specific first:
//   1. the QUIV element it was measured on ("Columns – Reinforcement" is Structure:
//      the standard keeps formwork, reinforcement and fixings with their principal item)
//   2. its own wording ("WC", "Duct transition", "Clear site / strip topsoil")
//   3. the HERON section it sits under ("--- Sub ---", "--- Elect ---")
//   4. the bill category the plugin gave it (Substructure / Frames / HVAC ...)
// A line none of these decides is left unmapped for the QS to place: the
// standard says mapping needs a cost professional's judgement, so the export
// never guesses a Group.
//
// Pure: no Mongo, no Express. Pinned by icmsMap.test.js.

import fs from "node:fs";

const ICMS = JSON.parse(fs.readFileSync(new URL("../assets/icms/icms3.json", import.meta.url), "utf8"));

export const ICMS_EDITION = ICMS.edition;
export const ICMS_PROJECT_TYPES = ICMS.projectTypes;
export const ICMS_CATEGORIES = ICMS.categories;
export const ICMS_GROUPS = ICMS.constructionGroups;
export const ICMS_SUB_GROUPS = ICMS.buildingSubGroups;

const GROUP_BY_CODE = new Map(ICMS_GROUPS.map((g) => [g.code, g]));
const SUB_BY_CODE = new Map(ICMS_SUB_GROUPS.map((s) => [s.code, s]));

export const groupTitle = (code) => GROUP_BY_CODE.get(code)?.title || "";
export const subGroupTitle = (code) => SUB_BY_CODE.get(code)?.title || "";

/**
 * The ICMS code of a Group or Sub-Group. Within a project: "2.04.060"; with the
 * project type: "01.2.04.060". `category` is the Level 2 code (2 = Construction).
 */
export function icmsCode({ projectType = null, category = "2", group, subGroup = null }) {
  const tail = subGroup ? `${group}.${subGroup.split(".")[1]}` : group;
  return `${projectType ? `${projectType}.` : ""}${category}.${tail}`;
}

/* ------------------------------------------------------------------ */
/* Rules. Each is { re, group, sub?, id }. Sub-Groups only where the  */
/* words settle it.                                                    */

const R = (id, re, group, sub = null) => ({ id, re, group, sub: sub ? `${group}.${sub}` : null });

// Things that win wherever they appear: a railing on a staircase is still a railing.
const FIRST = [
  R("railing", /\b(railings?|balustrades?|handrails?|hand rails?)\b/i, "04", "050"),
  R("burglar-bars", /\b(burglar|buglar|burglary)\b.*\bbars?\b|\bbars? to windows\b/i, "04", "050"),
  R("ironmongery", /\bironmongery\b/i, "04", "050"),
  R("prelims", /\b(fixed charge|time[\s-]related charge|preliminar(y|ies)|site establishment|mobili[sz]ation|demobili[sz]ation)\b/i, "08"),
  R("contingency", /\bcontingenc(y|ies)\b/i, "09", "020"),
  R("vat", /\b(vat|value added tax)\b/i, "10", "020"),
  // "The contractor shall buy and maintain design software": a constructor's overhead
  R("contractor-shall", /^the contractor shall\b/i, "08"),
];

// The QUIV element (the words before " – "), read before the line's own wording.
const ELEMENT = [
  R("el-pile", /^(piles?|piling|pile caps?)\b/i, "02", null), // pile caps are foundations; piles are 02.010 (below)
  R("el-basement", /^basement\b/i, "02", "030"),
  R("el-foundation", /^(strip|pad|raft|footings?|foundations?|oversite|ground beams?|substructure|sub[\s-]?structure|stub columns?)\b/i, "02", "020"),
  R("el-roof-structure", /^roof\b.*\b(rafters?|purlins?|wall ?plates?|king ?posts?|struts?|tie ?beams?|trusses?|noggin\w*|ceiling joists?|battens?)\b/i, "03", "030"),
  R("el-roof", /^roof\b/i, "04", "030"),
  R("el-ground-slab", /^slabs?\b.*\b(ground floor|on grade|on ground|gf\b|lowest)/i, "02", "020"),
  R("el-frame", /^(columns?|beams?|slabs?|stair(case)?s?|landings?|lift( core)?|core walls?|shear walls?|frames?|steelwork|structural steel)\b/i, "03", "030"),
  R("el-window", /^windows?\b/i, "04", "020"),
  R("el-door-ext", /^doors?\b.*\b(ext|exterior|external|entrance|main)\b/i, "04", "020"),
  R("el-door-int", /^doors?\b.*\b(int|interior|internal|flush)\b/i, "04", "040"),
  R("el-door", /^doors?\b/i, "04"),
  R("el-ceiling", /^(ceilings?|finishes)\b/i, "04", "060"),
  R("el-wall-ext", /^(blockwork|walls?|brickwork|masonry)\b.*\b(ext|exterior|external|perimeter|fence|boundary)\b/i, "04", "020"),
  R("el-wall-int", /^(blockwork|walls?|brickwork|masonry)\b.*\b(int|interior|internal|partition)\b/i, "04", "040"),
  R("el-wall", /^(blockwork|walls?|brickwork|masonry|lintels?)\b/i, "04"),
  R("el-site", /^(clear site|site clearance|strip topsoil|demolition)\b/i, "01", "060"),
  R("el-external", /^(landscaping|external works?|paving|driveway|fence|fencing|car ?park)\b/i, "07"),
];

// The line's own wording.
const WORDING = [
  // 01 site
  R("demolition", /\b(demolish|demolition|pull(ing)? down|break(ing)? out existing)\b/i, "01", "050"),
  R("site-clearance", /\b(clear(ing)? (the )?site|site clearance|strip(ping)? top ?soil|grubbing|tree felling|bush clearing|clearing site)\b/i, "01", "060"),
  R("site-survey", /\b(soil investigation|ground investigation|site survey|geotechnical)\b/i, "01", "010"),
  R("dewatering", /\b(dewater\w*|well ?point)\b/i, "01", "090"),
  R("hoarding", /\b(hoarding|temporary fenc\w*)\b/i, "08", "030"),

  // 06 drainage outside the building
  R("septic", /\b(septic|soak ?away|soakaway|foul (water )?drain\w*|sewage treatment)\b/i, "06", "030"),
  R("storm", /\b(storm ?water|surface water drain\w*|rain ?water drain\w*|open drain|drainage channel|culvert)\b/i, "06", "020"),
  R("manhole", /\b(manholes?|inspection chambers?|catch ?pits?)\b/i, "06", "030"),

  // 07 external works
  R("paving", /\b(interlocking|paving|paved|asphalt|kerbs?|driveway|car ?park|walkway|road(way)?s?)\b/i, "07", "040"),
  R("landscaping", /\b(landscap\w*|grass(ing)?|turf(ing)?|planting|top ?soil to (lawn|garden))\b/i, "07", "050"),
  R("fence", /\b(fence|fencing|gate(house)?|boundary wall|perimeter wall)\b/i, "07", "020"),
  R("basement-wall", /\bbasement\b/i, "02", "030"),
  R("retaining", /\bretaining walls?\b/i, "07", "010"),
  R("horticulture", /\bhorticultur\w*\b/i, "07", "050"),
  R("ext-services", /\b(external (lighting|water|power|services)|street ?light\w*|borehole)\b/i, "07", "070"),

  // the lift's shaft is structure ("12mm bar in Lift", "Lift core walls"); the lift car is a service
  R("lift-shaft", /\b(bars?|concrete|formwork|reinforcement|walls?)\b.*\b(in|to|for) (the )?lift\b|\blift (walls?|shafts?|cores?|pits?)\b/i, "03", "030"),
  // 05 services: most specific first
  R("lift", /\b(lifts?|elevators?|escalators?)\b/i, "05", "100"),
  R("generator", /\b(generat(or|ing set)s?|gen ?set)\b/i, "05", "130"),
  R("solar", /\b(solar|photovoltaic|pv panels?|inverters?)\b/i, "05", "140"),
  R("fire", /\b(fire (alarm|hydrant|hose|extinguisher|fighting|detection)\w*|sprinklers?|hose ?reels?|smoke detectors?|heat detectors?|wet risers?|dry risers?)\b/i, "05", "080"),
  R("elv", /\b(cctv|intercom|access control|public address|data (point|outlet|cabl\w*)|telephone|structured cabling|cat ?6|tv outlet|satellite)\b/i, "05", "040"),
  R("lighting", /\b(light(ing)? fittings?|luminaires?|downlights?|led\b|lamps?|bulkhead|flood ?lights?|ceiling lights?|fluorescent)\b/i, "05", "030"),
  R("hvac", /\b(ducts?|ductwork|diffusers?|grilles?|split (unit|air)|air[\s-]?condition\w*|a\/c\b|ac units?|extract(or)? fans?|ceiling fans?|ventilation|vrf|vrv|chillers?|ahu|fcu|fan coil|air handling|dampers?|refrigerant|mechanical equipment)\b/i, "05", "010"),
  R("gas", /\b(gas (pipe|supply|installation)\w*|lpg installation)\b/i, "05", "090"),
  R("sanitary", /\b(wc|w\.c\.?|water[\s-]?closets?|toilets?|wash[\s-]?hand[\s-]?basins?|whb|basins?|sinks?|showers?|bath(tub)?s?|urinals?|bidets?|cisterns?|plumbing fixtures?|sanitary)\b/i, "05", "060"),
  R("electrical", /\b(cables?|cabling|conduits?|wiring|switch(es)?|(?<!pipe )sockets?|socket outlets?|distribution (board|equipment)s?|switch ?gears?|\bdb\b|breakers?|mcb|rccb|isolators?|earthing|lightning (protection|arrestor)|trunking|cable trays?|electric(al)?|1[\s-]?gang|2[\s-]?gang|accessories)\b/i, "05", "020"),
  R("plumbing", /\b(pipes?|pipework|piping|valves?|water tanks?|overhead tanks?|pumps?|taps?|faucets?|plumbing|water supply|soil (and|&) waste|waste pipes?|gully|gullies|traps?|pipe sockets?|elbows?|tees?|reducers?|unions?|couplings?)\b/i, "05", "050"),
  R("kitchen", /\bkitchen (equipment|cabinets?|units?)\b/i, "05", "180"),

  // 02 / 03 structure words, where no QUIV element said so
  R("piling", /\b(piles?|piling|caissons?|underpinning)\b(?!\s*caps?)/i, "02", "010"),
  // the lowest floor slab is substructure (ICMS 02.020), whatever else is said about it
  R("ground-slab", /\b(ground|lowest|compound|oversite) floor slabs?\b|\b(ground|lowest) slabs?\b|\bslabs? on (grade|ground)\b|^beds?\s*;/i, "02", "020"),
  R("foundation", /\b(foundations?|footings?|pile caps?|pad bases?|bases?|raft|strip|ground beams?|blinding|hardcore|laterite|oversite|sub[\s-]?base|d\.?p\.?m\.?|damp[\s-]?proof membrane|anti[\s-]?termite|soil (poisoning|treatment)|surface treatment|excavat\w*|exc\b|trench\w*|earth ?work support|backfill\w*|disposal|cart away|level(l)?ing and compact\w*|compact(ion|ing)|formation)\b/i, "02", "020"),
  R("staircase", /\b(stair(case)?s?|landings?|treads?|risers?|strings?|waist|steps)\b/i, "03", "030"),
  // in-situ concrete walls carry load: structure, not the blockwork of Group 04
  R("rc-wall", /^walls?\s*;|\b(reinforced concrete|r\.?c\.?|in[\s-]?situ concrete|concrete|shear) walls?\b/i, "03", "030"),
  R("frame", /\b(columns?|beams?|suspended slabs?|slabs?|lift (wall|shaft|core)|bars? in lift|shear walls?|structural steel\w*|steel (sections?|beams?|columns?)|universal (beams?|columns?))\b/i, "03", "030"),
  // a covering named, even "fixed to purlins", is the covering
  R("roof-covering-named", /\b(roof(ing)? (cover\w*|sheets?|tiles?|felt|membrane)|longspan|long span|stone[\s-]?coated|corrugated|ridge|fascia|barge ?boards?|gutters?|flashings?|skylights?|roof ?lights?)\b/i, "04", "030"),
  R("roof-structure", /\b(rafters?|purlins?|wall ?plates?|king ?posts?|struts?|tie ?beams?|roof trusses?|trusses?|noggin\w*)\b/i, "03", "030"),

  // 04 architectural works
  R("facade", /\b(fa[cç]ade|cladding|claddings|gfrc|acp|curtain ?walls?|screen walls?)\b/i, "04", "020"),
  R("raised-floor", /\braised (access )?floor\w*\b/i, "04", "060"),
  R("roof-covering", /\b(roof|down ?pipes?)\b/i, "04", "030"),
  R("window", /\b(windows?|glazing|louv(re|er)s?|curtain ?walls?|shop ?fronts?)\b/i, "04", "020"),
  R("door-ext", /\b(external|entrance|main|security|steel) doors?\b/i, "04", "020"),
  R("door-int", /\b(internal|interior|flush|panel(led)?) doors?\b/i, "04", "040"),
  R("door", /\bdoors?\b/i, "04"),
  R("partition", /\b(partitions?|drywall|dry lining|toilet cubicles?)\b/i, "04", "040"),
  R("finishes", /\b(ceilings?|p\.?o\.?p\.?|plaster(ing)?|render(ing)?|screed\w*|floor (finish|tiles?|cover)\w*|wall tiles?|tiles?|tiling|terrazzo|skirting|paint(ing)?|emulsion|texcote|decorat\w*|finishes|vinyl|carpet|marble|granite (floor|wall)|wallpaper|gypsum)\b/i, "04", "060"),
  R("fittings", /\b(wardrobes?|cabinets?|cupboards?|shelves|shelving|counters?|vanit(y|ies)|signage|mirrors?)\b/i, "04", "050"),
  R("wall", /\b(blockwork|block ?work|blocks?|sandcrete|brickwork|bricks?|masonry|walls?|lintels?|d\.?p\.?c\.?|damp[\s-]?proof course|copings?|parapets?|wall perimeter|wall area)\b/i, "04"),
  R("ffe", /\b(furniture|loose (fittings|equipment)|ffe|ff&e)\b/i, "12", "010"),
];

// HERON section headers ("--- Sub ---") and plugin bill categories, as a fallback.
const SECTION = [
  R("sec-sub", /\b(sub|substructure|sub[\s-]?structure|foundations?)\b/i, "02"),
  R("sec-stair", /\bstair(case)?s?\b/i, "03", "030"),
  R("sec-frame", /\b(frames?|columns?|beams?|slabs?|structure|superstructure frame)\b/i, "03"),
  R("sec-roof", /\broof(ing)?\b/i, "04", "030"),
  R("sec-finishes", /\bfinish(es|ings?)?\b/i, "04", "060"),
  R("sec-walls", /\b(walls?|block\w*|masonry)\b/i, "04"),
  R("sec-openings", /\b(doors?|windows?|joinery|openings?)\b/i, "04"),
  R("sec-elect", /\b(elect\w*)\b/i, "05", "020"),
  R("sec-plumb", /\b(plumb\w*|sanitary)\b/i, "05", "050"),
  R("sec-mech", /\b(mech\w*|hvac|air[\s-]?con\w*)\b/i, "05", "010"),
  R("sec-fire", /\bfire\b/i, "05", "080"),
  R("sec-drain", /\bdrain\w*\b/i, "06"),
  R("sec-external", /\b(external|ext\.? works?|landscap\w*)\b/i, "07"),
  R("sec-prelims", /\bprelim\w*\b/i, "08"),
];

const CATEGORY = {
  substructure: R("cat-substructure", /./, "02"),
  frames: R("cat-frames", /./, "03"),
  superstructure: R("cat-superstructure", /./, "04"),
  hvac: R("cat-hvac", /./, "05", "010"),
  plumbing: R("cat-plumbing", /./, "05", "050"),
  electrical: R("cat-electrical", /./, "05", "020"),
};

const HEADER = /^\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;
const isMep = (pk) => /mep/i.test(String(pk || ""));

/**
 * QUIV's element: "Columns – Reinforcement [L:...]" -> "Columns". Only a short name
 * of words counts: "Walls; thickness 150 - 450mm" is a bill description, not an element.
 */
export function elementOf(text) {
  const t = String(text || "").trim();
  const m = t.match(/^([A-Za-z][A-Za-z /&()_]{1,30}?)\s+[–-]\s+/);
  return m ? m[1].trim() : "";
}

const first = (rules, text) => (text ? rules.find((r) => r.re.test(text)) || null : null);

function result(rule, basis, why) {
  return {
    group: rule.group,
    subGroup: rule.sub,
    basis, // "element" | "wording" | "section" | "category" | "product" | "none"
    rule: rule.id,
    why,
  };
}

const UNMAPPED = { group: null, subGroup: null, basis: "none", rule: null, why: "Nothing on the line says which ICMS Group it belongs to; place it by hand." };

/**
 * One line. `ctx` = { productKey, section, parent } where section is the HERON
 * header above it and parent the un-indented line it hangs under.
 */
export function mapLine(item = {}, ctx = {}) {
  const desc = String(item.description || "").trim();
  const words = [desc, item.takeoffLine, item.materialName, item.type].map((v) => String(v || "").trim()).filter(Boolean).join(" | ");
  if (!words) return { ...UNMAPPED, why: "The line has no description." };

  const element = elementOf(desc) || elementOf(String(item.takeoffLine || ""));
  let r;
  if ((r = first(FIRST, words))) return result(r, "wording", `Says "${words.match(r.re)[0]}".`);
  if (element && (r = first(ELEMENT, element + " " + desc))) {
    // a pile cap is a foundation, a pile is piling
    if (r.id === "el-pile") r = /caps?\b/i.test(element) ? R("el-pile-cap", /./, "02", "020") : R("el-pile", /./, "02", "010");
    return result(r, "element", `Measured on the ${element} element.`);
  }
  // SERVIQ: every line is a building service; its wording only picks the Sub-Group
  if (isMep(ctx.productKey)) {
    r = first(WORDING.filter((x) => x.group === "05" || x.group === "06" || x.group === "07"), words);
    if (r) return result(r, "wording", `Says "${words.match(r.re)[0]}".`);
    const cat = CATEGORY[String(item.category || "").toLowerCase()];
    if (cat) return result(cat, "category", `SERVIQ bill category ${item.category}.`);
    return result(R("mep", /./, "05"), "product", "A SERVIQ line: services and equipment.");
  }
  if ((r = first(WORDING, words))) return result(r, "wording", `Says "${words.match(r.re)[0]}".`);
  if (ctx.parent && (r = first(WORDING, ctx.parent))) return result(r, "wording", `Part of "${ctx.parent.slice(0, 60)}".`);
  if (ctx.section && (r = first(SECTION, ctx.section))) return result(r, "section", `Under the "${ctx.section}" section.`);
  const cat = CATEGORY[String(item.category || "").toLowerCase()];
  if (cat) return result(cat, "category", `Bill category ${item.category}.`);
  return UNMAPPED;
}

/**
 * A whole bill, in order, so a HERON line can take the section header above it
 * and an indented line the line it hangs under. Header rows themselves come back
 * as { header: true }; they carry no money.
 */
export function mapBill(items = [], { productKey = "" } = {}) {
  let section = "";
  let parent = "";
  let previous = null;
  return items.map((item) => {
    const desc = String(item?.description || "");
    const h = desc.match(HEADER);
    if (h) {
      section = h[1];
      parent = "";
      previous = null;
      return { header: true, section, group: null, subGroup: null, basis: "none", rule: null, why: "Section heading." };
    }
    const indented = /^\s{2,}\S/.test(desc);
    let out = mapLine(item, { productKey, section, parent: indented ? parent : "" });
    // "Ditto 200 - 350mm thick": the line above, varied; read as a QS reads it
    if (/^\s*ditto\b/i.test(desc) && previous?.group && (out.basis === "none" || out.basis === "section" || out.basis === "category")) {
      out = { ...previous, basis: "ditto", why: "Ditto the line above." };
    }
    if (!indented && desc.trim()) parent = desc.trim();
    if (out.group && desc.trim()) previous = out;
    return out;
  });
}
