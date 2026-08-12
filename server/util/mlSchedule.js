// Material & Labour schedule generator.
//
// Turns a bill line into the build-up behind it — the schedule a QS writes by
// hand: "109 m³ of 1:2:4 concrete = 654 bags of cement, 71 tons of sharp sand,
// 142 tons of granite, plus concreting labour at ₦9,000/m³".
//
// This is the server-side port of QUIV's constants engine (Helpers/Estimating.cs
// + Infrastructure/Rates/ConstantsMaterialFallback.cs). It exists here because
// an uploaded Excel bill has no Revit model behind it: the plugins can only
// derive a breakdown from what they measured, so a bill that arrives as a
// workbook — which is nearly all of them — needs the same engine on the server.
//
// Three families of bill line, decided per line:
//
//   1. MEASURED WORK (concrete, blockwork, formwork, rebar, finishes, fill…)
//      → factor decomposition. Real quantities from the Material Constants
//        library, priced from the RateGen master price list.
//
//   2. SERVICES / MEP (cables, conduit, luminaires, pipework, ductwork,
//      sanitary, fire) → a supply-and-install rate split into equipment,
//      installation labour and the accessories nobody measures. There is no
//      factor decomposition to do: the item IS the material.
//
//   3. SUPPLY-DOMINATED BUILDER'S WORK (doors, windows, sanitary fittings,
//      railings, roof members) → the same share treatment, per the reference QS
//      schedules (0.70 material / 0.15 labour).
//
// RECONCILIATION IS THE INVARIANT. deriveBillRatesFromBudget() drives each bill
// rate from its build-up, so a generated schedule that costs less than the bill
// would silently cut the client's bill total. Every generated group therefore
// carries an overhead/profit that makes the derived rate equal the rate the bill
// arrived with. Only an UNPRICED line (rate 0 — nothing to preserve) is priced
// from cost upward, using the Markup constants.

import { MC } from "./materialConstants.js";
import {
  computeServiceBuildup,
  mapServiceType,
  SERVICE_TYPE_DEFAULTS,
} from "./serviceCompute.js";

// ── numeric / text helpers ──────────────────────────────────────────────────

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
}

function has(text, ...needles) {
  if (!text) return false;
  return needles.some((n) => n && text.includes(n));
}

/** "m³" / "CU.M" / "sq m" → "m3" / "m2"; tonnes → "ton". */
export function normalizeUnit(unit) {
  let u = String(unit || "").trim().toLowerCase();
  u = u.replace(/³/g, "3").replace(/²/g, "2").replace(/[.\s]/g, "");
  if (["cum", "m3", "cubicmeter", "cubicmetre", "cbm"].includes(u)) return "m3";
  if (["sqm", "m2", "squaremeter", "squaremetre", "sm"].includes(u)) return "m2";
  if (["lin m", "linm", "lm", "m", "rm", "linearmeter", "linearmetre"].includes(u)) return "m";
  if (["kg", "kgs", "kilogram", "kilogramme"].includes(u)) return "kg";
  if (["t", "ton", "tons", "tonne", "tonnes", "mt"].includes(u)) return "ton";
  if (["nr", "no", "nos", "number", "each", "ea", "pcs", "piece", "pieces", "unit"].includes(u))
    return "nr";
  if (["item", "sum", "ls", "lumpsum"].includes(u)) return "sum";
  return u;
}

/** The searchable text for a bill line: its description plus its preamble. */
function lineText(item) {
  return `${item?.description || ""} ${item?.takeoffLine || ""}`.toLowerCase();
}

// ── narrow widths: BESMM measures thin work by the metre ────────────────────
//
// "Sawn formwork … Edges of suspended slab not exceeding 200mm — 90 m" is
// formwork, but it is billed in metres, not m². Every such item states its
// girth, so the area is recoverable: 90 m × 0.2 m = 18 m². Without this the
// whole narrow-width family — formwork to edges, skirtings, screeded risers,
// tiled treads, reveals — falls out of the schedule entirely.
//
// The qualifier matters: in "12mm thick screeded backing … in risers 150mm
// high" the girth is the 150mm, not the 12mm bed thickness. So matches are
// ranked by what they describe, and only the unranked case falls back to a
// thickness.
const DIM_RE = /(?:(not\s+exceeding|n\.?e\.?|exceeding|<)\s*)?(\d{2,4})\s*mm(?:\s*(girth|wide|width|high|deep|thick))?/gi;
const QUALIFIER_RANK = { girth: 3, wide: 3, width: 3, high: 2, deep: 2, thick: 1 };

/** The girth (m) of a narrow-width item, or 0 when the text does not state one. */
export function parseGirthMetres(text) {
  let best = 0;
  let bestRank = 0;
  DIM_RE.lastIndex = 0;
  let m;
  while ((m = DIM_RE.exec(text || "")) !== null) {
    const bound = m[1];
    const mm = Number(m[2]);
    const qualifier = String(m[3] || "").toLowerCase();
    if (!Number.isFinite(mm) || mm <= 0) continue;
    // "not exceeding 300mm" with no other word is a girth statement.
    const rank = QUALIFIER_RANK[qualifier] || (bound ? 2 : 0);
    if (rank === 0) continue;
    if (rank > bestRank || (rank === bestRank && mm > best * 1000)) {
      bestRank = rank;
      best = mm / 1000;
    }
  }
  // A "girth" over 1.5 m is not a narrow width — it is a misread dimension.
  return best > 0 && best <= 1.5 ? best : 0;
}

/**
 * How a bill line should be MEASURED for derivation, which is not always how it
 * was billed. Returns the derivation unit, the quantity in that unit, and the
 * factor between them (1 when the bill unit is already right).
 */
export function measureBasis(item, K) {
  const billUnit = normalizeUnit(item?.unit);
  const qty = num(item?.qty);
  if (billUnit !== "m" || qty <= 0) return { unit: billUnit, qty, factor: 1 };

  const text = lineText(item);
  // Linear work that is genuinely linear — pipes, cables, skirting board sold
  // by the metre — is handled by the services / lumpsum branches, not here.
  if (!/(formwork|shutter|soffit|screed|render|plaster|tile|tiling|paint|block|concrete|reveal|edge|skirting|riser|tread|nosing|band|apron|kerb)/.test(text)) {
    return { unit: billUnit, qty, factor: 1 };
  }

  const girth = parseGirthMetres(text) || K.get(MC.NarrowWidthDefaultGirth, 0.3);
  return { unit: "m2", qty: round(qty * girth, 3), factor: girth };
}

/** Everything that hints at the discipline, including the sheet-derived category. */
function classifyText(item) {
  return `${lineText(item)} ${item?.category || ""} ${item?.trade || ""}`.toLowerCase();
}

// ── work classification ─────────────────────────────────────────────────────
//
// Order matters and mirrors the plugin: "Blockwork – Wall Rendering" is
// rendering, not blockwork, so finishes are tested before the structural
// branches.

const LABOUR_ONLY_RE =
  /\b(?:excavat|disposal|dispose|cart\s*away|compact|levell?ing|earthwork[\s-]?support|planking|strutting|backfill|back\s*fill|setting[\s-]?out|site\s*clearance|clearing|topsoil|ramming|grading|hand[\s-]?trim)/i;

// Discipline detection runs strongest-signal-first. The order matters more than
// the patterns do: a "PVC pipe to receive underground cables" is electrical
// containment, not plumbing, and a "fire alarm cable" is fire services, not
// general electrical — so the unambiguous words are tested before the words
// that several disciplines share ("pipe", "cable", "panel").
const FIRE_RE =
  /\b(?:sprinkler|hydrant|hose\s*reel|fire\s*(?:alarm|detect|fight|extinguish|pump|panel|main)|smoke\s*detect|heat\s*detect|break\s*glass|sounder|wet\s*riser|dry\s*riser|suppression)/;

// Sanitary fittings and drainage — words no other discipline uses.
const PLUMBING_STRONG_RE =
  /\b(?:soil\s*(?:pipe|stack)|waste\s*pipe|vent\s*pipe|water\s*closet|w\.?c\.?\s|wash\s*hand\s*basin|\bwhb\b|urinal|bidet|bath\s*tub|shower|sanitary|plumb|gully|septic|soak\s*away|inspection\s*chamber|overhead\s*tank|borehole|water\s*heater|\bcistern\b|\bwaste\s*fitting)/;

const MECHANICAL_RE =
  /\b(?:duct(?:work|ing)?|air\s*condition|\bhvac\b|\bahu\b|\bfcu\b|chiller|split\s*unit|\bvrf\b|\bvrv\b|extract(?:or)?\s*fan|ventilat|grille|diffuser|damper|refrigerant|\blift\b|elevator|escalator|compressor|boiler|mechanical)/;

const ELECTRICAL_RE =
  // "earthing" must stay word-bounded: without it "earthwork support" — an
  // excavation line — classifies as electrical and gets a services build-up.
  /\b(?:cable|conduit|switchgear|switchboard|switch\s*socket|socket|luminaire|light\s*fitting|lighting|distribution\s*board|\bdb\b|earthing\b|earth\s*(?:rod|pit|bar|mat|electrode)|transformer|generator|\bats\b|busbar|trunking|panel\s*board|\bmccb\b|\bmcb\b|\brcbo\b|\bkva\b|\bkv\b|isolator|contactor|fibre|fiber|solar|inverter|lightning\s*(?:arrest|protect)|pvc\/swa|\bxlpe\b|armoured|electric)/;

// Generic pipework with no other signal — plumbing by default.
const PIPE_RE = /\b(?:pipe|pipework|\bppr\b|\bupvc\b|valve|\bpump\b|water\s*tank)/;

// Bill sheets in real MEP workbooks are named in shorthand — "Elect", "Mech",
// "E I", "P-M I", "P&M", "EL", "ELEC". The sheet name becomes the category, and
// for a line like "25mm dia." it is the only clue there is.
const SECTION_DISCIPLINE = [
  [/^(?:elec|elect|electrical|e\.?\s*i\.?|e\.?\s*l\.?|el|ee)\b/, "electrical"],
  [/^(?:mech|mechanical|m\.?\s*i\.?|p\s*[-&]?\s*m|p\s*&\s*m|hvac)\b/, "mechanical"],
  [/^(?:plumb|plumbing|sanitary|public\s*health|p\.?\s*h\.?)\b/, "plumbing"],
  [/^(?:fire|fire\s*(?:services|fighting|protection))\b/, "fire"],
];

/** Discipline named by the bill sheet / category / trade, or null. */
function disciplineFromSection(item) {
  for (const raw of [item?.category, item?.trade]) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) continue;
    // Multi-sheet imports scope categories as "Elect · Power Cables".
    for (const part of s.split(/[·|>/-]/)) {
      const p = part.trim();
      if (!p) continue;
      for (const [re, discipline] of SECTION_DISCIPLINE) {
        if (re.test(p)) return discipline;
      }
    }
  }
  return null;
}

/** Discipline of a services item, or null when it is not a services item. */
export function mepDiscipline(item) {
  const t = classifyText(item);
  if (!t.trim()) return null;

  if (FIRE_RE.test(t)) return "fire";
  if (PLUMBING_STRONG_RE.test(t)) return "plumbing";
  if (MECHANICAL_RE.test(t)) return "mechanical";
  if (ELECTRICAL_RE.test(t)) return "electrical";

  // The sheet the line came from outranks a bare "pipe": in an electrical bill
  // a PVC pipe is cable containment, not plumbing.
  const section = disciplineFromSection(item);
  if (section) return section;

  return PIPE_RE.test(t) ? "plumbing" : null;
}

// Supply-dominated builder's work the reference QS schedules budget as a share
// of the bill rate rather than a factor decomposition.
const LUMPSUM_SUPPLY_RE =
  /\bdoor|\bwindow|\bceiling|wardrobe|cabinet|kitchen|furniture|fitting|balustrade|railing|handrail|\bgate\b|curtain\s*wall|burglar|cladding|rafter|purlin|king\s*post|wall\s*plate|noggin|tie\s*beam|\bstrut|fascia/i;

/**
 * Classify a bill line into the branch that knows how to break it down.
 * Returns one of: mep-<discipline>, labour-only, blinding, concrete, blockwork,
 * formwork, rebar, tiling, render, screed, pop, pop-ceiling, paint, dpm, felt,
 * mesh, roof-covering, soil-poison, fill, lumpsum, unknown.
 */
export function classifyWork(item, K = null) {
  const unit = K ? measureBasis(item, K).unit : normalizeUnit(item?.unit);
  const text = lineText(item);

  const mep = mepDiscipline(item);
  if (mep) return `mep-${mep}`;

  if (LABOUR_ONLY_RE.test(text)) return "labour-only";

  // ── area finishes (before the structural branches) ──
  if (unit === "m2") {
    if (has(text, "ceiling") && has(text, "pop", "p.o.p", "plaster of paris", "gypsum", "board"))
      return "pop-ceiling";
    if (
      has(text, "felt", "scudoplast") ||
      (has(text, "waterproof") && !has(text, "sheeting", "micron"))
    )
      return "felt";
    if (has(text, "pop", "p.o.p", "plaster of paris")) return "pop";
    if (has(text, "tile", "tiling")) return "tiling";
    if (has(text, "render", "plaster")) return "render";
    if (has(text, "screed")) return "screed";
    if (has(text, "paint", "emulsion", "gloss")) return "paint";
    if (
      has(text, "dpm", "damp proof", "damp-proof", "polythene", "membrane") ||
      (has(text, "waterproof") && has(text, "sheeting", "micron"))
    )
      return "dpm";
    if (has(text, "poison", "termite", "dieldr")) return "soil-poison";
    if (has(text, "brc", "mesh", "a142")) return "mesh";
    if (has(text, "roof") && has(text, "covering", "sheet", "longspan", "aluminium", "aluminum"))
      return "roof-covering";
  }

  // ── volume ──
  if (unit === "m3") {
    if (!has(text, "backfill", "back fill")) {
      if (has(text, "hardcore", "laterite", "sand fill", "filling")) return "fill";
    }
    // An explicit mix ratio wins: "blinding 1:4:8" is a real mix, not the
    // simplified bags/m³ shortcut.
    if (has(text, "blinding", "lean concrete", "lean mix", "blind"))
      return parseMixRatio(text) ? "concrete" : "blinding";
    if (
      has(text, "concrete", "rcc", "r.c.c", "reinforced", "in-situ", "insitu", "slab",
        "beam", "column", "base", "footing", "foundation", "stair")
    )
      return "concrete";
  }

  // ── structural area work ──
  if (unit === "m2") {
    if (has(text, "formwork", "shutter", "shuttering", "form work", "soffit", "mould", "mold"))
      return "formwork";
    if (has(text, "block", "blockwork", "masonry", "walling", "sandcrete")) return "blockwork";
  }

  // Blockwork billed as "150mm thick wall" — the word "blockwork" is in the
  // preamble the parser did not reach, but a stated wall thickness is signature
  // enough (finishes were all tested above, so this cannot swallow rendering).
  if (unit === "m2" && /\b\d{2,3}\s*mm\s*(?:thick\s*)?wall\b/.test(text)) return "blockwork";

  // ── weight ──
  // Fabricated steelwork before reinforcement: an "angle cleat" is a section
  // with bolts and welding behind it, not a bar with binding wire.
  if (
    (unit === "kg" || unit === "ton") &&
    has(text, "angle", "cleat", "gusset", "guzzet", "channel", "purlin", "rafter",
      "universal beam", "universal column", "\bub\b", "\buc\b", "hollow section",
      "\brhs\b", "\bshs\b", "\bchs\b", "base plate", "steelwork", "truss", "bracing")
  )
    return "steelwork";

  // Bills state reinforcement by diameter under a "Reinforcement; high yield
  // bars to BS4449" preamble — an item can read only "10 - 25 diameter".
  if (
    (unit === "kg" || unit === "ton") &&
    has(text, "rebar", "reinforc", "steel", "bar", "y12", "y16", "r10", "mesh",
      "brc", "diameter", "dia.", "high yield", "high tensile", "bs4449")
  )
    return "rebar";

  if (LUMPSUM_SUPPLY_RE.test(text)) return "lumpsum";

  return "unknown";
}

/** "grade 25 (1:2:4) concrete" → {c:1,s:2,g:4}; null when absent. */
function parseMixRatio(text) {
  const m = /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(text || "");
  if (!m) return null;
  const [c, s, g] = [m[1], m[2], m[3]].map(Number);
  if (!(c > 0 && s > 0 && g > 0)) return null;
  return { c, s, g };
}

// ── material derivation (the constants engine) ──────────────────────────────

/**
 * The materials behind one bill line, as [{ name, qty, unit }].
 * Quantities only — pricing happens later so the same list can be priced from
 * the RateGen library or left for the QS to rate.
 */
export function deriveMaterials(item, kind, K) {
  // Materials are derived on the MEASURED basis, which for a narrow-width item
  // is the area recovered from its girth, not the metres it was billed in.
  const basis = measureBasis(item, K);
  const qty = basis.qty;
  if (qty <= 0) return [];
  const text = lineText(item);
  const out = [];
  const add = (name, q, unit) => {
    if (num(q) > 0) out.push({ name, qty: round(q), unit });
  };

  switch (kind) {
    case "concrete": {
      // Wet → dry volume (the 1.54 factor) is what makes 1:2:4 come out at the
      // ~6 bags/m³ every Nigerian QS schedule uses. Omitting it — as the
      // plugin's original formula did — under-orders cement by a third.
      const mix = parseMixRatio(text) || { c: 1, s: 2, g: 4 };
      const total = mix.c + mix.s + mix.g;
      const dry = K.get(MC.ConcreteDryVolumeFactor, 1.54);
      const waste = K.get(MC.ConcreteWaste);
      const bagKg = K.get(MC.CementBagWeightKg);
      const cementKgPerM3 = K.get(MC.ConcreteCementKgPerM3);
      const sandKgPerM3 = K.get(MC.ConcreteSandKgPerM3);
      const gravelMult = K.get(MC.ConcreteGravelMultiplier);
      if (total <= 0 || bagKg <= 0) break;

      const cementPerM3 = ((mix.c / total) * dry * waste * cementKgPerM3) / bagKg;
      const sandPerM3 = ((mix.s / total) * dry * waste * sandKgPerM3) / 1000;
      const gravelPerM3 = sandPerM3 * gravelMult;
      add("Cement", cementPerM3 * qty, "bags");
      add("Sharp sand", sandPerM3 * qty, "tons");
      add("Granite", gravelPerM3 * qty, "tons");
      break;
    }
    case "blinding": {
      const waste = K.get(MC.BlindingWaste);
      add("Cement", qty * waste * K.get(MC.BlindingCementBagsPerM3), "bags");
      add("Sharp sand", qty * waste * K.get(MC.BlindingSandTonsPerM3), "tons");
      break;
    }
    case "blockwork": {
      add("Blocks", qty * K.get(MC.BlockWaste) * K.get(MC.BlocksPerSqm), "nr");
      add("Cement", qty * K.get(MC.BlockCementBagsPerSqm), "bags");
      add("Sharp sand", qty * K.get(MC.BlockSandTonsPerSqm), "tons");
      break;
    }
    case "formwork": {
      const perSheet = K.get(MC.FormworkBoardAreaPerSheet);
      const sheets = perSheet > 0 ? qty / perSheet : 0;
      add("Formwork board", sheets, "sheets");
      add("Bracing timber", sheets * K.get(MC.FormworkBraceFactor), "m");
      add("Nails", sheets * K.get(MC.FormworkNailsBagsPerSheet), "bags");
      break;
    }
    case "rebar": {
      const unit = basis.unit;
      const steelKg = unit === "ton" ? qty * 1000 : qty;
      add("Reinforcement steel", qty, unit === "ton" ? "tons" : "kg");
      add("Binding wire", steelKg * K.get(MC.RebarBindingWireFactor), "kg");
      break;
    }
    case "steelwork": {
      // Fabricated sections carry their connections with them: bolts, welding
      // consumables and a protective coat are never measured separately but
      // are always bought. Factors are per tonne of steel.
      const unit = basis.unit;
      const tons = unit === "ton" ? qty : qty / 1000;
      add("Steel sections", qty, unit === "ton" ? "tons" : "kg");
      add("Bolts, nuts and washers", tons * K.get(MC.SteelBoltsKgPerTon), "kg");
      add("Welding electrodes", tons * K.get(MC.SteelWeldingKgPerTon), "kg");
      add("Primer / protective paint", tons * K.get(MC.SteelPrimerLitresPerTon), "litres");
      break;
    }
    case "tiling": {
      add(has(text, "wall") ? "Wall tiles" : "Floor tiles", qty * K.get(MC.TileM2PerM2), "m2");
      add("Cement", qty * K.get(MC.TileCementBagsPerM2), "bags");
      add("Sharp sand", qty * K.get(MC.TileSandTonsPerM2), "tons");
      add("White cement", qty * K.get(MC.TileWhiteCementBagsPerM2), "bags");
      break;
    }
    case "render": {
      add("Cement", qty * K.get(MC.RenderCementBagsPerM2), "bags");
      add("Plaster sand", qty * K.get(MC.RenderSandTonsPerM2), "tons");
      break;
    }
    case "screed": {
      add("Cement", qty * K.get(MC.ScreedCementBagsPerM2), "bags");
      add("Sharp sand", qty * K.get(MC.ScreedSandTonsPerM2), "tons");
      break;
    }
    case "pop": {
      add("Cement", qty * K.get(MC.PopCementBagsPerM2), "bags");
      add("POP paint", qty * K.get(MC.PopPaintDrumsPerM2), "drums");
      add("POP glue (Top Bond)", qty * K.get(MC.PopGlueNrPerM2), "nr");
      break;
    }
    case "pop-ceiling": {
      const perBoard = K.get(MC.CeilingPopBoardFactor);
      if (perBoard > 0) add("POP ceiling boards", Math.ceil((qty * 1.3) / perBoard), "nr");
      break;
    }
    case "paint": {
      add("Emulsion paint", qty * K.get(MC.PaintDrumsPerM2), "drums");
      break;
    }
    case "dpm": {
      const perRoll = K.get(MC.DpmAreaPerRoll);
      if (perRoll > 0) add("DPM", Math.ceil(qty / perRoll), "rolls");
      break;
    }
    case "felt": {
      const perRoll = K.get(MC.WaterproofFeltAreaPerRoll);
      if (perRoll > 0) add("Waterproofing felt", Math.ceil(qty / perRoll), "rolls");
      break;
    }
    case "mesh": {
      const perRoll = K.get(MC.MeshAreaPerRoll);
      if (perRoll > 0) add("BRC mesh", Math.ceil(qty / perRoll), "rolls");
      break;
    }
    case "roof-covering": {
      add("Roofing sheet", qty * K.get(MC.RoofSheetM2PerM2), "m2");
      break;
    }
    case "soil-poison": {
      const cover = K.get(MC.SoilPoisonAreaPerUnit);
      if (cover > 0) add("Soil poison chemical", Math.ceil(qty / cover), "nr");
      break;
    }
    case "fill": {
      const tons = qty * K.get(MC.FillingTonsPerM3);
      const name = has(text, "hardcore")
        ? "Hardcore"
        : has(text, "laterite")
          ? "Laterite"
          : "Sharp sand";
      add(name, tons, "tons");
      break;
    }
    default:
      break;
  }
  return out;
}

/**
 * The constants labour rate per bill unit for a work kind, or 0 when the kind
 * has no labour constant (services and lumpsum items are priced by share).
 */
/**
 * The constants labour rate for a work kind, PER MEASURED UNIT (per m² of
 * formwork, per m³ of concrete). The caller scales it to the bill unit — see
 * measureBasis — so a narrow-width item billed per metre gets rate × girth.
 */
export function labourRateFor(item, kind, K) {
  const text = lineText(item);
  const unit = measureBasis(item, K).unit;
  switch (kind) {
    case "concrete":
      return K.get(MC.LabourConcretePerM3);
    case "blinding":
      return K.get(MC.LabourBlindingPerM3);
    case "blockwork":
      return K.get(MC.LabourBlockworkPerM2);
    case "formwork":
      return K.get(MC.LabourFormworkPerM2);
    case "rebar": {
      const perTon = K.get(MC.LabourRebarPerTon);
      return unit === "kg" ? perTon / 1000 : perTon;
    }
    case "steelwork": {
      const perTon = K.get(MC.LabourSteelworkPerTon);
      return unit === "kg" ? perTon / 1000 : perTon;
    }
    case "tiling":
      return has(text, "wall") ? K.get(MC.LabourWallTilingPerM2) : K.get(MC.LabourTilingPerM2);
    case "render":
      return K.get(MC.LabourRenderPerM2);
    case "screed":
      return K.get(MC.LabourScreedPerM2);
    case "pop":
      return K.get(MC.LabourPopPerM2);
    case "pop-ceiling":
      return K.get(MC.LabourCeilingPopPerM2);
    case "paint":
      return K.get(MC.LabourPaintingPerM2);
    case "dpm":
      return K.get(MC.LabourDpmPerM2);
    case "felt":
      return K.get(MC.LabourWaterproofingPerM2);
    case "mesh":
      return K.get(MC.LabourBrcPerM2);
    case "roof-covering":
      return K.get(MC.LabourRoofCoveringPerM2);
    case "soil-poison":
      return K.get(MC.LabourSoilPoisonPerM2);
    case "fill":
      return K.get(MC.LabourFillingPerM3);
    case "labour-only":
      return has(text, "backfill", "back fill", "disposal", "dispose", "cart away")
        ? K.get(MC.LabourBackfillPerM3)
        : K.get(MC.LabourExcavationPerM3);
    default:
      return 0;
  }
}

// ── share-based branches (services + supply-dominated work) ─────────────────

const MEP_SHARE_KEYS = {
  electrical: [MC.MepElectricalMaterialShare, MC.MepElectricalLabourShare, MC.MepElectricalAccessoryShare],
  mechanical: [MC.MepMechanicalMaterialShare, MC.MepMechanicalLabourShare, MC.MepMechanicalAccessoryShare],
  plumbing: [MC.MepPlumbingMaterialShare, MC.MepPlumbingLabourShare, MC.MepPlumbingAccessoryShare],
  fire: [MC.MepFireMaterialShare, MC.MepFireLabourShare, MC.MepFireAccessoryShare],
};

const DISCIPLINE_LABEL = {
  electrical: "Electrical",
  mechanical: "Mechanical",
  plumbing: "Plumbing",
  fire: "Fire services",
};

// "Supply and install 4C. 70mm PVC/SWA/PVC Copper Cable" → the material is the
// cable; strip the verb so the schedule reads as a resource, not an instruction.
function supplyItemName(item) {
  return (
    String(item?.description || item?.takeoffLine || "Material")
      .replace(/\[[^\]]*\]/g, "")
      .replace(
        /^\s*(?:supply(?:\s*,?\s*(?:deliver\w*|install\w*|fix\w*|lay\w*|and|&))*|install\w*|provide|allow\s+for)\s+/i,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "Material"
  );
}

/**
 * A services bill line, broken down through the SAME engine the measured MEP
 * workflow uses (computeServiceBuildup): whole stock lengths, connectors per
 * joint, fittings uplift — driven by the firm's per-type Services Constants.
 *
 * The one thing an imported bill lacks is a resolvable price: "4C. 70mm
 * PVC/SWA/PVC Copper Cable" will not be in the RateGen library under that name.
 * So when the library is silent the rate falls back to a SHARE of the bill rate
 * (the MEP – Cost Split constants). Bundling is then skipped on purpose: the
 * bill rate already prices a delivered, installed metre, so charging stock-length
 * waste on top of it would double-count.
 */
function deriveServiceRows(item, discipline, K, opts) {
  const qty = num(item?.qty);
  const rate = num(item?.rate);
  const unit = String(item?.unit || "").trim();
  const name = supplyItemName(item);

  const [mKey, lKey, aKey] = MEP_SHARE_KEYS[discipline] || MEP_SHARE_KEYS.electrical;
  const [mShare, lShare, aShare] = [K.get(mKey), K.get(lKey), K.get(aKey)];

  const type = mapServiceType(item);
  const c =
    opts.serviceConstants?.[type] || SERVICE_TYPE_DEFAULTS[type] || SERVICE_TYPE_DEFAULTS.pipe;

  const libMaterial = num(opts.serviceRateFor?.material?.(name));
  const libLabour = num(opts.serviceRateFor?.labour?.(name));
  const priced = libMaterial > 0;

  const buildup = computeServiceBuildup({
    measure: c.measure || "length",
    qty,
    unit: unit || c.unit,
    description: name,
    constants: {
      // Only bundle into stock lengths when a genuine per-metre library price
      // was found; a bill-rate share is already a delivered rate.
      standardLength: priced ? c.standardLength : 0,
      connectorRule: priced ? c.connectorRule : "none",
      connectorsPerJoint: c.connectorsPerJoint,
      fittingUpliftPercent: priced ? c.fittingUpliftPercent : 0,
    },
    rates: {
      materialRate: priced ? libMaterial : rate * mShare,
      labourRate: libLabour > 0 ? libLabour : rate * lShare,
      connectorRate: priced ? num(opts.serviceRateFor?.material?.("connector")) : 0,
    },
  });

  const rows = buildup.lines.map((l) => ({
    kind: l.componentKind,
    name:
      l.componentKind === "Labour" && l.description === "Installation"
        ? `${DISCIPLINE_LABEL[discipline] || "Services"} installation`
        : l.description,
    qty: l.qty,
    unit: l.unit,
    rate: l.rate,
  }));

  // Accessories nobody measures — glands, lugs, clips, saddles, tape. Carried
  // as a share only in the un-priced path; the priced path expresses the same
  // idea through the type's fittings uplift.
  if (!priced && aShare > 0 && rate > 0) {
    rows.push({
      kind: "Consumable",
      name: "Accessories, fixings and sundries",
      qty,
      unit,
      rate: rate * aShare,
    });
  }

  // Nothing resolved and nothing billed: still give the QS the two rows to
  // price, rather than leaving the line bare.
  if (!rows.length) {
    rows.push({ kind: "Material", name, qty, unit, rate: 0 });
    rows.push({
      kind: "Labour",
      name: `${DISCIPLINE_LABEL[discipline] || "Services"} installation`,
      qty,
      unit,
      rate: 0,
    });
  }
  return rows;
}

/**
 * Supply-dominated builder's work — doors, windows, ceilings, railings, roof
 * members. The reference QS schedules budget these as shares of the bill rate
 * (0.70 material / 0.15 labour) rather than decomposing them.
 */
function deriveLumpsumRows(item, K) {
  const qty = num(item?.qty);
  const rate = num(item?.rate);
  const unit = String(item?.unit || "").trim();
  const text = lineText(item);
  const mShare = has(text, "ceiling")
    ? K.get(MC.LumpsumCeilingMaterialShare)
    : K.get(MC.LumpsumMaterialShare);
  return [
    { kind: "Material", name: supplyItemName(item), qty, unit, rate: rate * mShare },
    { kind: "Labour", name: "Fixing labour", qty, unit, rate: rate * K.get(MC.LumpsumLabourShare) },
  ];
}

// ── the generator ───────────────────────────────────────────────────────────

// Deterministic sn for a generated row so the QS's pricing and procurement
// edits survive a re-generation (they merge on sn|name|unit|kind). Sits in its
// own band, clear of budgetCoverage's synthetic rows at 900,000,000+.
function generatedSn(code, index) {
  let h = 0;
  const s = String(code || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 1000000;
  return 800000000 + h * 64 + Math.min(index, 63);
}

/** Rows this module generated on a previous run — replaceable, unlike real ones. */
export function isGeneratedRow(b) {
  const sn = num(b?.sn);
  return b?.rateSource === GENERATED_SOURCE || (sn >= 800000000 && sn < 900000000);
}

export const GENERATED_SOURCE = "ml-schedule";

/**
 * Build the Material & Labour schedule for a bill.
 *
 * @param {object[]} items        bill lines (need code, description, unit, qty, rate)
 * @param {object[]} budgetItems  existing budget rows — real ones are never touched
 * @param {object}   K            resolved constants (see resolveConstants)
 * @param {object}   [opts]
 * @param {(name:string,unit:string)=>number} [opts.priceFor]  material price lookup
 * @param {object} [opts.serviceConstants]  per-type Services Constants (getMergedConstants().types)
 * @param {{material?:(n:string)=>number,labour?:(n:string)=>number}} [opts.serviceRateFor]
 * @returns {{ budgetItems: object[], generated: number, covered: number, warnings: string[] }}
 */
export function generateMlSchedule(items, budgetItems, K, opts = {}) {
  const bill = Array.isArray(items) ? items : [];
  const existing = Array.isArray(budgetItems) ? budgetItems : [];
  const priceFor = typeof opts.priceFor === "function" ? opts.priceFor : () => 0;

  // Bill lines that already have a REAL build-up (from a Material & Labour
  // sheet in the workbook, or priced by the QS) keep it. Only lines with
  // nothing — or with nothing but our own previous output — are (re)generated.
  const realByCode = new Set();
  for (const b of existing) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (code && !isGeneratedRow(b)) realByCode.add(code);
  }

  // Preserve pricing / procurement edits the QS made on generated rows.
  const editKey = (b) =>
    [b?.billIdentity, b?.materialName || b?.description, b?.unit, b?.componentKind]
      .map((v) => String(v || "").trim().toLowerCase())
      .join("|");
  const priorEdits = new Map();
  for (const b of existing) {
    if (isGeneratedRow(b)) priorEdits.set(editKey(b), b);
  }

  const out = existing.filter((b) => !isGeneratedRow(b));
  const warnings = [];
  let generated = 0;
  let covered = 0;
  let underPriced = 0;

  for (const item of bill) {
    const code = String(item?.code || "").trim();
    const qty = num(item?.qty);
    if (!code || qty <= 0) continue;
    if (realByCode.has(code.toLowerCase())) continue;

    const kind = classifyWork(item, K);
    if (kind === "unknown") continue;

    const rate = num(item?.rate);
    const rows = [];

    if (kind.startsWith("mep-")) {
      for (const r of deriveServiceRows(item, kind.slice(4), K, opts)) rows.push(r);
    } else if (kind === "lumpsum") {
      for (const r of deriveLumpsumRows(item, K)) rows.push(r);
    } else {
      for (const m of deriveMaterials(item, kind, K)) {
        rows.push({
          kind: "Material",
          name: m.name,
          qty: m.qty,
          unit: m.unit,
          rate: priceFor(m.name, m.unit),
        });
      }
      // Labour stays on the BILL's quantity and unit so the schedule lines up
      // with the bill; the rate carries the conversion instead (₦1,200/m² of
      // formwork on a 200mm edge billed per metre = ₦240/m).
      const basis = measureBasis(item, K);
      rows.push({
        kind: "Labour",
        name: "Labour",
        qty,
        unit: String(item?.unit || "").trim(),
        rate: labourRateFor(item, kind, K) * basis.factor,
      });
    }

    if (!rows.length) continue;

    // ── reconcile to the bill ──
    // net = what the build-up costs. The bill rate is the sell price. The gap
    // between them IS the overhead and profit, so back-solving it keeps the
    // bill total exactly as the QS wrote it once deriveBillRatesFromBudget
    // recomputes each rate from this build-up.
    const net = rows.reduce((a, r) => a + num(r.qty) * num(r.rate), 0);
    const billAmount = rate * qty;
    let overheadPercent = 0;
    let profitPercent = 0;

    if (net > 0 && billAmount > 0) {
      const markupPct = (billAmount / net - 1) * 100;
      if (markupPct >= 0) {
        // Report it the way the Budget tab does: overhead first, then profit.
        overheadPercent = Math.min(markupPct, K.get(MC.MarkupOverheadPercent));
        profitPercent = round(markupPct - overheadPercent, 4);
        overheadPercent = round(overheadPercent, 4);
      } else {
        // The build-up costs MORE than the line was billed at — normal on an
        // older bill priced at older material prices.
        //
        // Leaving the prices on would make deriveBillRatesFromBudget raise this
        // line's rate to cost, quietly inflating a bill the client has already
        // been given. So the quantities stay (they are the deliverable) and the
        // rates come off, which keeps the bill exactly as it was imported. The
        // indicative cost is written to the row's notes so nothing is lost, and
        // the QS is told which lines to look at.
        underPriced += 1;
        for (const r of rows) {
          r.notes = `Indicative cost ₦${Math.round(r.rate).toLocaleString("en-NG")}/${r.unit || "unit"} — above the billed rate, so left unpriced.`;
          r.rate = 0;
        }
      }
    } else if (net > 0) {
      // Unpriced bill line: price it from cost using the markup constants.
      overheadPercent = K.get(MC.MarkupOverheadPercent);
      profitPercent = K.get(MC.MarkupProfitPercent);
    }

    rows.forEach((r, i) => {
      const row = {
        billIdentity: code,
        sn: generatedSn(code, i),
        description: r.name,
        materialName: r.name,
        takeoffLine: String(item?.description || item?.takeoffLine || "").trim(),
        componentKind: r.kind,
        category: String(item?.category || "").trim(),
        trade: String(item?.trade || "").trim(),
        unit: r.unit || "",
        qty: round(r.qty, 3),
        rate: round(r.rate),
        overheadPercent,
        profitPercent,
        rateSource: GENERATED_SOURCE,
        procured: false,
        procuredAt: null,
        procuredPercent: 0,
        targetDate: null,
        supplier: "",
        notes: r.notes || "",
        elementIds: [],
        elementQuantities: [],
      };
      // A price or procurement mark the QS already set on this exact row wins:
      // regenerating the schedule must never wipe their work.
      const prior = priorEdits.get(editKey(row));
      if (prior) {
        if (num(prior.rate) > 0) row.rate = num(prior.rate);
        row.procured = Boolean(prior.procured);
        row.procuredAt = prior.procuredAt ?? null;
        row.procuredPercent = num(prior.procuredPercent);
        row.targetDate = prior.targetDate ?? null;
        row.supplier = prior.supplier || "";
        row.notes = prior.notes || "";
      }
      out.push(row);
      generated += 1;
    });
    covered += 1;
  }

  if (underPriced > 0) {
    warnings.push(
      `${underPriced} bill line(s) cost more at today's prices than they were billed at. Their quantities are scheduled but left unpriced so the bill total is unchanged — see the note on each row in the Budget tab.`,
    );
  }

  return { budgetItems: out, generated, covered, warnings };
}
