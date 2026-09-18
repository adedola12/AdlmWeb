// Turns a duplex model (duplexModel.js) into a complete sample TakeoffProject:
// a measured bill, its material & labour budget, a locked contract, interim
// certificates, variations, a programme with risks and issues, and (for QUIV)
// the IFC models the bill was measured from.
//
// Pure: no database, no network. scripts/seed-sample-projects.mjs writes the
// result.

import { buildDuplex, GROUND_LEVEL, LEVELS } from "./duplexModel.js";
import {
  budgetLinesFor,
  netUnitCost,
  OVERHEAD_PERCENT,
  PROFIT_PERCENT,
} from "./priceBook.js";
import { QUIV_TRADES } from "../../util/boqCategory.js";
import { deriveBillRatesFromBudget } from "../../util/deriveBillRates.js";

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const day = (iso, plus = 0) => {
  const d = new Date(`${iso}T09:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d;
};
const isoDay = (d) => d.toISOString().slice(0, 10);

// Work sections, spelt exactly as util/boqCategory.js QUIV_TRADES has them.
const trade = {
  earth: "Earthworks",
  concrete: "Concrete Works",
  formwork: "Formwork",
  rebar: "Reinforcement",
  masonry: "Masonry",
  damp: "Damp-proofing",
  roof: "Carpentry & Roofing",
  joinery: "Joinery",
  floor: QUIV_TRADES.find((t) => /Floor$/.test(t)),
  wall: QUIV_TRADES.find((t) => /Wall$/.test(t)),
  ceiling: QUIV_TRADES.find((t) => /Ceiling$/.test(t)),
  decoration: "Decoration",
};

// Programme phases. A bill line belongs to exactly one; progress, certificates
// and PM tasks are all expressed per phase.
export const PHASES = [
  { n: 1, name: "Substructure", days: 24, resource: "Groundworks gang" },
  { n: 2, name: "Ground floor frame and blockwork", days: 21, resource: "Concrete and masonry gang" },
  { n: 3, name: "First floor slab, beams and staircase", days: 18, resource: "Concrete gang, carpenters" },
  { n: 4, name: "First floor frame, blockwork and roof beam", days: 21, resource: "Concrete and masonry gang" },
  { n: 5, name: "Roof carpentry and covering", days: 14, resource: "Roofing subcontractor" },
  { n: 6, name: "Doors and windows", days: 12, resource: "Joinery and aluminium fabricator" },
  { n: 7, name: "Finishes (plaster, screed, tiles, POP, paint)", days: 42, resource: "Finishing gangs" },
];

// ── Measured lines ─────────────────────────────────────────────────────────
// Each line: { key, section, category, trade, phase, discipline, unit,
// takeoffLine, quiv, heron, level, type, buildup, elements:[{id,qty}], qty }.
export function measuredLines(model) {
  const E = model.elements;
  const lines = [];
  const pick = (pred, qk, mult = 1) =>
    E.filter(pred)
      .map((e) => ({ id: e.id, qty: r3((Number(e.q[qk]) || 0) * mult) }))
      .filter((x) => x.qty > 0);
  const add = (def) => {
    const elements = def.elements || [];
    const qty = r2(def.qty ?? sum(elements, (x) => x.qty));
    if (!(qty > 0)) return;
    lines.push({ ...def, elements, qty });
  };
  const fnd = LEVELS.foundation;
  const isFnd = (e) => e.level === fnd;
  const fd = model.design.foundation;

  // Substructure ────────────────────────────────────────────────────────────
  const S = { section: "Substructure", category: "Substructure", phase: 1, discipline: "structural", level: fnd };
  add({
    ...S,
    key: "site-clear",
    trade: trade.earth,
    unit: "m2",
    takeoffLine: "Site Preparation",
    quiv: "Site Preparation – Clear site vegetation",
    heron: "Clear site of all bushes, shrubs and undergrowth; grub up roots and cart away",
    buildup: "siteClear",
    type: "Site clearance",
    elements: [{ id: model.groundSlabId, qty: r3((model.W + 6) * (model.D + 6)) }],
  });

  const exc = model.excavation;
  const excKinds = [
    ["trench", "Excavate trenches for foundations, not exceeding 2.00m deep", "Foundations – Excavation (trench)"],
    ["pit", "Excavate pits for bases, not exceeding 2.00m deep", "Foundations – Excavation (pits)"],
    ["bulk", "Excavate to reduce levels for raft, not exceeding 1.50m deep", "Foundations – Excavation (reduced level)"],
  ];
  for (const [kind, heron, quiv] of excKinds) {
    const rows = exc.filter((x) => x.kind === kind);
    add({
      ...S,
      key: `excavate-${kind}`,
      trade: trade.earth,
      unit: "m3",
      takeoffLine: "Excavation",
      quiv,
      heron,
      buildup: "excavate",
      type: "Excavation",
      elements: rows.map((x) => ({ id: x.elementId, qty: r3(x.volume) })),
    });
  }
  add({
    ...S,
    key: "support",
    trade: trade.earth,
    unit: "m2",
    takeoffLine: "Excavation",
    quiv: "Foundations – Earthwork support",
    heron: "Earthwork support to faces of excavation not exceeding 2.00m deep",
    buildup: "support",
    type: "Earthwork support",
    elements: exc.filter((x) => x.supportArea > 0).map((x) => ({ id: x.elementId, qty: r3(x.supportArea) })),
  });
  const excTotal = sum(exc, (x) => x.volume);
  const displaced =
    sum(E.filter((e) => isFnd(e) && e.ifc !== "IfcPile" && e.ifc !== "IfcColumn"), (e) => (e.q.concrete || 0) + (e.q.blinding || 0) + (e.q.belowGround || 0));
  const backfill = Math.max(0, (excTotal - displaced) * 0.85);
  const excIds = [...new Set(exc.map((x) => x.elementId))];
  const spread = (total) => excIds.map((id) => ({ id, qty: r3(total / excIds.length) }));
  if (fd !== "raft") {
    add({
      ...S,
      key: "backfill",
      trade: trade.earth,
      unit: "m3",
      takeoffLine: "Excavation",
      quiv: "Foundations – Backfill with excavated material",
      heron: "Return, fill and ram selected excavated material around foundations",
      buildup: "backfill",
      type: "Backfill",
      elements: spread(backfill),
    });
  }
  add({
    ...S,
    key: "disposal",
    trade: trade.earth,
    unit: "m3",
    takeoffLine: "Excavation",
    quiv: "Foundations – Disposal of surplus excavated material",
    heron: "Remove surplus excavated material from site",
    buildup: "disposal",
    type: "Disposal",
    elements: spread(excTotal - backfill),
  });
  add({
    ...S,
    key: "termite",
    trade: trade.earth,
    unit: "m2",
    takeoffLine: "Foundations",
    quiv: "Foundations – Anti-termite treatment",
    heron: "Anti-termite treatment to bottoms and sides of excavation",
    buildup: "termite",
    type: "Soil treatment",
    elements: pick((e) => isFnd(e) && e.q.blinding > 0, "blinding", 20),
  });
  add({
    ...S,
    key: "blinding",
    trade: trade.concrete,
    unit: "m3",
    takeoffLine: "Foundations",
    quiv: "Foundations – Blinding concrete 50mm (1:3:6)",
    heron: "Plain concrete (1:3:6) 50mm thick blinding under foundations",
    buildup: "blinding",
    type: "Blinding",
    elements: pick((e) => isFnd(e) && e.q.blinding > 0, "blinding"),
  });

  if (fd === "pile") {
    const piles = (e) => e.ifc === "IfcPile";
    add({ ...S, key: "pile-bore", trade: trade.concrete, unit: "m", takeoffLine: "Piles", quiv: "Piles – Bored 450mm dia", heron: "Bore for 450mm diameter cast in-situ pile, maximum depth 15m", buildup: "pileBore", type: "Bored Cast In-Situ Pile 450 dia", elements: pick(piles, "boredLength") });
    add({ ...S, key: "pile-concrete", trade: trade.concrete, unit: "m3", takeoffLine: "Piles", quiv: "Piles – Concrete Grade 30", heron: "Reinforced concrete (1:1:2) grade 30 in bored piles, placed by tremie", buildup: "concrete30", type: "Bored Cast In-Situ Pile 450 dia", elements: pick(piles, "concrete") });
    add({ ...S, key: "pile-rebar", trade: trade.rebar, unit: "kg", takeoffLine: "Piles", quiv: "Piles – Reinforcement", heron: "High yield reinforcement cages to bored piles", buildup: "rebar", type: "Bored Cast In-Situ Pile 450 dia", elements: pick(piles, "rebar") });
    add({ ...S, key: "pile-cut", trade: trade.concrete, unit: "nr", takeoffLine: "Piles", quiv: "Piles – Cut off pile heads", heron: "Cut off top of pile to cut-off level, trim and bend reinforcement", buildup: "pileCut", type: "Bored Cast In-Situ Pile 450 dia", elements: pick(piles, "count") });
  }

  const footing = (e) =>
    isFnd(e) && (e.ifc === "IfcFooting" || (e.ifc === "IfcSlab" && e.predefined === "BASESLAB"));
  const fType = {
    strip: ["Strip footings", "in strip foundations"],
    "pad-strip": ["Pad and strip footings", "in pad and strip foundations"],
    raft: ["Raft", "in raft foundation slab and thickened edges"],
    pile: ["Pile caps", "in pile caps"],
  }[fd];
  add({ ...S, key: "fnd-concrete", trade: trade.concrete, unit: "m3", takeoffLine: "Foundations", quiv: `${fType[0]} – Concrete Grade 25`, heron: `Reinforced concrete (1:1.5:3) grade 25 ${fType[1]}`, buildup: "concrete25", type: fType[0], elements: pick(footing, "concrete") });
  add({ ...S, key: "fnd-rebar", trade: trade.rebar, unit: "kg", takeoffLine: "Foundations", quiv: `${fType[0]} – Reinforcement`, heron: `High yield reinforcement ${fType[1]}`, buildup: "rebar", type: fType[0], elements: pick(footing, "rebar") });
  add({ ...S, key: "fnd-formwork", trade: trade.formwork, unit: "m2", takeoffLine: "Foundations", quiv: `${fType[0]} – Formwork`, heron: `Formwork to sides ${fType[1]}`, buildup: "formwork", type: fType[0], elements: pick(footing, "formwork") });

  if (fd === "pile") {
    const gb = (e) => isFnd(e) && e.ifc === "IfcBeam";
    add({ ...S, key: "gb-concrete", trade: trade.concrete, unit: "m3", takeoffLine: "Ground Beams", quiv: "Ground Beams – Concrete Grade 25", heron: "Reinforced concrete (1:1.5:3) grade 25 in ground beams", buildup: "concrete25", type: "Ground Beam 300 x 600", elements: pick(gb, "concrete") });
    add({ ...S, key: "gb-rebar", trade: trade.rebar, unit: "kg", takeoffLine: "Ground Beams", quiv: "Ground Beams – Reinforcement", heron: "High yield reinforcement in ground beams", buildup: "rebar", type: "Ground Beam 300 x 600", elements: pick(gb, "rebar") });
    add({ ...S, key: "gb-formwork", trade: trade.formwork, unit: "m2", takeoffLine: "Ground Beams", quiv: "Ground Beams – Formwork", heron: "Formwork to sides of ground beams", buildup: "formwork", type: "Ground Beam 300 x 600", elements: pick(gb, "formwork") });
  }

  const stub = (e) => isFnd(e) && e.ifc === "IfcColumn";
  add({ ...S, key: "stub-concrete", trade: trade.concrete, unit: "m3", takeoffLine: "Columns", quiv: "Column Stubs – Concrete Grade 25", heron: "Reinforced concrete (1:1.5:3) grade 25 in column stubs below ground floor", buildup: "concrete25", type: "Concrete Column: 230 x 230 (stub)", elements: pick(stub, "concrete") });
  add({ ...S, key: "stub-rebar", trade: trade.rebar, unit: "kg", takeoffLine: "Columns", quiv: "Column Stubs – Reinforcement", heron: "High yield reinforcement in column stubs", buildup: "rebar", type: "Concrete Column: 230 x 230 (stub)", elements: pick(stub, "rebar") });
  add({ ...S, key: "stub-formwork", trade: trade.formwork, unit: "m2", takeoffLine: "Columns", quiv: "Column Stubs – Formwork", heron: "Formwork to sides of column stubs", buildup: "formwork", type: "Concrete Column: 230 x 230 (stub)", elements: pick(stub, "formwork") });

  const subWall = (e) => isFnd(e) && e.ifc === "IfcWall";
  add({ ...S, key: "sub-block", trade: trade.masonry, unit: "m2", takeoffLine: "Walls", quiv: "Substructure Walls – 225mm Sandcrete Blockwork", heron: "225mm sandcrete blockwork in substructure, filled solid with concrete", buildup: "block225", type: "Basic Wall: 225mm Sandcrete Block (substructure)", elements: pick(subWall, "blockArea") });

  const gs = E.find((e) => e.id === model.groundSlabId);
  if (fd !== "pile") {
    const depth = fd === "raft" ? 0.6 : 0.3;
    add({ ...S, key: "hardcore", trade: trade.earth, unit: "m3", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – Laterite/hardcore filling", heron: `Laterite filling ${Math.round(depth * 1000)}mm thick under ground floor bed, compacted in layers`, buildup: "hardcore", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.area * depth) }] });
    add({ ...S, key: "dpm", trade: trade.damp, unit: "m2", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – DPM", heron: "1000 gauge polythene damp proof membrane under ground floor bed", buildup: "dpm", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.area) }] });
    add({ ...S, key: "gs-brc", trade: trade.rebar, unit: "m2", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – BRC mesh A142", heron: "BRC fabric reinforcement A142 in ground floor bed", buildup: "brc", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.area) }] });
  } else {
    add({ ...S, key: "gs-rebar", trade: trade.rebar, unit: "kg", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – Reinforcement", heron: "High yield reinforcement in suspended ground floor slab", buildup: "rebar", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.rebar) }] });
    add({ ...S, key: "gs-formwork", trade: trade.formwork, unit: "m2", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – Formwork (soffit)", heron: "Formwork to soffit of suspended ground floor slab", buildup: "formwork", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.formwork) }] });
  }
  add({ ...S, key: "gs-concrete", trade: trade.concrete, unit: "m3", takeoffLine: "Ground Floor Slab", quiv: "Ground Floor Slab – Concrete 150mm", heron: "Concrete (1:2:4) 150mm thick ground floor slab", buildup: "concrete20", type: gs.typeName, elements: [{ id: gs.id, qty: r3(gs.q.concrete) }] });

  // Frame ──────────────────────────────────────────────────────────────────
  const F = { section: "Frame", category: "Frames", discipline: "structural" };
  const floorPhase = { [LEVELS.ground]: 2, [LEVELS.first]: 4 };
  for (const lvl of [LEVELS.ground, LEVELS.first]) {
    const col = (e) => e.level === lvl && e.ifc === "IfcColumn";
    const tag = lvl === LEVELS.ground ? "gf" : "ff";
    const base = { ...F, phase: floorPhase[lvl], level: lvl, takeoffLine: "Columns", type: "Concrete Column: 230 x 230" };
    add({ ...base, key: `col-concrete-${tag}`, trade: trade.concrete, unit: "m3", quiv: "Columns – Concrete Grade 25", heron: `Reinforced concrete (1:1.5:3) grade 25 in columns (${lvl.toLowerCase()})`, buildup: "concrete25", elements: pick(col, "concrete") });
    add({ ...base, key: `col-rebar-${tag}`, trade: trade.rebar, unit: "kg", quiv: "Columns – Reinforcement", heron: `High yield reinforcement in columns (${lvl.toLowerCase()})`, buildup: "rebar", elements: pick(col, "rebar") });
    add({ ...base, key: `col-formwork-${tag}`, trade: trade.formwork, unit: "m2", quiv: "Columns – Formwork", heron: `Formwork to sides of columns (${lvl.toLowerCase()})`, buildup: "formwork", elements: pick(col, "formwork") });

    const lin = (e) => e.level === lvl && e.predefined === "LINTEL";
    const lbase = { ...F, phase: floorPhase[lvl], level: lvl, takeoffLine: "Lintels", type: "Concrete Lintel" };
    add({ ...lbase, key: `lintel-concrete-${tag}`, trade: trade.concrete, unit: "m3", quiv: "Lintels – Concrete Grade 20", heron: `Reinforced concrete (1:2:4) in lintels over openings (${lvl.toLowerCase()})`, buildup: "concrete20", elements: pick(lin, "concrete") });
    add({ ...lbase, key: `lintel-rebar-${tag}`, trade: trade.rebar, unit: "kg", quiv: "Lintels – Reinforcement", heron: `High yield reinforcement in lintels (${lvl.toLowerCase()})`, buildup: "rebar", elements: pick(lin, "rebar") });
    add({ ...lbase, key: `lintel-formwork-${tag}`, trade: trade.formwork, unit: "m2", quiv: "Lintels – Formwork", heron: `Formwork to soffits and sides of lintels (${lvl.toLowerCase()})`, buildup: "formwork", elements: pick(lin, "formwork") });
  }
  for (const [lvl, phase, tag, label] of [
    [LEVELS.first, 3, "ff", "Beams"],
    [LEVELS.roof, 4, "roof", "Roof Beams"],
  ]) {
    const bm = (e) => e.level === lvl && e.ifc === "IfcBeam" && e.predefined !== "LINTEL";
    const base = { ...F, phase, level: lvl, takeoffLine: label, type: lvl === LEVELS.roof ? "Concrete Beam: 230 x 450 (roof)" : "Concrete Beam: 230 x 450" };
    add({ ...base, key: `beam-concrete-${tag}`, trade: trade.concrete, unit: "m3", quiv: `${label} – Concrete Grade 25`, heron: `Reinforced concrete (1:1.5:3) grade 25 in ${label.toLowerCase()}`, buildup: "concrete25", elements: pick(bm, "concrete") });
    add({ ...base, key: `beam-rebar-${tag}`, trade: trade.rebar, unit: "kg", quiv: `${label} – Reinforcement`, heron: `High yield reinforcement in ${label.toLowerCase()}`, buildup: "rebar", elements: pick(bm, "rebar") });
    add({ ...base, key: `beam-formwork-${tag}`, trade: trade.formwork, unit: "m2", quiv: `${label} – Formwork`, heron: `Formwork to soffits and sides of ${label.toLowerCase()}`, buildup: "formwork", elements: pick(bm, "formwork") });
  }
  const fs = (e) => e.id === model.firstSlabId;
  const sbase = { ...F, phase: 3, level: LEVELS.first, takeoffLine: "Floors", type: "Floor: 150mm RC Suspended Slab" };
  add({ ...sbase, key: "slab-concrete", trade: trade.concrete, unit: "m3", quiv: "Floors – Concrete 150mm Grade 25", heron: "Reinforced concrete (1:1.5:3) grade 25 in 150mm first floor slab", buildup: "concrete25", elements: pick(fs, "concrete") });
  add({ ...sbase, key: "slab-rebar", trade: trade.rebar, unit: "kg", quiv: "Floors – Reinforcement", heron: "High yield reinforcement in first floor slab", buildup: "rebar", elements: pick(fs, "rebar") });
  add({ ...sbase, key: "slab-formwork", trade: trade.formwork, unit: "m2", quiv: "Floors – Formwork (soffit)", heron: "Formwork to soffit of first floor slab, height to soffit not exceeding 3.5m", buildup: "formwork", elements: pick(fs, "formwork") });
  const st = (e) => e.ifc === "IfcStair";
  const stbase = { ...F, phase: 3, level: LEVELS.ground, takeoffLine: "Stairs", type: "Cast-In-Place Stair: 1000mm Dog-leg" };
  add({ ...stbase, key: "stair-concrete", trade: trade.concrete, unit: "m3", quiv: "Stairs – Concrete Grade 25", heron: "Reinforced concrete (1:1.5:3) grade 25 in staircase flights and landing", buildup: "concrete25", elements: pick(st, "concrete") });
  add({ ...stbase, key: "stair-rebar", trade: trade.rebar, unit: "kg", quiv: "Stairs – Reinforcement", heron: "High yield reinforcement in staircase", buildup: "rebar", elements: pick(st, "rebar") });
  add({ ...stbase, key: "stair-formwork", trade: trade.formwork, unit: "m2", quiv: "Stairs – Formwork", heron: "Formwork to soffits, risers and strings of staircase", buildup: "formwork", elements: pick(st, "formwork") });

  // Superstructure ─────────────────────────────────────────────────────────
  const A = { category: "Superstructure", discipline: "architectural" };
  for (const lvl of [LEVELS.ground, LEVELS.first]) {
    const tag = lvl === LEVELS.ground ? "gf" : "ff";
    const phase = floorPhase[lvl];
    const wall = (ext) => (e) => e.level === lvl && e.ifc === "IfcWall" && e.q.external === ext;
    add({ ...A, section: "Blockwork", phase, level: lvl, key: `block-ext-${tag}`, trade: trade.masonry, unit: "m2", takeoffLine: "Walls", quiv: "Walls – 225mm Sandcrete Blockwork", heron: `225mm hollow sandcrete blockwork in external walls (${lvl.toLowerCase()})`, buildup: "block225", type: "Basic Wall: 225mm Sandcrete Block (external)", elements: pick(wall(true), "blockArea") });
    add({ ...A, section: "Blockwork", phase, level: lvl, key: `block-int-${tag}`, trade: trade.masonry, unit: "m2", takeoffLine: "Walls", quiv: "Walls – 150mm Sandcrete Blockwork", heron: `150mm hollow sandcrete blockwork in internal partitions (${lvl.toLowerCase()})`, buildup: "block150", type: "Basic Wall: 150mm Sandcrete Block (internal)", elements: pick(wall(false), "blockArea") });
  }
  const gable = (e) => e.ifc === "IfcWall" && e.q.gable;
  add({ ...A, section: "Blockwork", phase: 5, level: LEVELS.roof, key: "block-gable", trade: trade.masonry, unit: "m2", takeoffLine: "Walls", quiv: "Walls – 225mm Gable Blockwork", heron: "225mm sandcrete blockwork in gable walls", buildup: "block225", type: "Basic Wall: 225mm Sandcrete Block (gable)", elements: pick(gable, "blockArea") });

  const roof = (e) => e.id === model.roofId;
  const R = { ...A, section: "Roofing", phase: 5, level: LEVELS.roof, takeoffLine: "Roofs", type: "Basic Roof: 0.55mm Longspan Aluminium" };
  add({ ...R, key: "roof-timber", trade: trade.roof, unit: "m2", quiv: "Roofs – Roof carpentry (treated hardwood)", heron: "Treated hardwood roof carpentry: 50x100 rafters, 50x75 purlins, 50x150 wall plate and ties (measured on slope)", buildup: "roofTimber", elements: pick(roof, "area") });
  add({ ...R, key: "roof-sheet", trade: trade.roof, unit: "m2", quiv: "Roofs – 0.55mm Longspan aluminium covering", heron: "0.55mm longspan aluminium roofing sheets fixed to purlins with self-tapping screws", buildup: "roofSheet", elements: pick(roof, "area") });
  add({ ...R, key: "roof-fascia", trade: trade.roof, unit: "m", quiv: "Roofs – PVC fascia board", heron: "PVC fascia board 250mm deep to eaves and verges", buildup: "fascia", elements: pick(roof, "fascia") });
  add({ ...R, key: "roof-ridge", trade: trade.roof, unit: "m", quiv: "Roofs – Ridge cap", heron: "Aluminium ridge cap to match roofing sheets", buildup: "ridge", elements: pick(roof, "ridge") });

  const J = { ...A, section: "Doors & Windows", phase: 6, level: LEVELS.ground, trade: trade.joinery, unit: "nr" };
  add({ ...J, key: "door-main", takeoffLine: "Doors", quiv: "Doors – Steel security double door 1200x2400", heron: "Supply and fix steel security double door 1200x2400 complete with frame and locks", buildup: "doorMain", type: "Door: Steel Security Double 1200 x 2400", elements: pick((e) => e.kind === "doorMain", "count") });
  add({ ...J, key: "door-kitchen", takeoffLine: "Doors", quiv: "Doors – Steel single door 900x2100", heron: "Supply and fix steel single door 900x2100 to kitchen", buildup: "doorKitchen", type: "Door: Steel Single 900 x 2100", elements: pick((e) => e.kind === "doorKitchen", "count") });
  add({ ...J, key: "door-flush", takeoffLine: "Doors", quiv: "Doors – Flush door 900x2100", heron: "Supply and hang flush door 900x2100 with hardwood frame, lockset and hinges", buildup: "doorFlush", type: "Door: Flush Panel 900 x 2100", elements: pick((e) => e.kind === "doorInternal", "count") });
  add({ ...J, key: "window-12", takeoffLine: "Windows", quiv: "Windows – Aluminium casement 1200x1200", heron: "Supply and fix aluminium casement window 1200x1200 with clear glazing and burglary proof", buildup: "window12", type: "Window: Aluminium Casement 1200 x 1200", elements: pick((e) => e.ifc === "IfcWindow" && e.overall.w < 1.5, "count") });
  add({ ...J, key: "window-18", takeoffLine: "Windows", quiv: "Windows – Aluminium casement 1800x1200", heron: "Supply and fix aluminium casement window 1800x1200 with clear glazing and burglary proof", buildup: "window18", type: "Window: Aluminium Casement 1800 x 1200", elements: pick((e) => e.ifc === "IfcWindow" && e.overall.w >= 1.5, "count") });

  const Fin = { ...A, section: "Finishes", phase: 7 };
  const walls = (e) => e.ifc === "IfcWall" && e.level !== fnd;
  const floorsCov = (e) => e.ifc === "IfcCovering" && e.predefined === "FLOORING";
  const ceilings = (e) => e.ifc === "IfcCovering" && e.predefined === "CEILING";
  add({ ...Fin, level: LEVELS.ground, key: "plaster", trade: trade.wall, unit: "m2", takeoffLine: "Wall Finishes", quiv: "Wall Finishes – 15mm internal plaster", heron: "15mm cement and sand (1:6) plaster to internal walls", buildup: "plaster", type: "Wall finish: Plaster", elements: pick(walls, "internalFace") });
  add({ ...Fin, level: LEVELS.ground, key: "render", trade: trade.wall, unit: "m2", takeoffLine: "Wall Finishes", quiv: "Wall Finishes – 20mm external rendering", heron: "20mm cement and sand (1:4) rendering to external walls", buildup: "render", type: "Wall finish: Render", elements: pick(walls, "externalFace") });
  add({ ...Fin, level: LEVELS.ground, key: "screed", trade: trade.floor, unit: "m2", takeoffLine: "Floor Finishes", quiv: "Floor Finishes – 25mm screed", heron: "25mm cement and sand (1:3) screed to floors", buildup: "screed", type: "Floor Finish: Screed + 600x600 Ceramic Tiles", elements: pick(floorsCov, "area") });
  add({ ...Fin, level: LEVELS.ground, key: "floor-tile", trade: trade.floor, unit: "m2", takeoffLine: "Floor Finishes", quiv: "Floor Finishes – 600x600 ceramic floor tiles", heron: "600x600 ceramic floor tiles bedded in adhesive and grouted", buildup: "floorTile", type: "Floor Finish: Screed + 600x600 Ceramic Tiles", elements: pick(floorsCov, "area") });
  add({ ...Fin, level: LEVELS.ground, key: "skirting", trade: trade.floor, unit: "m", takeoffLine: "Floor Finishes", quiv: "Floor Finishes – 100mm tile skirting", heron: "100mm high ceramic tile skirting", buildup: "skirting", type: "Skirting: Ceramic Tile 100mm", elements: pick(floorsCov, "perimeter") });
  add({ ...Fin, level: LEVELS.ground, key: "wall-tile", trade: trade.wall, unit: "m2", takeoffLine: "Wall Finishes", quiv: "Wall Finishes – 300x600 wall tiles to wet areas", heron: "300x600 ceramic wall tiles to kitchen and bathrooms, full height to 1.8m", buildup: "wallTile", type: "Wall finish: Ceramic Tiles", elements: pick((e) => floorsCov(e) && e.q.wet, "perimeter", 1.8) });
  add({ ...Fin, level: LEVELS.ground, key: "pop", trade: trade.ceiling, unit: "m2", takeoffLine: "Ceiling Finishes", quiv: "Ceiling Finishes – POP ceiling", heron: "Plaster of Paris (POP) plain ceiling on timber brandering", buildup: "pop", type: "Ceiling: POP Plain", elements: pick(ceilings, "area") });
  add({ ...Fin, level: LEVELS.ground, key: "paint-walls", trade: trade.decoration, unit: "m2", takeoffLine: "Painting", quiv: "Painting – Emulsion to walls (3 coats)", heron: "Prepare and apply three coats emulsion paint to plastered walls", buildup: "paint", type: "Paint: Emulsion", elements: pick(walls, "internalFace") });
  add({ ...Fin, level: LEVELS.ground, key: "paint-ceiling", trade: trade.decoration, unit: "m2", takeoffLine: "Painting", quiv: "Painting – Emulsion to ceilings (3 coats)", heron: "Prepare and apply three coats emulsion paint to POP ceilings", buildup: "paint", type: "Paint: Emulsion", elements: pick(ceilings, "area") });
  add({ ...Fin, level: LEVELS.ground, key: "texcote", trade: trade.decoration, unit: "m2", takeoffLine: "Painting", quiv: "Painting – Textured coating to external walls", heron: "Textured coating (Texcote or equal) to rendered external walls", buildup: "texcote", type: "Paint: Texcote", elements: pick(walls, "externalFace") });

  return lines;
}

// ── Stage data: how far each sample job has got ────────────────────────────
// progress: phase -> % complete at each certificate. Later certificates carry
// earlier phases forward, so only changes are listed.
const STAGES = {
  "duplex-strip": {
    start: "2026-07-06",
    stage: "Interim Certificate 1 issued: substructure complete, ground floor frame under way",
    certs: [
      { date: "2026-08-28", progress: { 1: 100, 2: 60 }, prelims: 6, pcDone: [], status: "approved" },
    ],
    variations: [
      { reference: "AI-01", description: "Deepen strip footing at rear wall to 1.50m after soft spot found during excavation", qty: 7.2, unit: "m3", rateKey: "fnd-concrete", completed: true, issued: 18 },
      { reference: "AI-02", description: "Add 1.0m wide concrete apron round the building (client instruction)", qty: 46, unit: "m2", rate: 14500, completed: false, issued: 40 },
    ],
    risks: [
      ["Peak rainy season (Aug-Sep) flooding open trenches", "high", "medium", "mitigating", "Programme concrete pours in the morning, keep a pump on site, cover trenches with tarpaulin"],
      ["Cement price rise above tender allowance", "medium", "high", "open", "Bulk-buy 600 bags now; flag fluctuation clause to client"],
      ["Late client decision on window finish colour", "low", "low", "open", "Issue colour schedule for sign-off by week 8"],
    ],
    issues: [
      ["Soft spot at rear wall trench, gridline D", "high", "resolved", "Deepened footing under AI-01"],
      ["Block moulder delivered 20% under-strength blocks", "medium", "in-progress", "Batch rejected, replacement from second supplier; cube tests requested"],
    ],
  },
  "duplex-pad-strip": {
    start: "2026-05-04",
    stage: "Interim Certificate 2 issued: first floor slab cast, first floor walls rising",
    certs: [
      { date: "2026-06-19", progress: { 1: 100, 2: 50 }, prelims: 5, pcDone: [], status: "paid" },
      { date: "2026-08-14", progress: { 2: 100, 3: 100, 4: 40 }, prelims: 10, pcDone: [], status: "approved" },
    ],
    variations: [
      { reference: "AI-01", description: "Add 1.2m cantilever balcony to master bedroom at first floor (design change)", qty: 1, unit: "item", rate: 1850000, completed: true, issued: 55 },
      { reference: "AI-02", description: "Upgrade ground floor windows to burglary-proof laminated glass", qty: 8, unit: "nr", rate: 68000, completed: false, issued: 88 },
    ],
    risks: [
      ["Weathered rock met at 1.2m on grid A delaying pad excavation", "medium", "medium", "closed", "Hired breaker for 3 days; no redesign needed"],
      ["Reinforcement price volatility (FX-driven)", "high", "high", "mitigating", "Fixed-price order for the full first floor rebar placed in June"],
      ["Scaffold availability for first floor blockwork", "medium", "low", "open", "Book two sets from the hire yard a week ahead"],
    ],
    issues: [
      ["Honeycombing on two first floor beams at grid 3", "high", "resolved", "Hacked back and repaired with non-shrink grout; engineer approved"],
      ["Neighbour complaint about weekend working", "low", "closed", "Agreed Saturday working 8am-2pm only"],
    ],
  },
  "duplex-raft": {
    start: "2026-02-02",
    stage: "Interim Certificate 3 issued: roofed, doors and windows going in, finishes started",
    certs: [
      { date: "2026-03-20", progress: { 1: 100 }, prelims: 5, pcDone: [], status: "paid" },
      { date: "2026-05-15", progress: { 2: 100, 3: 100, 4: 60 }, prelims: 10, pcDone: [], status: "paid" },
      { date: "2026-07-24", progress: { 4: 100, 5: 100, 6: 50, 7: 20 }, prelims: 15, pcDone: [0], status: "approved" },
    ],
    variations: [
      { reference: "AI-01", description: "Dewatering during raft excavation: wellpoint pump hire and attendance", qty: 14, unit: "day", rate: 85000, completed: true, issued: 10 },
      { reference: "AI-02", description: "Change living room floor tiles to 600x1200 polished porcelain (extra over)", qty: 68, unit: "m2", rate: 9500, completed: false, issued: 150 },
      { reference: "AI-03", description: "Add rainwater downpipes and gutters to rear elevation", qty: 22, unit: "m", rate: 12500, completed: true, issued: 128 },
    ],
    risks: [
      ["High water table (1.8m) flooding raft excavation", "high", "high", "closed", "Wellpoint dewatering instructed under AI-01"],
      ["Differential settlement on soft clay", "medium", "high", "mitigating", "Settlement studs on four corners, monthly readings to engineer"],
      ["Porcelain tile lead time (imported)", "medium", "medium", "open", "Order placed with deposit; local alternative identified"],
    ],
    issues: [
      ["Roof sheet colour mismatch on rear slope", "medium", "resolved", "Supplier replaced 14 sheets at no cost"],
      ["Two window frames out of square on first floor", "medium", "in-progress", "Fabricator to re-fix before glazing"],
      ["Electrical first fix behind schedule (PC sum contractor)", "high", "open", "Weekly coordination meeting set with the electrician"],
    ],
  },
  "duplex-pile": {
    start: "2025-09-01",
    stage: "Practical completion reached and final account agreed",
    certs: [
      { date: "2025-11-14", progress: { 1: 100, 2: 30 }, prelims: 6, pcDone: [], status: "paid" },
      { date: "2026-02-27", progress: { 2: 100, 3: 100, 4: 100 }, prelims: 12, pcDone: [], status: "paid" },
      { date: "2026-05-22", progress: { 5: 100, 6: 100, 7: 40 }, prelims: 18, pcDone: [0, 1], status: "paid" },
      { date: "2026-08-07", progress: { 7: 100 }, prelims: 22, pcDone: [0, 1, 2], status: "paid", releaseHalfRetention: true },
    ],
    finalAccount: true,
    variations: [
      { reference: "AI-01", description: "Pile integrity testing (PIT) to all piles", qty: null, unit: "nr", rate: 45000, completed: true, issued: 30, qtyFrom: "piles" },
      { reference: "AI-02", description: "Extend piles on grid A by 2.0m after trial bore found deeper peat", qty: null, unit: "m", rateKey: "pile-bore", completed: true, issued: 24, qtyFrom: "gridA2m" },
      { reference: "AI-03", description: "Granite worktop and extra kitchen cabinets (client upgrade)", qty: 1, unit: "item", rate: 1450000, completed: true, issued: 210 },
    ],
    risks: [
      ["Vibration and noise complaints from adjoining terrace during piling", "medium", "medium", "closed", "Bored (not driven) piles chosen; piling done in 3 weeks"],
      ["Pile integrity defects", "low", "high", "closed", "PIT on all piles under AI-01: all passed"],
      ["Retention release delayed by snag list", "medium", "low", "accepted", "Snag list closed out; half retention released on Cert 4"],
    ],
    issues: [
      ["Peat layer deeper than site investigation on grid A", "high", "resolved", "Piles extended 2.0m under AI-02"],
      ["Leaking valley gutter after first heavy rain", "medium", "resolved", "Resealed and tested"],
    ],
  },
};

const PROVISIONAL = [
  ["Electrical installation (lighting, power and wiring) - PC sum", 4500000],
  ["Plumbing, sanitary fittings and water supply - PC sum", 3800000],
  ["External works, soakaway and septic tank - Provisional sum", 2600000],
];

const PRELIMINARY_ITEMS = [
  "Setting Out",
  "Progress Photographs and Reports",
  "Foreman / Management supervision",
  "Other staff",
  "Insurances",
  "Site accommodation",
  "Office accommodation",
  "Site security",
  "Temporary fences",
  "Telephone",
  "Administration",
  "Material tests / Samples",
  "Removal of debris",
  "Water for the Works",
  "Power for the Works",
  "Notice board",
  "Temporary power/ lights",
  "Safety/ Health & Welfare",
  "Storage",
  "Small Plant/ Tools",
  "Plant Equipment/ scaffolding",
  "Additional Items (to be listed)",
];

const SUPPLIERS = {
  Material: ["Owode Building Materials Ltd", "Crest Cement Depot", "Ironline Steel Merchants", "Sunrise Block Industry"],
  Plant: ["Ace Plant Hire"],
  Consumable: ["Owode Building Materials Ltd"],
};

// Same arithmetic as routes/projects.js itemIdentity() / pmCompute.js.
export function itemIdentity(item, index) {
  const sn = Number(item?.sn) || index + 1;
  return [
    sn,
    String(item?.code || "").trim().toLowerCase(),
    String(item?.description || "").trim().toLowerCase(),
    String(item?.takeoffLine || "").trim().toLowerCase(),
    String(item?.materialName || "").trim().toLowerCase(),
    String(item?.unit || "").trim().toLowerCase(),
  ].join("::");
}

// Mirrors computeValueToDate() in routes/projects.js for a takeoff project.
export function valueToDate(project) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let measured = 0;
  for (const it of project.items) {
    const f = it.completed ? 1 : Math.max(0, Math.min(100, n(it.percentComplete))) / 100;
    measured += n(it.actualQty ?? it.qty) * n(it.actualRate ?? it.rate) * f;
  }
  const varsDone = sum(project.variations.filter((v) => v.completed), (v) => n(v.qty) * n(v.rate));
  const pcTotal = sum(project.provisionalSums, (p) => n(p.amount));
  const pcDone = sum(project.provisionalSums.filter((p) => p.completed), (p) => n(p.amount));
  const measuredTotal = sum(project.items, (it) => n(it.qty) * n(it.rate));
  const prelimTotal = ((measuredTotal + pcTotal) * n(project.contract.preliminaryPercent)) / 100;
  const alloc = sum(project.preliminaryItems, (p) => n(p.allocation)) || 100;
  const done = sum(project.preliminaryItems.filter((p) => p.completed), (p) => n(p.allocation));
  const prelimDone = (prelimTotal * done) / alloc;
  return {
    cumulativeValue: measured + varsDone + pcDone + prelimDone,
    measured,
    prelimTotal,
  };
}

// ── The sample project document ───────────────────────────────────────────
export function buildSampleProject(design, productKey, { modelUrls = {} } = {}) {
  const isQuiv = productKey === "revit";
  const model = buildDuplex(design);
  const stage = STAGES[design.key];
  const lines = measuredLines(model);
  const tag = isQuiv ? "QUIV" : "HERON";
  const start = stage.start;

  // Bill items, in the order the plugin would send them.
  const items = lines.map((l, i) => {
    const code = isQuiv
      ? `${l.takeoffLine}:${l.key}:${l.level}`.toLowerCase().replace(/\s+/g, "-")
      : `${l.section}:${l.heron}`;
    const base = {
      sn: i + 1,
      qty: l.qty,
      unit: l.unit,
      rate: 0,
      description: isQuiv ? l.quiv : l.heron,
      takeoffLine: isQuiv ? l.takeoffLine : "",
      materialName: "",
      level: isQuiv ? l.level : l.section,
      type: isQuiv ? l.type : "item",
      code,
      category: l.category,
      trade: l.trade,
      discipline: isQuiv ? l.discipline : "",
      appliedRateKey: l.heron,
      completed: false,
      percentComplete: 0,
    };
    if (isQuiv) {
      base.elementIds = l.elements.map((e) => e.id);
      base.elementQuantities = l.elements.map((e) => ({ id: e.id, qty: e.qty }));
      base.elementQuantitiesEstimated = false;
    }
    return base;
  });

  // Budget: one material/labour/plant row per build-up component per bill line.
  let bsn = 1;
  const budgetItems = [];
  lines.forEach((l, i) => {
    const phase = PHASES[l.phase - 1];
    const phaseStart = day(start, 5 + sum(PHASES.slice(0, l.phase - 1), (p) => p.days));
    for (const b of budgetLinesFor(l.buildup, l.qty)) {
      const suppliers = SUPPLIERS[b.componentKind] || [];
      budgetItems.push({
        billIdentity: items[i].code,
        sn: bsn++,
        description: b.materialName,
        materialName: b.materialName,
        takeoffLine: items[i].description,
        componentKind: b.componentKind,
        category: l.category,
        trade: l.trade,
        unit: b.unit,
        qty: b.qty,
        rate: b.rate,
        rateSource: "sample",
        overheadPercent: OVERHEAD_PERCENT,
        profitPercent: PROFIT_PERCENT,
        procured: false,
        procuredPercent: 0,
        targetDate: b.componentKind === "Labour" ? null : day(isoDay(phaseStart), -7),
        supplier: suppliers.length ? suppliers[(i + bsn) % suppliers.length] : "",
        notes: b.componentKind === "Labour" ? phase.resource : "",
        elementIds: items[i].elementIds || [],
      });
    }
  });

  const project = {
    productKey,
    name: `Sample: ${design.title}`,
    clientName: design.clientName,
    slug: `sample-${design.key}`,
    clientProjectKey: `sample-${productKey}-${design.key}`,
    modelTitle: isQuiv ? `${design.title}.rvt` : `${design.title}.pdf`,
    origin: "",
    isSample: true,
    userId: null,
    items,
    budgetItems,
    materialItems: [],
    provisionalSums: PROVISIONAL.map(([description, amount]) => ({
      description,
      amount,
      completed: false,
      completedAt: null,
    })),
    variations: [],
    preliminaryItems: PRELIMINARY_ITEMS.map((name) => ({
      name,
      allocation: Number((100 / PRELIMINARY_ITEMS.length).toFixed(2)),
      completed: false,
      completedAt: null,
      notes: "",
      actualAmount: 0,
    })),
    contract: { preliminaryPercent: 7.5, contingencyPercent: 5, taxPercent: 7.5 },
    certificates: [],
    valuationEvents: [],
    valuationSettings: {
      showDailyLog: true,
      showValuationSettings: true,
      showActualColumns: false,
      dashboardChartMode: "pie",
      retentionPct: 5,
      vatPct: 7.5,
      withholdingPct: 2.5,
      rateSyncEnabled: false,
      basis: "boq",
    },
    models: {},
    version: 1,
  };

  // Bill rates come from the budget build-up, exactly as on a live project.
  deriveBillRatesFromBudget(project);
  for (const it of project.items) {
    if (!(it.rate > 0)) throw new Error(`Unpriced sample line: ${it.description}`);
  }

  // ── Contract lock (same sums as lockContract()) ──
  const approvedAt = day(start, -10);
  const measured = sum(items, (it) => it.qty * it.rate);
  const provisional = sum(project.provisionalSums, (p) => p.amount);
  const prelim = ((measured + provisional) * 7.5) / 100;
  const subtotal = measured + provisional + prelim;
  const contingency = (subtotal * 5) / 100;
  const tax = ((subtotal + contingency) * 7.5) / 100;
  project.contract = {
    locked: true,
    lockedAt: approvedAt,
    lockedBy: null,
    approvedAt,
    preliminaryPercent: 7.5,
    contingencyPercent: 5,
    taxPercent: 7.5,
    contractSum: subtotal + contingency + tax,
    measuredAtLock: measured,
    provisionalAtLock: provisional,
    preliminaryAtLock: prelim,
    contingencyAtLock: contingency,
    taxAtLock: tax,
    baseItems: items.map((it, idx) => ({
      identity: itemIdentity(it, idx),
      description: it.description,
      qty: it.qty,
      unit: it.unit,
      rate: it.rate,
    })),
    notes: `Contract sum agreed with ${design.clientName} on ${isoDay(approvedAt)}. Sample project, read-only.`,
    lockPinHash: "",
  };

  // ── Variations (design changes and site instructions) ──
  const lineRate = (key) => project.items[lines.findIndex((l) => l.key === key)]?.rate || 0;
  const pileCount = model.elements.filter((e) => e.ifc === "IfcPile").length;
  const gridAPiles = model.elements.filter((e) => e.ifc === "IfcPile" && e.shapes[0].cx === 0).length;
  project.variations = stage.variations.map((v) => {
    let qty = v.qty;
    if (v.qtyFrom === "piles") qty = pileCount;
    if (v.qtyFrom === "gridA2m") qty = gridAPiles * 2;
    return {
      description: `${v.reference}: ${v.description}`,
      qty,
      unit: v.unit,
      rate: v.rateKey ? lineRate(v.rateKey) : v.rate,
      reference: v.reference,
      issuedAt: day(start, v.issued),
      source: "manual",
      completed: false,
      completedAt: null,
      _plan: v,
    };
  });

  // ── Certificates: replay the job, one valuation at a time ──
  const progress = {};
  let lessPrevious = 0;
  let periodStart = day(start);
  const events = [];
  stage.certs.forEach((c, ci) => {
    const certDate = day(c.date);
    for (const [ph, pct] of Object.entries(c.progress)) progress[ph] = pct;
    project.items.forEach((it, idx) => {
      const pct = progress[lines[idx].phase] || 0;
      const prev = it.completed ? 100 : it.percentComplete;
      if (pct === prev) return;
      if (pct >= 100) {
        it.completed = true;
        it.completedAt = certDate;
        it.percentComplete = 100;
      } else {
        it.percentComplete = pct;
      }
      it.percentCompleteUpdatedAt = certDate;
      it.statusUpdatedAt = certDate;
      events.push({
        itemKey: itemIdentity(it, idx),
        itemSn: it.sn,
        description: it.description,
        takeoffLine: it.takeoffLine,
        materialName: "",
        qty: it.qty,
        unit: it.unit,
        rate: it.rate,
        amount: r2((it.qty * it.rate * (pct - prev)) / 100),
        statusField: "completed",
        markedValue: pct >= 100,
        previousPercent: prev,
        nextPercent: pct,
        eventType: "partial",
        markedAt: day(c.date, -2),
        markedDay: isoDay(day(c.date, -2)),
      });
    });
    project.preliminaryItems.forEach((p, i) => {
      if (i < c.prelims && !p.completed) {
        p.completed = true;
        p.completedAt = certDate;
      }
    });
    for (const i of c.pcDone) {
      const pc = project.provisionalSums[i];
      if (!pc.completed) {
        pc.completed = true;
        pc.completedAt = certDate;
      }
    }
    for (const v of project.variations) {
      if (v._plan.completed && !v.completed && v.issuedAt <= certDate) {
        v.completed = true;
        v.completedAt = certDate;
      }
    }

    const { cumulativeValue } = valueToDate(project);
    const thisCertificate = Math.max(0, cumulativeValue - lessPrevious);
    const retentionAmount = (thisCertificate * 5) / 100;
    const retentionSoFar = sum(project.certificates, (x) => x.retentionAmount) + retentionAmount;
    const retentionReleased = c.releaseHalfRetention ? retentionSoFar / 2 : 0;
    const netBeforeTax = thisCertificate - retentionAmount + retentionReleased;
    const vatAmount = (netBeforeTax * 7.5) / 100;
    const whtAmount = (netBeforeTax * 2.5) / 100;
    project.certificates.push({
      number: ci + 1,
      date: certDate,
      periodStart,
      periodEnd: certDate,
      cumulativeValue,
      lessPrevious,
      thisCertificate,
      retentionPct: 5,
      retentionAmount,
      retentionReleased,
      vatPct: 7.5,
      vatAmount,
      whtPct: 2.5,
      whtAmount,
      netPayable: netBeforeTax + vatAmount - whtAmount,
      status: c.status,
      notes:
        ci === stage.certs.length - 1 && stage.finalAccount
          ? "Final interim certificate at practical completion; half retention released."
          : `Valuation ${ci + 1}: ${Object.keys(c.progress)
              .map((ph) => `${PHASES[ph - 1].name} ${c.progress[ph]}%`)
              .join(", ")}.`,
      snapshotCompletedCount: project.items.filter((it) => it.completed).length,
      snapshotTotalCount: project.items.length,
    });
    lessPrevious += thisCertificate;
    periodStart = day(c.date, 1);
  });
  project.valuationEvents = events;
  for (const v of project.variations) delete v._plan;

  // Procurement follows progress: materials for a started phase are bought.
  budgetItems.forEach((b) => {
    if (b.componentKind === "Labour") return;
    const line = lines.find((l, i) => items[i].code === b.billIdentity);
    const pct = progress[line.phase] || 0;
    const next = progress[line.phase - 1] >= 100 ? 30 : 0;
    const bought = pct >= 100 ? 100 : pct > 0 ? Math.min(100, pct + 40) : next;
    if (bought > 0) {
      b.procuredPercent = bought;
      b.procured = bought >= 100;
      b.procuredAt = b.procured ? b.targetDate : null;
    }
  });

  // ── Final account (pile sample only) ──
  const finalAcc = { finalized: false };
  if (stage.finalAccount) {
    const v = valueToDate(project);
    const provisionalFinal = sum(project.provisionalSums, (p) => p.amount);
    const variationsFinal = sum(project.variations, (x) => x.qty * x.rate);
    const finalContractValue = v.measured + provisionalFinal + v.prelimTotal + variationsFinal;
    Object.assign(finalAcc, {
      finalized: true,
      finalizedAt: day(stage.certs[stage.certs.length - 1].date, 21),
      finalizedBy: null,
      measuredWorkFinal: v.measured,
      provisionalFinal,
      preliminaryFinal: v.prelimTotal,
      variationsFinal,
      retentionReleased: sum(project.certificates, (c) => c.retentionReleased),
      totalCertifiedToDate: sum(project.certificates, (c) => c.thisCertificate),
      agreedContractSum: project.contract.contractSum,
      finalContractValue,
      savings: project.contract.contractSum - finalContractValue,
      notes: "Final account agreed with the client's QS. Balance of retention due at end of the 6-month defects period.",
    });
  }
  project.finalAccount = finalAcc;

  // ── Programme (PM tab) ──
  const tasks = [];
  let cursor = day(start);
  const asOf = day(stage.certs[stage.certs.length - 1].date);
  tasks.push({
    taskId: "T0",
    wbs: "1",
    name: "Mobilisation and setting out",
    startDate: cursor,
    endDate: day(isoDay(cursor), 5),
    baselineStart: cursor,
    baselineEnd: day(isoDay(cursor), 5),
    durationDays: 5,
    actualStartDate: cursor,
    actualEndDate: day(isoDay(cursor), 5),
    actualDurationDays: 5,
    percentComplete: 100,
    status: "completed",
    priority: "medium",
    predecessors: [],
    linkedBoqIdentities: ["prelim::0"],
    linkedBoqWeights: [100],
    isMilestone: false,
    criticalPath: true,
    resourceNames: "Site engineer, surveyor",
    assignedTo: "Site engineer",
    source: "manual",
    notes: "",
  });
  cursor = day(isoDay(cursor), 5);
  PHASES.forEach((ph, pi) => {
    const s = cursor;
    const e = day(isoDay(s), ph.days);
    const pct = progress[ph.n] || 0;
    const idxs = lines.map((l, i) => (l.phase === ph.n ? i : -1)).filter((i) => i >= 0);
    const planned = sum(idxs, (i) => project.items[i].qty * project.items[i].rate);
    // A little slippage and cost drift so the dashboard has something to say.
    const slip = pi % 3 === 1 ? 4 : pi % 3 === 2 ? -2 : 1;
    const actualStart = pct > 0 ? day(isoDay(s), Math.max(0, slip)) : null;
    const actualEnd = pct >= 100 ? day(isoDay(e), slip) : null;
    tasks.push({
      taskId: `T${ph.n}`,
      wbs: `${ph.n + 1}`,
      name: ph.name,
      startDate: s,
      endDate: e,
      baselineStart: s,
      baselineEnd: e,
      durationDays: ph.days,
      actualStartDate: actualStart,
      actualEndDate: actualEnd,
      actualDurationDays: actualEnd ? ph.days + slip - Math.max(0, slip) : 0,
      percentComplete: pct,
      status: pct >= 100 ? "completed" : pct > 0 ? "in-progress" : "not-started",
      priority: ph.n <= 4 ? "high" : "medium",
      predecessors: [`T${ph.n - 1}`],
      linkedBoqIdentities: idxs.map((i) => itemIdentity(project.items[i], i)),
      linkedBoqWeights: idxs.map(() => 100),
      baselineCost: planned,
      actualCost: r2(planned * (pct / 100) * (1 + (pi % 2 === 0 ? 0.04 : -0.02))),
      isMilestone: false,
      criticalPath: ph.n !== 6,
      totalSlackDays: ph.n === 6 ? 10 : 0,
      resourceNames: ph.resource,
      assignedTo: ph.n <= 4 ? "Site engineer" : "Finishing supervisor",
      source: "boq",
      notes: "",
    });
    cursor = e;
  });
  const finish = cursor;
  tasks.push({
    taskId: "T8",
    wbs: "9",
    name: "Practical completion and handover",
    startDate: finish,
    endDate: finish,
    baselineStart: finish,
    baselineEnd: finish,
    durationDays: 0,
    percentComplete: stage.finalAccount ? 100 : 0,
    status: stage.finalAccount ? "completed" : "not-started",
    actualStartDate: stage.finalAccount ? finish : null,
    actualEndDate: stage.finalAccount ? finish : null,
    priority: "critical",
    predecessors: ["T7"],
    linkedBoqIdentities: [],
    linkedBoqWeights: [],
    isMilestone: true,
    criticalPath: true,
    resourceNames: "",
    assignedTo: "Project QS",
    source: "manual",
    notes: "",
  });
  project.projectManagement = {
    projectStart: day(start),
    projectFinish: finish,
    baselineDate: day(start, -10),
    budgetOverride: 0,
    tasks,
    risks: stage.risks.map(([title, probability, impact, status, mitigation], i) => ({
      riskId: `R${i + 1}`,
      title,
      description: "",
      probability,
      impact,
      status,
      owner: i === 0 ? "Site engineer" : "Project QS",
      mitigation,
      createdAt: day(start, 7 + i * 14),
      updatedAt: asOf,
    })),
    issues: stage.issues.map(([title, severity, status, notes], i) => ({
      issueId: `I${i + 1}`,
      title,
      description: "",
      severity,
      status,
      owner: "Site engineer",
      openedAt: day(start, 20 + i * 25),
      resolvedAt: status === "resolved" || status === "closed" ? day(start, 30 + i * 25) : null,
      notes,
    })),
    imports: [],
    lastEditedAt: asOf,
  };

  // ── IFC models (QUIV only; HERON is measured from drawings) ──
  if (isQuiv) {
    for (const disc of ["architectural", "structural"]) {
      const need = new Set(
        items.filter((it) => it.discipline === disc).flatMap((it) => it.elementIds),
      );
      const inModel = model.elements.filter((e) => e.discipline === disc).length;
      const m = modelUrls[disc] || {};
      project.models[disc] = {
        sourceFile: `${design.key}-${disc}.ifc`,
        key: m.key || "",
        url: m.url || "",
        sizeBytes: m.sizeBytes || 0,
        format: "ifc",
        uploadedAt: day(start, -12),
        uploadedBy: null,
        validation: {
          status: "valid",
          requiredCount: need.size,
          matchedCount: need.size,
          missingCount: 0,
          ifcElementCount: inModel,
          sampleMissingIds: [],
          checkedAt: day(start, -12),
        },
      };
    }
  }

  const certCount = project.certificates.length;
  const highlights = [
    `Bill of Quantity: ${items.length} measured lines priced from a material and labour build-up (10% overhead, 15% profit).`,
    `Budget: ${budgetItems.length} material, labour and plant lines with suppliers and procurement progress.`,
    `Valuation: contract locked at the agreed sum, ${certCount} certificate${certCount === 1 ? "" : "s"} with retention, VAT and WHT, and ${project.variations.length} variations.`,
    `PM Dashboard: ${tasks.length}-task programme linked to the bill, with earned value, ${stage.risks.length} risks and ${stage.issues.length} issues.`,
  ];
  if (isQuiv) {
    highlights.push(
      "3D Model: architectural and structural IFC models. Pick a bill line to see the elements it was measured from, or click an element to find its lines.",
    );
  } else {
    highlights.push(
      "Measured in HERON from PDF drawings: lines are grouped by takeoff folder (Substructure, Frame, Blockwork, Roofing, Doors & Windows, Finishes).",
    );
  }
  if (stage.finalAccount) highlights.push("Final account: finalised, with savings against the contract sum.");

  project.sample = {
    key: design.key,
    order: design.order,
    foundation: design.foundationLabel,
    location: design.location,
    stage: stage.stage,
    summary: `${design.title} at ${design.location}. Ground: ${design.soil}. ${tag} sample showing a job from takeoff to ${stage.finalAccount ? "final account" : "valuation"}.`,
    highlights,
  };

  return { project, model, lines };
}
