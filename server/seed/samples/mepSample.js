// MEP samples: the services for each sample duplex, as Revit MEP would take
// them off. The rooms come from the same duplex model the QUIV samples use, so
// an MEP sample and its QUIV sample describe one building.
//
// Electrical (points, fittings, boards, supply), plumbing and drainage (water
// pipework, soil and waste, sanitary fittings, storage and pumping), and air
// conditioning, ventilation and fire safety. Every fitting and pipe run is an
// element of the MEP IFC model, and each bill line keeps the element IDs it was
// measured from, so the 3D viewer can link the two both ways.
//
// Pure: no database, no network.

import { buildDuplex, LEVELS } from "./duplexModel.js";

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

const EXTERNAL = "External";

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
function cyl(cx, cy, z0, r, h) {
  return { kind: "cyl", cx, cy, z: z0, r, h };
}

// ── The services model ─────────────────────────────────────────────────────
export function buildMepModel(design) {
  const duplex = buildDuplex(design);
  const H = design.storeyHeight;
  const W = design.xs[design.xs.length - 1];
  const D = design.ys[design.ys.length - 1];
  let nextId = design.baseId + 60000;
  const elements = [];
  const add = (el) => {
    const e = { id: nextId, discipline: "mep", ...el };
    nextId += 1;
    elements.push(e);
    return e;
  };

  // Rooms are the floor-finish bays of the duplex model.
  const rooms = duplex.elements
    .filter((e) => e.ifc === "IfcCovering" && e.predefined === "FLOORING")
    .map((c) => {
      const b = c.shapes[0];
      return {
        level: c.level,
        x0: b.x,
        y0: b.y,
        x1: b.x + b.dx,
        y1: b.y + b.dy,
        z: b.z,
        area: c.q.area,
        wet: Boolean(c.q.wet),
      };
    });
  for (const level of [LEVELS.ground, LEVELS.first]) {
    const onLevel = rooms.filter((r) => r.level === level);
    const wet = onLevel.filter((r) => r.wet);
    const dry = onLevel.filter((r) => !r.wet).sort((a, b) => b.area - a.area);
    wet.forEach((r, i) => {
      r.name = level === LEVELS.ground ? (i === 0 ? "Kitchen" : "Guest toilet") : `Bathroom ${i + 1}`;
      r.kind = level === LEVELS.ground && i === 0 ? "kitchen" : "bath";
    });
    dry.forEach((r, i) => {
      r.name = level === LEVELS.ground ? (i === 0 ? "Living room" : `Room G${i}`) : `Bedroom ${i + 1}`;
      r.kind = level === LEVELS.ground && i === 0 ? "living" : level === LEVELS.first ? "bedroom" : "room";
    });
  }

  const riser = { x: 0.45, y: 0.45 };
  const pipe = (level, style, ifc, predefined, name, typeName, x0, y0, z0, x1, y1, z1, size, extra = {}) => {
    const len = Math.abs(x1 - x0) + Math.abs(y1 - y0) + Math.abs(z1 - z0);
    if (len < 0.05) return null;
    const h = size / 2;
    const shape =
      Math.abs(z1 - z0) > 0.01
        ? box(x0 - h, y0 - h, Math.min(z0, z1), x0 + h, y0 + h, Math.max(z0, z1))
        : Math.abs(x1 - x0) > 0.01
          ? box(Math.min(x0, x1), y0 - h, z0 - h, Math.max(x0, x1), y0 + h, z0 + h)
          : box(x0 - h, Math.min(y0, y1), z0 - h, x0 + h, Math.max(y0, y1), z0 + h);
    return add({ ifc, predefined, name, typeName, level, style, shapes: [shape], q: { length: r3(len), count: 1 }, ...extra });
  };
  // An L-shaped horizontal run at height z: along x, then along y.
  const run = (level, kind, from, to, z, extra) => {
    const spec = PIPE_KINDS[kind];
    const a = pipe(level, spec.style, spec.ifc, spec.predefined, spec.name, spec.typeName, from.x, from.y, z, to.x, from.y, z, spec.size, extra);
    const b = pipe(level, spec.style, spec.ifc, spec.predefined, spec.name, spec.typeName, to.x, from.y, z, to.x, to.y, z, spec.size, extra);
    return [a, b].filter(Boolean);
  };
  const drop = (level, kind, at, z0, z1, extra) => {
    const spec = PIPE_KINDS[kind];
    return pipe(level, spec.style, spec.ifc, spec.predefined, spec.name, spec.typeName, at.x, at.y, z0, at.x, at.y, z1, spec.size, extra);
  };
  const fixture = (level, ifc, predefined, name, typeName, style, shape, q = {}, extra = {}) =>
    add({ ifc, predefined, name, typeName, level, style, shapes: [shape], q: { count: 1, ...q }, ...extra });

  for (const r of rooms) {
    const { level, x0, y0, x1, y1, z } = r;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const zc = z + H - 0.5;
    const tags = { room: r.name };

    // Lighting: one panel per ~9 m2, spread along the longer side.
    const nLights = Math.max(1, Math.round(r.area / 9));
    const alongX = x1 - x0 >= y1 - y0;
    for (let k = 0; k < nLights; k += 1) {
      const t = (k + 1) / (nLights + 1);
      const lx = alongX ? x0 + (x1 - x0) * t : cx;
      const ly = alongX ? cy : y0 + (y1 - y0) * t;
      fixture(level, "IfcLightFixture", "DIRECTIONSOURCE", `${r.name}: 18W LED panel`, "LED Panel 600x600 18W", "fixture", box(lx - 0.3, ly - 0.3, zc, lx + 0.3, ly + 0.3, zc + 0.04), {}, { tags, service: "lighting" });
    }
    fixture(level, "IfcSwitchingDevice", "TOGGLESWITCH", `${r.name}: light switch`, "Switch 1-Gang 1-Way", "electrical", box(x0 + 0.2, y0, z + 1.15, x0 + 0.29, y0 + 0.03, z + 1.24), {}, { tags, service: "switch" });

    const nSockets = r.kind === "kitchen" ? 4 : r.kind === "bath" ? 0 : 2 + (r.area > 14 ? 1 : 0);
    for (let k = 0; k < nSockets; k += 1) {
      const sx = x0 + ((x1 - x0) * (k + 1)) / (nSockets + 1);
      fixture(level, "IfcOutlet", "POWEROUTLET", `${r.name}: 13A twin socket`, "Socket 13A Twin Switched", "electrical", box(sx - 0.07, y0, z + 0.3, sx + 0.07, y0 + 0.03, z + 0.39), {}, { tags, service: "socket" });
    }

    if (r.kind === "bedroom" || r.kind === "living") {
      fixture(level, "IfcUnitaryEquipment", "SPLITSYSTEM", `${r.name}: 1.5HP split AC indoor unit`, "Split AC 1.5HP", "equipment", box(cx - 0.45, y1 - 0.25, z + 2.3, cx + 0.45, y1 - 0.02, z + 2.6), {}, { tags, service: "ac" });
    }
    if (!r.wet) {
      fixture(level, "IfcSensor", "SMOKESENSOR", `${r.name}: smoke detector`, "Smoke Detector Battery", "fixture", cyl(cx, cy, zc - 0.05, 0.07, 0.05), {}, { tags, service: "smoke" });
    }

    if (r.wet) {
      const stack = { x: x1 - 0.2, y: y0 + 0.2 };
      const outlets = [];
      if (r.kind === "kitchen") {
        const sink = fixture(level, "IfcSanitaryTerminal", "SINK", `${r.name}: stainless sink`, "Kitchen Sink Single Bowl", "sanitary", box(x0 + 0.2, y0 + 0.1, z + 0.85, x0 + 1.0, y0 + 0.6, z + 0.9), {}, { tags, service: "sink" });
        outlets.push({ el: sink, at: { x: x0 + 0.6, y: y0 + 0.35 }, waste: "waste" });
      } else {
        const wc = fixture(level, "IfcSanitaryTerminal", "TOILETPAN", `${r.name}: WC suite`, "WC Close-Coupled", "sanitary", box(x0 + 0.2, y1 - 0.75, z, x0 + 0.6, y1 - 0.05, z + 0.4), {}, { tags, service: "wc" });
        const basin = fixture(level, "IfcSanitaryTerminal", "WASHHANDBASIN", `${r.name}: wash hand basin`, "Basin Pedestal", "sanitary", box(x0 + 0.9, y1 - 0.5, z + 0.8, x0 + 1.4, y1 - 0.05, z + 0.95), {}, { tags, service: "basin" });
        const shower = fixture(level, "IfcSanitaryTerminal", "SHOWER", `${r.name}: shower`, "Shower Tray 900x900", "sanitary", box(x1 - 0.95, y1 - 0.95, z, x1 - 0.05, y1 - 0.05, z + 0.05), {}, { tags, service: "shower" });
        fixture(level, "IfcElectricAppliance", "FREESTANDINGWATERHEATER", `${r.name}: 50 litre water heater`, "Water Heater 50L", "equipment", cyl(x1 - 0.5, y0 + 0.35, z + 1.9, 0.22, 0.6), {}, { tags, service: "heater" });
        outlets.push({ el: wc, at: { x: x0 + 0.4, y: y1 - 0.4 }, waste: "soil" });
        outlets.push({ el: basin, at: { x: x0 + 1.15, y: y1 - 0.3 }, waste: "waste" });
        outlets.push({ el: shower, at: { x: x1 - 0.5, y: y1 - 0.5 }, waste: "waste" });
      }
      fixture(level, "IfcFan", "PROPELLORAXIAL", `${r.name}: extractor fan`, "Extractor Fan 150mm", "equipment", box(cx - 0.1, y1 - 0.05, z + 2.4, cx + 0.1, y1 - 0.01, z + 2.6), {}, { tags, service: "fan" });

      // Cold water: one feed at ceiling level from the riser to the room, then
      // a short branch and a drop to each outlet.
      const entry = { x: x0 + 0.2, y: y0 + 0.2 };
      run(level, "ppr20", riser, entry, zc - 0.1, { tags, service: "cold" });
      for (const o of outlets) {
        run(level, "ppr20", entry, o.at, zc - 0.1, { tags, service: "cold" });
        drop(level, "ppr20", o.at, z + 0.9, zc - 0.1, { tags, service: "cold" });
      }
      // Soil and waste at floor level to the room's stack, then the stack down.
      for (const o of outlets) run(level, o.waste === "soil" ? "pvc110" : "pvc50", o.at, stack, z + 0.05, { tags, service: o.waste });
      drop(level, "pvc110", stack, level === LEVELS.first ? z + 0.3 : -0.6, level === LEVELS.first ? -0.6 : z + 0.05, { tags, service: "soil" });
      r.stack = stack;
    }
  }

  // Boards, supply and earthing.
  for (const [level, z] of [[LEVELS.ground, 0], [LEVELS.first, H]]) {
    fixture(level, "IfcElectricDistributionBoard", "DISTRIBUTIONBOARD", `${level}: 12-way distribution board`, "Distribution Board 12-Way", "electrical", box(0.3, 0.02, z + 1.5, 0.75, 0.14, z + 2.1), {}, { service: "db" });
    for (const x of [1.3, W - 1.5]) {
      fixture(level, "IfcFireSuppressionTerminal", null, `${level}: 9kg fire extinguisher`, "Fire Extinguisher DP 9kg", "equipment", box(x, 0.05, z + 1.0, x + 0.2, 0.25, z + 1.6), {}, { service: "extinguisher" });
    }
  }
  fixture(LEVELS.ground, "IfcSwitchingDevice", "SWITCHDISCONNECTOR", "Generator changeover switch 63A", "Changeover Switch 63A", "electrical", box(0.9, 0.02, 1.5, 1.2, 0.14, 1.8), {}, { service: "changeover" });
  const cableRuns = [
    [{ x: W + 5, y: -4 }, { x: 0.5, y: -4 }],
    [{ x: 0.5, y: -4 }, { x: 0.5, y: 0.05 }],
  ];
  for (const [a, b] of cableRuns) {
    const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    add({ ifc: "IfcCableSegment", predefined: "CABLESEGMENT", name: "16mm2 4-core armoured cable, generator to board", typeName: "Armoured Cable 16mm2 4C", level: EXTERNAL, storey: LEVELS.foundation, style: "cable", shapes: [box(a.x, a.y - 0.03, -0.63, b.x, b.y + 0.03, -0.57)], q: { length: r3(len) }, service: "armoured" });
  }
  // External lights on the elevations.
  for (const [x, y] of [[W / 4, 0], [(3 * W) / 4, 0], [W / 4, D], [(3 * W) / 4, D], [0, D / 2], [W, D / 2]]) {
    fixture(EXTERNAL, "IfcLightFixture", "DIRECTIONSOURCE", "External LED bulkhead light", "LED Bulkhead External", "fixture", box(x - 0.12, y - 0.06, 2.55, x + 0.12, y + 0.06, 2.75), {}, { storey: LEVELS.ground, service: "bulkhead" });
  }

  // Water storage and pumping, and the mains to the riser.
  const tankAt = { x: W + 2.5, y: D - 1.5 };
  fixture(EXTERNAL, "IfcTank", "STORAGE", "2,000 litre water tank on stand", "Water Tank PE 2000L", "equipment", cyl(tankAt.x, tankAt.y, 3.0, 0.75, 1.6), {}, { storey: LEVELS.ground, service: "tank" });
  fixture(EXTERNAL, "IfcPump", "ENDSUCTION", "1HP surface water pump", "Pump Surface 1HP", "equipment", box(tankAt.x - 0.3, tankAt.y - 1.4, 0, tankAt.x + 0.3, tankAt.y - 1.0, 0.35), {}, { storey: LEVELS.ground, service: "pump" });
  run(EXTERNAL, "ppr25", { x: tankAt.x, y: D + 0.5 }, { x: riser.x, y: D + 0.5 }, 0.3, { storey: LEVELS.ground, service: "mains" });
  pipe(EXTERNAL, "pipeCold", "IfcPipeSegment", "RIGIDSEGMENT", "25mm PPR cold water main", "PPR Pipe 25mm", riser.x, D + 0.5, 0.3, riser.x, riser.y, 0.3, 0.03, { storey: LEVELS.ground, service: "mains" });
  pipe(LEVELS.ground, "pipeCold", "IfcPipeSegment", "RIGIDSEGMENT", "25mm PPR riser", "PPR Pipe 25mm", riser.x, riser.y, 0.3, riser.x, riser.y, 2 * H - 0.6, 0.03, { service: "mains" });

  // Below-ground drainage: a chamber outside each stack, then a run along the
  // front to the last chamber by the septic tank.
  const stacks = rooms.filter((r) => r.stack && r.level === LEVELS.ground).map((r) => r.stack);
  const upper = rooms.filter((r) => r.stack && r.level === LEVELS.first).map((r) => r.stack);
  const allStacks = [...stacks, ...upper.filter((u) => !stacks.some((s) => Math.abs(s.x - u.x) < 0.5 && Math.abs(s.y - u.y) < 0.5))];
  const chamberXs = [...new Set(allStacks.map((s) => r2(s.x)))].sort((a, b) => a - b);
  for (const s of allStacks) {
    pipe(EXTERNAL, "pipeWaste", "IfcPipeSegment", "RIGIDSEGMENT", "110mm uPVC drain, stack to chamber", "uPVC Pipe 110mm", s.x, s.y, -0.6, s.x, -1.5, -0.6, 0.11, { storey: LEVELS.foundation, service: "drain" });
  }
  const chambers = [...chamberXs, W + 3];
  chambers.forEach((x) => {
    fixture(EXTERNAL, "IfcDistributionChamberElement", "INSPECTIONCHAMBER", "Inspection chamber 600x450", "Inspection Chamber 600x450", "pipeWaste", box(x - 0.3, -1.725, -0.9, x + 0.3, -1.275, 0), {}, { storey: LEVELS.foundation, service: "manhole" });
  });
  pipe(EXTERNAL, "pipeWaste", "IfcPipeSegment", "RIGIDSEGMENT", "110mm uPVC drain between chambers", "uPVC Pipe 110mm", chambers[0], -1.5, -0.8, W + 3, -1.5, -0.8, 0.11, { storey: LEVELS.foundation, service: "drain" });

  return { design, duplex, rooms, elements };
}

const PIPE_KINDS = {
  ppr20: { style: "pipeCold", ifc: "IfcPipeSegment", predefined: "RIGIDSEGMENT", name: "20mm PPR cold water branch", typeName: "PPR Pipe 20mm", size: 0.025 },
  ppr25: { style: "pipeCold", ifc: "IfcPipeSegment", predefined: "RIGIDSEGMENT", name: "25mm PPR cold water main", typeName: "PPR Pipe 25mm", size: 0.03 },
  pvc50: { style: "pipeWaste", ifc: "IfcPipeSegment", predefined: "RIGIDSEGMENT", name: "50mm uPVC waste pipe", typeName: "uPVC Pipe 50mm", size: 0.05 },
  pvc110: { style: "pipeWaste", ifc: "IfcPipeSegment", predefined: "RIGIDSEGMENT", name: "110mm uPVC soil pipe", typeName: "uPVC Pipe 110mm", size: 0.11 },
};

// ── Measured lines ─────────────────────────────────────────────────────────
// Same shape as the duplex lines (sampleProject.js measuredLines), so the one
// assembler prices, values and programmes them.
const E = { category: "Electrical", trade: "Electrical Installations" };
const P = { category: "Plumbing", trade: "Plumbing & Drainage" };
const M = { category: "HVAC", trade: "HVAC" };

// [key, service filter, group, phase, unit, qty basis, takeoffLine, short, long, buildup, type]
const LINE_DEFS = [
  ["light-point", ["lighting"], E, 1, "nr", "count", "Lighting Points", "Lighting Points – 20mm conduit, 1.5mm2 wiring and switch share", "Lighting point in 20mm PVC conduit wired in 1.5mm2 cable, including share of switch", "lightPoint", "Lighting Point"],
  ["socket-point", ["socket"], E, 1, "nr", "count", "Power Points", "Power Points – 13A twin socket, 2.5mm2 radial", "13A twin switched socket outlet point in 20mm conduit wired in 2.5mm2 cable", "socketPoint", "Socket Outlet Point"],
  ["ac-point", ["ac"], E, 1, "nr", "count", "Power Points", "Power Points – AC point, 6mm2 radial", "Air conditioner power point in 25mm conduit wired in 6mm2 cable", "acPoint", "AC Power Point"],
  ["cold-branch", ["cold"], P, 2, "m", "length", "Pipes", "Pipes – 20mm PPR cold water branches", "20mm PPR cold water pipe with fittings, fixed to walls and soffits", "ppr20", "PPR Pipe 20mm"],
  ["waste", ["waste"], P, 2, "m", "length", "Pipes", "Pipes – 50mm uPVC waste", "50mm uPVC waste pipe with fittings from basins, showers and sinks", "pvc50", "uPVC Pipe 50mm"],
  ["soil", ["soil"], P, 2, "m", "length", "Pipes", "Pipes – 110mm uPVC soil and stacks", "110mm uPVC soil pipe and stacks with fittings", "pvc110", "uPVC Pipe 110mm"],
  ["mains", ["mains"], P, 2, "m", "length", "Pipes", "Pipes – 25mm PPR main and riser", "25mm PPR cold water main from tank and rising main", "ppr25", "PPR Pipe 25mm"],
  ["drain", ["drain"], P, 2, "m", "length", "Pipes", "Pipes – 110mm uPVC below-ground drain", "110mm uPVC below-ground drain in trench, bedded and surrounded", "pvc110", "uPVC Pipe 110mm"],
  ["manhole", ["manhole"], P, 2, "nr", "count", "Plumbing Fixtures", "Plumbing Fixtures – Inspection chamber 600x450", "Inspection chamber 600x450 internal, blockwork on concrete base, with cover", "manhole", "Inspection Chamber"],
  ["led-panel", ["lighting"], E, 3, "nr", "count", "Lighting Fixtures", "Lighting Fixtures – 18W LED panel 600x600", "18W LED ceiling panel light fitting, fixed and connected", "ledPanel", "LED Panel 600x600 18W"],
  ["bulkhead", ["bulkhead"], E, 3, "nr", "count", "Lighting Fixtures", "Lighting Fixtures – LED bulkhead, external", "LED bulkhead light fitting to external walls", "ledBulk", "LED Bulkhead External"],
  ["db", ["db"], E, 3, "nr", "count", "Electrical Equipment", "Electrical Equipment – 12-way distribution board", "12-way distribution board with MCBs and RCD, installed and terminated", "dbBoard", "Distribution Board 12-Way"],
  ["changeover", ["changeover"], E, 3, "nr", "count", "Electrical Equipment", "Electrical Equipment – 63A changeover switch", "63A changeover switch for generator supply", "changeover", "Changeover Switch 63A"],
  ["armoured", ["armoured"], E, 3, "m", "length", "Cable Trays", "Cables – 16mm2 4-core armoured, generator supply", "16mm2 4-core armoured cable from generator house, laid in trench", "armoured", "Armoured Cable 16mm2 4C"],
  ["wc", ["wc"], P, 4, "nr", "count", "Plumbing Fixtures", "Plumbing Fixtures – WC suite", "Close-coupled WC suite with seat and cistern, fixed and connected", "wc", "WC Close-Coupled"],
  ["basin", ["basin"], P, 4, "nr", "count", "Plumbing Fixtures", "Plumbing Fixtures – Wash hand basin", "Wash hand basin on pedestal with mixer tap", "basin", "Basin Pedestal"],
  ["shower", ["shower"], P, 4, "nr", "count", "Plumbing Fixtures", "Plumbing Fixtures – Shower set", "Shower tray, mixer and head, fixed and connected", "shower", "Shower Tray 900x900"],
  ["sink", ["sink"], P, 4, "nr", "count", "Plumbing Fixtures", "Plumbing Fixtures – Kitchen sink", "Stainless steel kitchen sink with mixer tap", "sink", "Kitchen Sink Single Bowl"],
  ["heater", ["heater"], P, 4, "nr", "count", "Plumbing Equipment", "Plumbing Equipment – 50 litre water heater", "50 litre electric water heater, fixed, piped and wired", "heater", "Water Heater 50L"],
  ["tank", ["tank"], P, 4, "nr", "count", "Plumbing Equipment", "Plumbing Equipment – 2,000 litre water tank", "2,000 litre polyethylene water storage tank on stand", "tank", "Water Tank PE 2000L"],
  ["pump", ["pump"], P, 4, "nr", "count", "Plumbing Equipment", "Plumbing Equipment – 1HP surface pump", "1HP surface water pump with pressure switch", "pump", "Pump Surface 1HP"],
  ["split-ac", ["ac"], M, 5, "nr", "count", "Mechanical Equipment", "Mechanical Equipment – 1.5HP split air conditioner", "1.5HP split air conditioner with 3m installation kit, installed and commissioned", "splitAc", "Split AC 1.5HP"],
  ["fan", ["fan"], M, 5, "nr", "count", "Mechanical Equipment", "Mechanical Equipment – Extractor fan 150mm", "150mm extractor fan to wet areas, wired from lighting circuit", "exhaustFan", "Extractor Fan 150mm"],
  ["smoke", ["smoke"], E, 5, "nr", "count", "Fire Alarm Devices", "Fire Alarm Devices – Smoke detector", "Battery smoke detector fixed to ceiling", "smoke", "Smoke Detector Battery"],
  ["extinguisher", ["extinguisher"], P, 5, "nr", "count", "Fire Protection", "Fire Protection – 9kg fire extinguisher", "9kg dry powder fire extinguisher on wall bracket", "extinguisher", "Fire Extinguisher DP 9kg"],
];

export function mepLines(mep) {
  const lines = [];
  const levels = [LEVELS.ground, LEVELS.first, EXTERNAL];
  for (const [key, services, group, phase, unit, basis, takeoffLine, quiv, heron, buildup, type] of LINE_DEFS) {
    for (const level of levels) {
      const els = mep.elements.filter((e) => e.level === level && services.includes(e.service));
      if (!els.length) continue;
      const elements = els.map((e) => ({ id: e.id, qty: basis === "length" ? e.q.length : 1 }));
      const qty = r2(sum(elements, (x) => x.qty));
      if (!(qty > 0)) continue;
      lines.push({ key, section: group.trade, ...group, phase, unit, takeoffLine, quiv, heron, buildup, type, level, discipline: "mep", elements, qty });
    }
  }
  // Earthing and commissioning have no element in the model.
  lines.push({ key: "earthing", section: E.trade, ...E, phase: 3, unit: "set", takeoffLine: "Electrical Equipment", quiv: "Electrical Equipment – Earthing system", heron: "Copper earth rod, clamp and inspection pit, tested", buildup: "earthing", type: "Earthing", level: EXTERNAL, discipline: "mep", elements: [], qty: 1 });
  lines.push({ key: "test-elec", section: E.trade, ...E, phase: 6, unit: "item", takeoffLine: "Testing", quiv: "Testing – Electrical installation test and certificate", heron: "Test and commission the electrical installation and issue a completion certificate", buildup: "testElec", type: "Testing", level: EXTERNAL, discipline: "mep", elements: [], qty: 1 });
  lines.push({ key: "test-plumb", section: P.trade, ...P, phase: 6, unit: "item", takeoffLine: "Testing", quiv: "Testing – Plumbing pressure test and flush", heron: "Pressure test, flush and commission the plumbing installation", buildup: "testPlumb", type: "Testing", level: EXTERNAL, discipline: "mep", elements: [], qty: 1 });
  return lines;
}

// ── Programme and stage plans ─────────────────────────────────────────────
export const MEP_PHASES = [
  { n: 1, name: "Electrical first fix: conduits, boxes and points", days: 18, resource: "Electricians (first fix)", priority: "high", lead: "MEP supervisor" },
  { n: 2, name: "Plumbing and drainage rough-in", days: 16, resource: "Plumbers", priority: "high", lead: "MEP supervisor" },
  { n: 3, name: "Electrical second fix: fittings, boards and supply", days: 14, resource: "Electricians (second fix)", lead: "MEP supervisor" },
  { n: 4, name: "Sanitary fittings, water storage and pumping", days: 12, resource: "Plumbers", lead: "MEP supervisor" },
  { n: 5, name: "Air conditioning, ventilation and fire safety", days: 10, resource: "HVAC technicians", lead: "MEP supervisor", slack: 6 },
  { n: 6, name: "Testing and commissioning", days: 5, resource: "MEP engineer", lead: "MEP engineer" },
];

const MEP_STAGES = {
  "duplex-strip": {
    start: "2026-08-10",
    stage: "Interim Certificate 1 issued: conduits cast into the first floor slab, plumbing sleeves in",
    certs: [{ date: "2026-09-11", progress: { 1: 45, 2: 20 }, prelims: 5, pcDone: [], status: "approved" }],
    variations: [
      { reference: "MI-01", description: "Add outdoor socket and garden light circuit (client request)", qty: 1, unit: "item", rate: 185000, completed: false, issued: 21 },
    ],
    risks: [
      ["Conduit crushed during slab pour", "medium", "medium", "mitigating", "Electrician attends every pour; conduits taped and tested before concreting"],
      ["Copper cable price rise (FX-driven)", "high", "medium", "open", "Buy the full cable schedule once first fix is signed off"],
    ],
    issues: [["Two socket boxes set out on the wrong wall in Bedroom 2", "low", "resolved", "Moved before blockwork plastering"]],
  },
  "duplex-pad-strip": {
    start: "2026-06-15",
    stage: "Interim Certificate 2 issued: first fix complete, pipework pressure-tested, second fix started",
    certs: [
      { date: "2026-07-17", progress: { 1: 100, 2: 60 }, prelims: 5, pcDone: [], status: "paid" },
      { date: "2026-08-28", progress: { 2: 100, 3: 40 }, prelims: 10, pcDone: [], status: "approved" },
    ],
    variations: [
      { reference: "MI-01", description: "Upgrade master bathroom to rain shower with thermostatic mixer", qty: 1, unit: "nr", rate: 265000, completed: true, issued: 30 },
      { reference: "MI-02", description: "Add CCTV conduit and back boxes (6 camera points)", qty: 6, unit: "nr", rate: 22000, completed: false, issued: 55 },
    ],
    risks: [
      ["Late decision on AC brand holding up AC points", "medium", "medium", "closed", "Client chose 1.5HP units across the board"],
      ["Low mains water pressure in Lokogoma", "medium", "high", "mitigating", "Pump and pressure switch sized for two floors; tank on 3m stand"],
    ],
    issues: [["Leak at 20mm PPR joint in Bathroom 1 during pressure test", "medium", "resolved", "Joint re-fused and retested at 10 bar"]],
  },
  "duplex-raft": {
    start: "2026-04-06",
    stage: "Interim Certificate 3 issued: second fix and sanitary fittings in, AC going in",
    certs: [
      { date: "2026-05-08", progress: { 1: 100, 2: 50 }, prelims: 5, pcDone: [], status: "paid" },
      { date: "2026-06-19", progress: { 2: 100, 3: 100, 4: 30 }, prelims: 10, pcDone: [], status: "paid" },
      { date: "2026-07-31", progress: { 4: 100, 5: 40 }, prelims: 15, pcDone: [0], status: "approved" },
    ],
    variations: [
      { reference: "MI-01", description: "Lift pump chamber above flood level (high water table)", qty: 1, unit: "item", rate: 340000, completed: true, issued: 20 },
      { reference: "MI-02", description: "Add one extra 1.5HP split unit to the family lounge", qty: 1, unit: "nr", rate: 610000, completed: false, issued: 90 },
    ],
    risks: [
      ["Ground water entering below-ground drains during wet season", "high", "medium", "mitigating", "Chambers sealed and benched; drains tested before backfill"],
      ["Imported AC units delayed at port", "medium", "high", "open", "Local stock identified as fallback"],
    ],
    issues: [
      ["Distribution board delivered with wrong MCB ratings", "medium", "resolved", "Supplier exchanged the MCBs"],
      ["Soil stack clashes with first floor beam at grid 3", "high", "resolved", "Stack offset 300mm with two 45 degree bends; engineer approved"],
    ],
  },
  "duplex-pile": {
    start: "2025-12-01",
    stage: "Services complete, commissioned and final account agreed",
    certs: [
      { date: "2026-01-16", progress: { 1: 100, 2: 40 }, prelims: 6, pcDone: [], status: "paid" },
      { date: "2026-03-13", progress: { 2: 100, 3: 100 }, prelims: 12, pcDone: [], status: "paid" },
      { date: "2026-05-08", progress: { 4: 100, 5: 100 }, prelims: 18, pcDone: [0, 1], status: "paid" },
      { date: "2026-06-26", progress: { 6: 100 }, prelims: 22, pcDone: [0, 1, 2], status: "paid", releaseHalfRetention: true },
    ],
    finalAccount: true,
    variations: [
      { reference: "MI-01", description: "Relocate inspection chambers clear of the terrace boundary", qty: 2, unit: "nr", rate: 95000, completed: true, issued: 25 },
      { reference: "MI-02", description: "Add surge protection device to each distribution board", qty: 2, unit: "nr", rate: 68000, completed: true, issued: 80 },
    ],
    risks: [
      ["Reclaimed sand settling under below-ground drains", "medium", "high", "closed", "Drains laid on 150mm granular bed with flexible joints"],
      ["Retention held over commissioning snags", "low", "low", "accepted", "Snag list closed; half retention released on Cert 4"],
    ],
    issues: [["Nuisance tripping on first floor RCD", "medium", "resolved", "Water heater earth fault found and fixed"]],
  },
};

const MEP_PROVISIONAL = [
  ["Utility meter and service connection - Provisional sum", 850000],
  ["Borehole drilling and submersible pump - PC sum", 2400000],
  ["Solar inverter and battery backup - PC sum", 4200000],
];

const MEP_SUPPLIERS = {
  Material: ["Ikeja Electrical Traders", "Ojo Plumbing Supplies Ltd", "Cool Air Systems Nig. Ltd", "Brightline Lighting Co."],
  Plant: [],
  Consumable: ["Ikeja Electrical Traders"],
};

export function mepScheme(design) {
  const mep = buildMepModel(design);
  const lines = mepLines(mep);
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
    discipline: "mep",
    appliedRateKey: l.heron,
    completed: false,
    percentComplete: 0,
    elementIds: l.elements.map((e) => e.id),
    elementQuantities: l.elements.map((e) => ({ id: e.id, qty: e.qty })),
    elementQuantitiesEstimated: false,
  });
  const count = (svc) => mep.elements.filter((e) => e.service === svc).length;
  return {
    design: { ...design, title: `${design.title} - MEP Services`, key: design.key },
    model: mep,
    lines,
    tag: "Revit MEP",
    phases: MEP_PHASES,
    stage: MEP_STAGES[design.key],
    provisional: MEP_PROVISIONAL,
    suppliers: MEP_SUPPLIERS,
    itemFor,
    modelTitle: `${design.title} - MEP.rvt`,
    modelDisciplines: ["mep"],
    label: design.foundationLabel.replace(/ foundation$/i, " duplex"),
    summary: `Electrical, plumbing and drainage, and air conditioning for the ${design.title.replace(/ - .*$/, "")} at ${design.location}: ${count("lighting")} light points, ${count("socket")} sockets, ${count("ac")} split units and ${count("wc") + count("basin") + count("shower") + count("sink")} sanitary fittings.`,
    toolLine:
      "3D Model: the MEP IFC model. Pick a bill line to see the fittings and pipe runs it was measured from, or click a fitting to find its line.",
  };
}
