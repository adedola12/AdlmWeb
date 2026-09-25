// CIVIQ samples: four road jobs taken off the way CIVIQ takes a corridor off
// in Civil 3D — earthworks from the existing and design profiles, pavement
// layers, drainage and road furniture, each measured per chainage band.
//
// The road runs along x from chainage 0; the existing ground and the design
// road level are smooth profiles, so cut and fill change along the job the
// way they do on a real one. Every pavement layer, kerb, drain and culvert
// between two 20 m stations is an element of the corridor IFC model, and each
// bill line keeps the element IDs it was measured from.
//
// Pure: no database, no network.

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

const STATION = 20; // m between cross sections
export const ROAD_STOREY = "Road";

export const ROAD_DESIGNS = [
  {
    key: "road-asphalt",
    order: 1,
    pavement: "asphalt",
    label: "Flexible pavement (asphalt)",
    title: "Estate Access Road - Asphalt Pavement",
    clientName: "Greenfield Court Residents Association",
    location: "Akobo, Ibadan",
    soil: "Lateritic clay, CBR 8% at formation",
    length: 480,
    carriageway: 7.3,
    kerbs: true,
    drains: "both",
    culverts: [240],
    signs: 4,
    relief: [1.1, 0.5],
    baseId: 810000,
  },
  {
    key: "road-concrete",
    order: 2,
    pavement: "concrete",
    label: "Rigid pavement (concrete)",
    title: "Industrial Estate Road - Rigid Concrete Pavement",
    clientName: "Agbara Logistics Park Ltd",
    location: "Agbara Industrial Estate, Ogun",
    soil: "Silty sand, CBR 12% at formation",
    length: 360,
    carriageway: 7.3,
    kerbs: true,
    drains: "both",
    culverts: [180],
    signs: 3,
    relief: [0.7, 0.35],
    baseId: 830000,
  },
  {
    key: "road-interlock",
    order: 3,
    pavement: "interlock",
    label: "Interlocking paving",
    title: "Housing Estate Street - Interlocking Paving Stones",
    clientName: "Cedar Grove Homes Ltd",
    location: "Gwarinpa, Abuja",
    soil: "Stiff sandy clay over weathered rock",
    length: 300,
    carriageway: 6.0,
    kerbs: true,
    drains: "one",
    culverts: [],
    signs: 2,
    relief: [0.9, 0.3],
    baseId: 850000,
  },
  {
    key: "road-laterite",
    order: 4,
    pavement: "laterite",
    label: "Laterite feeder road",
    title: "Rural Feeder Road - Laterite with Culverts",
    clientName: "Osun State Rural Access Agency",
    location: "Ikire-Apomu, Osun",
    soil: "Sandy laterite with two stream crossings",
    length: 1200,
    carriageway: 6.0,
    kerbs: false,
    drains: "ditch",
    culverts: [380, 820, 1060],
    signs: 6,
    relief: [1.8, 0.6],
    baseId: 870000,
  },
];

// Pavement build-up per type, top down: [layer key, thickness m].
const PAVEMENTS = {
  asphalt: [["asphalt", 0.05], ["base", 0.15], ["subbase", 0.2]],
  concrete: [["concrete", 0.2], ["subbase", 0.15]],
  interlock: [["paver", 0.08], ["bed", 0.05], ["subbase", 0.15]],
  laterite: [["wearing", 0.2]],
};

const chain = (m) => `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, "0")}`;

function box(x0, y0, z0, x1, y1, z1) {
  return {
    kind: "box",
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    z: Math.min(z0, z1),
    dx: Math.max(0.01, Math.abs(x1 - x0)),
    dy: Math.max(0.01, Math.abs(y1 - y0)),
    dz: Math.max(0.01, Math.abs(z1 - z0)),
  };
}

// Existing ground and design road level (m, relative to the start of the job).
export function profiles(design) {
  const [a, b] = design.relief;
  const L = design.length;
  const existing = (x) => a * Math.sin((x / L) * Math.PI * 2.3 + 0.4) + b * Math.sin(x / 37);
  // The design level smooths the existing ground over +/-60 m and sits the
  // road 250 mm proud of it, so the job has both cut (humps shaved) and fill
  // (dips built up) without importing a whole embankment.
  const design_ = (x) => {
    let s = 0;
    let n = 0;
    for (let d = -60; d <= 60; d += 10) {
      s += existing(Math.min(L, Math.max(0, x + d)));
      n += 1;
    }
    return s / n + 0.25;
  };
  return { existing, design: design_ };
}

export function bandOf(design, x) {
  const band = design.length > 600 ? 400 : design.length > 400 ? 160 : 100;
  const a = Math.min(Math.floor(x / band) * band, Math.floor((design.length - 1) / band) * band);
  const b = Math.min(a + band, design.length);
  return `Ch ${chain(a)} to ${chain(b)}`;
}

// ── The corridor model ─────────────────────────────────────────────────────
export function buildRoadModel(design) {
  const { existing, design: road } = profiles(design);
  const layers = PAVEMENTS[design.pavement];
  const depth = sum(layers, (l) => l[1]);
  const half = design.carriageway / 2;
  const kerbW = design.kerbs ? 0.15 : 0;
  const drainW = design.drains === "ditch" ? 1.2 : design.drains ? 0.6 : 0;
  const formHalf = half + kerbW + 0.5; // formation runs 0.5 m past the kerb line
  let nextId = design.baseId;
  const elements = [];
  const add = (el) => {
    const e = { id: nextId, discipline: "structural", storey: ROAD_STOREY, ...el };
    nextId += 1;
    elements.push(e);
    return e;
  };
  const sections = [];

  for (let x0 = 0; x0 < design.length; x0 += STATION) {
    const x1 = Math.min(x0 + STATION, design.length);
    const len = x1 - x0;
    const xm = (x0 + x1) / 2;
    const level = bandOf(design, xm);
    const fg = road(xm);
    const eg = existing(xm);
    const formation = fg - depth;
    const width = 2 * formHalf;
    const cutDepth = Math.max(0, eg - 0.15 - formation);
    const fillDepth = Math.max(0, formation - (eg - 0.15));
    const sec = {
      x0,
      x1,
      level,
      len,
      topsoil: r3((width + 4) * len * 0.15),
      topsoilArea: r3((width + 4) * len),
      cut: r3(width * len * cutDepth),
      // Side slopes at 1:2 on the fill, from the average height.
      fill: r3((width + 2 * fillDepth) * len * fillDepth),
      formationArea: r3(width * len),
    };
    sections.push(sec);
    const tag = `Ch ${chain(x0)}-${chain(x1)}`;

    if (fillDepth > 0.02) {
      add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Embankment fill ${tag}`, typeName: "Embankment Fill", level, style: "fill", shapes: [box(x0, -formHalf - fillDepth, formation - fillDepth, x1, formHalf + fillDepth, formation)], q: { fill: sec.fill }, service: "fill" });
    }
    // Pavement layers, top down.
    let top = fg;
    for (const [key, t] of layers) {
      const w = key === "subbase" || key === "wearing" ? 2 * (half + kerbW + 0.3) : 2 * half;
      const area = w * len;
      const style = { asphalt: "asphalt", base: "base", subbase: "subbase", concrete: "concrete", paver: "paver", bed: "base", wearing: "subbase" }[key];
      const names = {
        asphalt: "Asphalt wearing course 50mm",
        base: "Crushed stone base course 150mm",
        subbase: `Laterite sub-base ${Math.round(t * 1000)}mm`,
        concrete: "Concrete pavement slab 200mm",
        paver: "Interlocking paving stones 80mm",
        bed: "Sharp sand bedding 50mm",
        wearing: "Laterite gravel wearing course 200mm",
      };
      add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `${names[key]} ${tag}`, typeName: names[key], level, style, shapes: [box(x0, -w / 2, top - t, x1, w / 2, top)], q: { area: r3(area), volume: r3(area * t), edge: 2 * len }, service: key });
      top -= t;
    }
    if (design.kerbs) {
      for (const s of [-1, 1]) {
        const y = s * (half + kerbW / 2);
        add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Precast kerb ${s < 0 ? "left" : "right"} ${tag}`, typeName: "Kerb 450x300x150", level, style: "concrete", shapes: [box(x0, y - kerbW / 2, fg - 0.2, x1, y + kerbW / 2, fg + 0.15)], q: { length: len }, service: "kerb" });
      }
    }
    const drainSides = design.drains === "both" || design.drains === "ditch" ? [-1, 1] : design.drains === "one" ? [1] : [];
    for (const s of drainSides) {
      const yIn = s * (half + kerbW + 0.3);
      const yOut = s * (half + kerbW + 0.3 + drainW);
      if (design.drains === "ditch") {
        const vol = r3(0.5 * (1.2 + 0.4) * 0.6 * len);
        add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Side ditch ${s < 0 ? "left" : "right"} ${tag}`, typeName: "Earth Side Ditch", level, style: "fill", shapes: [box(x0, Math.min(yIn, yOut), fg - 0.65, x1, Math.max(yIn, yOut), fg - 0.6)], q: { volume: vol, length: len }, service: "ditch" });
      } else {
        const y0 = Math.min(yIn, yOut);
        const y1 = Math.max(yIn, yOut);
        const shapes = [
          box(x0, y0, fg - 0.75, x1, y1, fg - 0.6),
          box(x0, y0, fg - 0.6, x1, y0 + 0.125, fg),
          box(x0, y1 - 0.125, fg - 0.6, x1, y1, fg),
        ];
        add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `RC U-drain 600x600 ${s < 0 ? "left" : "right"} ${tag}`, typeName: "RC U-Drain 600x600", level, style: "concrete", shapes, q: { length: len, excavation: r3(0.85 * 0.75 * len) }, service: "udrain" });
      }
    }
    if (design.pavement !== "laterite") {
      // Centre line: a 3 m dash every 6 m; edge lines continuous.
      for (let d = x0; d < x1 - 0.5; d += 6) {
        add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Centre line marking ${tag}`, typeName: "Road Marking 100mm", level, style: "marking", shapes: [box(d, -0.05, fg, Math.min(d + 3, x1), 0.05, fg + 0.005)], q: { length: Math.min(3, x1 - d) }, service: "marking" });
      }
      for (const s of [-1, 1]) {
        const y = s * (half - 0.2);
        add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Edge line marking ${tag}`, typeName: "Road Marking 100mm", level, style: "marking", shapes: [box(x0, y - 0.05, fg, x1, y + 0.05, fg + 0.005)], q: { length: len }, service: "marking" });
      }
    }
  }

  // Culverts: a 900mm pipe run across the road and 2 m past each side.
  for (const cx of design.culverts) {
    const level = bandOf(design, cx);
    const fg = road(cx);
    const runLen = 2 * (half + kerbW + drainW + 2.3);
    add({ ifc: "IfcPipeSegment", predefined: "CULVERT", name: `900mm pipe culvert at Ch ${chain(cx)}`, typeName: "Culvert 900mm Precast", level, style: "concrete", shapes: [box(cx - 0.5, -runLen / 2, fg - depth - 1.2, cx + 0.5, runLen / 2, fg - depth - 0.2)], q: { length: r3(runLen) }, service: "culvert" });
  }
  // Signs at the ends and at the culverts.
  const signXs = [2, design.length - 2, ...design.culverts.map((c) => c - 30), ...design.culverts.map((c) => c + 30)].slice(0, design.signs);
  for (const [i, sx] of signXs.entries()) {
    const fg = road(sx);
    const y = (i % 2 ? 1 : -1) * (half + kerbW + drainW + 1.0);
    add({ ifc: "IfcBuildingElementProxy", predefined: "ELEMENT", name: `Road sign ${i + 1}`, typeName: "Road Sign on Post", level: bandOf(design, sx), style: "equipment", shapes: [box(sx - 0.04, y - 0.04, fg, sx + 0.04, y + 0.04, fg + 2.4), box(sx - 0.35, y - 0.02, fg + 1.9, sx + 0.35, y + 0.02, fg + 2.5)], q: { count: 1 }, service: "sign" });
  }

  return { design, elements, sections, depth };
}

// ── Measured lines ─────────────────────────────────────────────────────────
const EARTH = { category: "Substructure", trade: "Earthworks" };
const PAVE = { category: "Superstructure", trade: "External Works" };
const DRAIN = { category: "Substructure", trade: "External Works" };

export function roadLines(model) {
  const { design, elements, sections } = model;
  const lines = [];
  const bands = [...new Set(sections.map((s) => s.level))];
  const add = (def) => {
    const elements_ = def.elements || [];
    const qty = r2(def.qty ?? sum(elements_, (x) => x.qty));
    if (!(qty > 0)) return;
    lines.push({ discipline: "structural", ...def, elements: elements_, qty });
  };
  const pick = (level, service, qk) =>
    elements
      .filter((e) => e.level === level && e.service === service)
      .map((e) => ({ id: e.id, qty: r3(e.q[qk]) }))
      .filter((x) => x.qty > 0);

  for (const level of bands) {
    const secs = sections.filter((s) => s.level === level);
    const L = { level };
    // Earthworks
    add({ ...L, ...EARTH, key: "topsoil", phase: 1, unit: "m3", takeoffLine: "Earthworks", quiv: "Topsoil Excavation (150mm average, dispose)", buildup: "topsoil", type: "Topsoil Excavation", qty: sum(secs, (s) => s.topsoil) });
    add({ ...L, ...EARTH, key: "cut", phase: 2, unit: "m3", takeoffLine: "Earthworks", quiv: "Excavation for Cutting (to formation, reuse or dispose)", buildup: "bulkCut", type: "Excavation for Cutting", qty: sum(secs, (s) => s.cut) });
    add({ ...L, ...EARTH, key: "fill", phase: 2, unit: "m3", takeoffLine: "Earthworks", quiv: "Filling to Embankment (selected laterite, compacted in layers)", buildup: "embankFill", type: "Filling to Embankment", elements: pick(level, "fill", "fill") });
    add({ ...L, ...EARTH, key: "disposal", phase: 2, unit: "m3", takeoffLine: "Earthworks", quiv: "Disposal of surplus excavated material off site", buildup: "disposal", type: "Disposal", qty: Math.max(0, sum(secs, (s) => s.cut) - sum(secs, (s) => s.fill) * 0.4) });
    // Drainage
    if (design.drains === "ditch") {
      add({ ...L, ...DRAIN, key: "ditch", phase: 3, unit: "m3", takeoffLine: "Drainage", quiv: "Drainage — Bulk Excavation (trapezoidal side ditch)", buildup: "ditch", type: "Side Ditch Excavation", elements: pick(level, "ditch", "volume") });
    } else if (design.drains) {
      add({ ...L, ...DRAIN, key: "drain-exc", phase: 3, unit: "m3", takeoffLine: "Drainage", quiv: "Drainage — Bulk Excavation (for U-drains)", buildup: "excavate", type: "Drainage Bulk Excavation", elements: pick(level, "udrain", "excavation") });
      add({ ...L, ...DRAIN, key: "udrain", phase: 3, unit: "m", takeoffLine: "Drainage", quiv: "Drainage — RC U-drain 600x600 (C25, 125mm walls)", buildup: "uDrain", type: "RC U-Drain 600x600", elements: pick(level, "udrain", "length") });
    }
    add({ ...L, ...DRAIN, key: "culvert", phase: 3, unit: "m", takeoffLine: "Drainage", quiv: "Culvert — 900mm precast concrete pipe, bedded and surrounded", buildup: "culvert900", type: "Culvert 900mm", elements: pick(level, "culvert", "length") });
    // Pavement
    const layer = (service, qk, def) => add({ ...L, ...PAVE, ...def, elements: pick(level, service, qk) });
    layer("subbase", "volume", { key: "subbase", phase: 4, unit: "m3", takeoffLine: "Pavement", quiv: "Subbase Course (selected laterite, compacted to 95% MDD)", buildup: "subBase", type: "Subbase Course" });
    layer("base", "volume", { key: "base", phase: 4, unit: "m3", takeoffLine: "Pavement", quiv: "Base Course (crushed stone, 150mm)", buildup: "baseCourse", type: "Base Course" });
    layer("wearing", "volume", { key: "wearing", phase: 5, unit: "m3", takeoffLine: "Pavement", quiv: "Laterite Gravel Wearing Course (200mm, compacted)", buildup: "subBase", type: "Gravel Wearing Course" });
    if (design.pavement === "asphalt") {
      layer("asphalt", "area", { key: "prime", phase: 5, unit: "m2", takeoffLine: "Pavement", quiv: "Prime Coat (MC-1 at 1.0 l/m2)", buildup: "prime", type: "Prime Coat" });
      layer("asphalt", "area", { key: "asphalt", phase: 5, unit: "m2", takeoffLine: "Pavement", quiv: "Asphalt Surfacing (50mm wearing course)", buildup: "asphalt50", type: "Asphalt Surfacing" });
    }
    if (design.pavement === "concrete") {
      layer("concrete", "volume", { key: "slab", phase: 5, unit: "m3", takeoffLine: "Pavement", quiv: "Concrete Pavement (C25, 200mm slab)", buildup: "concrete25", type: "Concrete Pavement" });
      layer("concrete", "area", { key: "mesh", phase: 5, unit: "m2", takeoffLine: "Pavement", quiv: "Concrete Pavement — BRC mesh A142 reinforcement", buildup: "brc", type: "Pavement Reinforcement" });
      layer("concrete", "edge", { key: "slab-form", phase: 5, unit: "m", takeoffLine: "Pavement", quiv: "Concrete Pavement — edge formwork (200mm)", buildup: "formwork", type: "Pavement Formwork", mult: 0.2 });
    }
    if (design.pavement === "interlock") {
      layer("paver", "area", { key: "pavers", phase: 5, unit: "m2", takeoffLine: "Pavement", quiv: "Interlocking Paving (80mm stones on 50mm sand bed)", buildup: "interlock", type: "Interlocking Paving" });
    }
    // Road furniture
    add({ ...L, ...PAVE, key: "kerb", phase: 6, unit: "m", takeoffLine: "Road Furniture", quiv: "Kerbs (precast concrete, straight)", buildup: "kerb", type: "Kerbs", elements: pick(level, "kerb", "length") });
    add({ ...L, ...PAVE, key: "marking", phase: 6, unit: "m", takeoffLine: "Road Furniture", quiv: "Road Markings (thermoplastic, 100mm)", buildup: "marking", type: "Road Markings", elements: pick(level, "marking", "length") });
    add({ ...L, ...PAVE, key: "sign", phase: 6, unit: "nr", takeoffLine: "Road Furniture", quiv: "Traffic Signs (on galvanised post)", buildup: "roadSign", type: "Traffic Signs", elements: pick(level, "sign", "count") });
  }
  // Formwork edges are measured in m of edge; its build-up is per m2, so the
  // line is converted at the slab depth.
  for (const l of lines) {
    if (l.mult) {
      l.qty = r2(l.qty * l.mult);
      l.unit = "m2";
      l.elements = l.elements.map((e) => ({ ...e, qty: r3(e.qty * l.mult) }));
      delete l.mult;
    }
  }
  return lines;
}

// ── Programme and stage plans ─────────────────────────────────────────────
export const ROAD_PHASES = [
  { n: 1, name: "Site clearance and topsoil strip", days: 10, resource: "Dozer and tipper crew", priority: "high", lead: "Site engineer" },
  { n: 2, name: "Earthworks: cut, fill and formation", days: 25, resource: "Earthworks gang, grader and roller", priority: "high", lead: "Site engineer" },
  { n: 3, name: "Drainage and culverts", days: 20, resource: "Drainage gang, carpenters", priority: "high", lead: "Site engineer", slack: 5 },
  { n: 4, name: "Sub-base and base course", days: 18, resource: "Paving gang, grader and roller", priority: "high", lead: "Site engineer" },
  { n: 5, name: "Surfacing", days: 12, resource: "Surfacing crew", lead: "Resident engineer" },
  { n: 6, name: "Kerbs, markings and road furniture", days: 10, resource: "Kerbing gang, marking crew", lead: "Resident engineer" },
];

const ROAD_STAGES = {
  "road-asphalt": {
    start: "2026-06-01",
    stage: "Interim Certificate 2 issued: drains and culvert in, sub-base being laid",
    certs: [
      { date: "2026-07-10", progress: { 1: 100, 2: 70 }, prelims: 6, pcDone: [], status: "paid" },
      { date: "2026-08-21", progress: { 2: 100, 3: 100, 4: 30 }, prelims: 11, pcDone: [], status: "approved" },
    ],
    variations: [
      { reference: "SI-01", description: "Remove unsuitable soft material at Ch 0+300 and replace with laterite", qty: 180, unit: "m3", rateKey: "fill", completed: true, issued: 24 },
      { reference: "SI-02", description: "Add two speed humps at the estate gate (residents' request)", qty: 2, unit: "nr", rate: 385000, completed: false, issued: 60 },
    ],
    risks: [
      ["Rain on exposed formation softening the subgrade", "high", "medium", "mitigating", "Seal formation with a roller at close of work; lay sub-base in short sections"],
      ["Bitumen price rise before surfacing", "medium", "high", "open", "Agree a fixed price with the asphalt plant for the full tonnage"],
    ],
    issues: [["Existing water main found at Ch 0+120, 600mm deep", "high", "resolved", "Relocated by the water board; culvert invert kept"]],
  },
  "road-concrete": {
    start: "2026-08-03",
    stage: "Interim Certificate 1 issued: earthworks and drainage under way",
    certs: [{ date: "2026-09-11", progress: { 1: 100, 2: 60, 3: 20 }, prelims: 6, pcDone: [], status: "approved" }],
    variations: [
      { reference: "SI-01", description: "Thicken slab to 250mm at the loading bay entrance", qty: 38, unit: "m3", rateKey: "slab", completed: false, issued: 20 },
    ],
    risks: [
      ["Heavy trucks using the formation before the slab is cast", "high", "high", "mitigating", "Temporary diversion agreed with the park manager"],
      ["Concrete supply interrupted by cement scarcity", "medium", "high", "open", "Two ready-mix suppliers approved"],
    ],
    issues: [["Formation CBR below design at Ch 0+240", "medium", "in-progress", "Lime stabilisation trial requested"]],
  },
  "road-interlock": {
    start: "2026-03-02",
    stage: "Interim Certificate 3 issued: paving laid, kerbs and markings going in",
    certs: [
      { date: "2026-04-03", progress: { 1: 100, 2: 100, 3: 40 }, prelims: 6, pcDone: [], status: "paid" },
      { date: "2026-05-15", progress: { 3: 100, 4: 100 }, prelims: 12, pcDone: [], status: "paid" },
      { date: "2026-06-26", progress: { 5: 100, 6: 50 }, prelims: 17, pcDone: [0], status: "approved" },
    ],
    variations: [
      { reference: "SI-01", description: "Change paving colour band at junctions to red chevrons (extra over)", qty: 64, unit: "m2", rate: 2400, completed: true, issued: 70 },
      { reference: "SI-02", description: "Add 4 streetlight ducts across the carriageway", qty: 4, unit: "nr", rate: 145000, completed: true, issued: 40 },
    ],
    risks: [
      ["Weathered rock in cutting at Ch 0+180", "medium", "medium", "closed", "Ripper hired for two days; no blasting needed"],
      ["Paver batch colour variation", "low", "low", "open", "Mix pallets on site before laying"],
    ],
    issues: [["Pavers settling at a drain crossing", "medium", "resolved", "Relaid on compacted sub-base with haunched edge restraint"]],
  },
  "road-laterite": {
    start: "2025-11-03",
    stage: "Road handed over and final account agreed",
    certs: [
      { date: "2025-12-19", progress: { 1: 100, 2: 50 }, prelims: 6, pcDone: [], status: "paid" },
      { date: "2026-02-13", progress: { 2: 100, 3: 100 }, prelims: 12, pcDone: [0], status: "paid" },
      { date: "2026-04-10", progress: { 4: 100, 5: 100 }, prelims: 18, pcDone: [1], status: "paid" },
      { date: "2026-05-29", progress: { 6: 100 }, prelims: 22, pcDone: [2], status: "paid", releaseHalfRetention: true },
    ],
    finalAccount: true,
    variations: [
      { reference: "SI-01", description: "Extra culvert barrel at the Ch 0+820 stream crossing after flood survey", qty: 16, unit: "m", rateKey: "culvert", completed: true, issued: 45 },
      { reference: "SI-02", description: "Stone pitching to culvert inlets and outlets", qty: 42, unit: "m2", rate: 18500, completed: true, issued: 60 },
    ],
    risks: [
      ["Stream crossings flooding during the rains", "high", "high", "closed", "Culverts built in the dry season window"],
      ["Community land claims along the widening", "medium", "medium", "closed", "Agency paid compensation before mobilisation"],
    ],
    issues: [["Laterite borrow pit CBR dropped at depth", "medium", "resolved", "Second borrow pit opened 3 km away; haul allowed in the rate"]],
  },
};

const ROAD_PROVISIONAL = [
  ["Relocation of existing services (water, power) - Provisional sum", 3500000],
  ["Street lighting - PC sum", 6000000],
  ["Materials testing (CBR, compaction, cores) - Provisional sum", 1200000],
];

const ROAD_SUPPLIERS = {
  Material: ["Ogun Quarries Ltd", "Emerald Asphalt Plant", "Crest Cement Depot", "Unity Precast Concrete"],
  Plant: ["Ace Plant Hire", "Highway Equipment Leasing"],
  Consumable: ["Crest Cement Depot"],
};

export function roadScheme(design) {
  const model = buildRoadModel(design);
  const lines = roadLines(model);
  const itemFor = (l, i) => ({
    sn: i + 1,
    qty: l.qty,
    unit: l.unit,
    rate: 0,
    description: l.quiv,
    takeoffLine: l.takeoffLine,
    materialName: "",
    level: l.level,
    type: l.type,
    code: `${l.takeoffLine}:${l.key}:${l.level}`.toLowerCase().replace(/\s+/g, "-"),
    category: l.category,
    trade: l.trade,
    discipline: "structural",
    appliedRateKey: l.quiv,
    completed: false,
    percentComplete: 0,
    elementIds: l.elements.map((e) => e.id),
    elementQuantities: l.elements.map((e) => ({ id: e.id, qty: e.qty })),
    elementQuantitiesEstimated: false,
  });
  // Variations priced "at the bill rate" of a line pick that line's first band.
  const cut = sum(model.sections, (s) => s.cut);
  const fill = sum(model.sections, (s) => s.fill);
  return {
    design,
    model,
    lines,
    tag: "CIVIQ",
    phases: ROAD_PHASES,
    stage: ROAD_STAGES[design.key],
    provisional: ROAD_PROVISIONAL,
    suppliers: ROAD_SUPPLIERS,
    itemFor,
    modelTitle: `${design.title}.dwg`,
    modelDisciplines: ["structural"],
    label: design.label,
    summary: `${design.title}, ${design.length} m long with a ${design.carriageway} m carriageway, at ${design.location}. Ground: ${design.soil}. Earthworks: ${Math.round(cut).toLocaleString()} m3 cut, ${Math.round(fill).toLocaleString()} m3 fill.`,
    toolLine:
      "Corridor model: pavement layers, kerbs, drains and culverts between 20 m stations as an IFC model. Lines are measured per chainage band, the way CIVIQ extracts them.",
    storeyLevels: [[ROAD_STOREY, 0]],
  };
}
