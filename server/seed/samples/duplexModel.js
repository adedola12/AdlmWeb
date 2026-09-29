// Parametric duplex model for the sample projects.
//
// One building description produces BOTH the IFC model (ifcWriter.js) and the
// measured quantities (sampleBill.js), so every bill line's quantity is the sum
// of real elements in the model, and every element ID a line cites exists in
// the IFC. That is the same contract the QUIV plugin keeps with a Revit model.
//
// Units are metres. Ground-floor finished level (FFL) is 0.000; natural ground
// is 450 mm below it.

export const GROUND_LEVEL = -0.45;

// Four designs of a typical Nigerian duplex. Each differs in foundation (the
// point of the set) and also in plan, so the samples do not read as one
// building with four bottoms.
export const DESIGNS = [
  {
    key: "duplex-strip",
    order: 1,
    foundation: "strip",
    foundationLabel: "Strip foundation",
    title: "4-Bedroom Duplex - Strip Foundation",
    clientName: "Mr & Mrs Adebayo Ogunleye",
    location: "Oluyole Estate, Ibadan",
    soil: "Firm lateritic clay, allowable bearing 150 kN/m2",
    // Column grid lines (m). Bays are the rooms.
    xs: [0, 4.2, 8.4, 12.6],
    ys: [0, 3.9, 7.8, 11.4],
    storeyHeight: 3.3,
    roofPitchDeg: 22,
    baseId: 410000,
  },
  {
    key: "duplex-pad-strip",
    order: 2,
    foundation: "pad-strip",
    foundationLabel: "Pad and strip foundation",
    title: "4-Bedroom Duplex with Family Lounge - Pad & Strip Foundation",
    clientName: "Engr. Chidi Nwosu",
    location: "Lokogoma District, Abuja",
    soil: "Stiff sandy clay over weathered rock, allowable bearing 200 kN/m2",
    xs: [0, 3.9, 8.1, 12.0, 15.6],
    ys: [0, 4.2, 8.1, 11.7],
    storeyHeight: 3.3,
    roofPitchDeg: 25,
    baseId: 520000,
  },
  {
    key: "duplex-raft",
    order: 3,
    foundation: "raft",
    foundationLabel: "Raft foundation",
    title: "5-Bedroom Duplex - Raft Foundation",
    clientName: "Mrs Funmilayo Bakare",
    location: "Lekki Phase 1, Lagos",
    soil: "Soft silty clay, allowable bearing 60 kN/m2, water table 1.8 m",
    xs: [0, 4.5, 9.0, 13.2, 17.1],
    ys: [0, 4.2, 8.4, 12.3],
    storeyHeight: 3.45,
    roofPitchDeg: 20,
    baseId: 630000,
  },
  {
    key: "duplex-pile",
    order: 4,
    foundation: "pile",
    foundationLabel: "Pile foundation",
    title: "4-Bedroom Terrace Duplex - Bored Pile Foundation",
    clientName: "Harbourview Homes Ltd",
    location: "Ikate, Lekki, Lagos",
    soil: "Loose reclaimed sand over peat to 9 m, dense sand below",
    xs: [0, 3.6, 7.5],
    ys: [0, 4.2, 8.1, 12.3, 16.2],
    storeyHeight: 3.3,
    roofPitchDeg: 25,
    baseId: 740000,
  },
];

export const LEVELS = {
  foundation: "Foundation",
  ground: "Ground Floor",
  first: "First Floor",
  roof: "Roof",
};

const COL = 0.23; // column / beam width
const BEAM_D = 0.45;
const SLAB_T = 0.15;
const EXT_WALL = 0.225;
const INT_WALL = 0.15;

const r3 = (n) => Math.round(n * 1000) / 1000;

// Geometry helpers. A box is axis-aligned; a prism is a closed profile in the
// xz or yz plane extruded between two ordinates on the remaining axis.
function box(x0, y0, z0, x1, y1, z1) {
  return {
    kind: "box",
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    z: Math.min(z0, z1),
    dx: Math.abs(x1 - x0),
    dy: Math.abs(y1 - y0),
    dz: Math.abs(z1 - z0),
  };
}
function cyl(cx, cy, z0, r, h) {
  return { kind: "cyl", cx, cy, z: z0, r, h };
}
function prism(plane, points, from, to) {
  return { kind: "prism", plane, points, from, to };
}

export function boxVolume(g) {
  return g.dx * g.dy * g.dz;
}

function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function solidVolume(g) {
  if (g.kind === "box") return boxVolume(g);
  if (g.kind === "cyl") return Math.PI * g.r * g.r * g.h;
  return polygonArea(g.points) * Math.abs(g.to - g.from);
}

// Build the element list for one design.
//
// Each element: { id, ifc, predefined, name, typeName, level, discipline,
// style, shapes:[geometry], q:{...measured quantities} }.
export function buildDuplex(design) {
  const { xs, ys, storeyHeight: H, foundation } = design;
  const W = xs[xs.length - 1];
  const D = ys[ys.length - 1];
  let nextId = design.baseId;
  const elements = [];
  const add = (el) => {
    const e = { id: nextId, ...el };
    nextId += 1;
    elements.push(e);
    return e;
  };

  const floors = [
    { level: LEVELS.ground, z: 0 },
    { level: LEVELS.first, z: H },
  ];
  const roofZ = 2 * H;

  // Grid segments: each run of wall/beam between two adjacent columns.
  const segments = [];
  ys.forEach((y, j) => {
    for (let i = 0; i < xs.length - 1; i += 1) {
      segments.push({
        dir: "x",
        a: xs[i],
        b: xs[i + 1],
        at: y,
        external: j === 0 || j === ys.length - 1,
        i,
        j,
      });
    }
  });
  xs.forEach((x, i) => {
    for (let j = 0; j < ys.length - 1; j += 1) {
      segments.push({
        dir: "y",
        a: ys[j],
        b: ys[j + 1],
        at: x,
        external: i === 0 || i === xs.length - 1,
        i,
        j,
      });
    }
  });
  const nodes = [];
  xs.forEach((x) => ys.forEach((y) => nodes.push({ x, y })));

  // A horizontal member on a segment: runs between column faces.
  const runBox = (s, width, z0, z1, { full = false } = {}) => {
    const trim = full ? -width / 2 : COL / 2;
    if (s.dir === "x") {
      return box(s.a + trim, s.at - width / 2, z0, s.b - trim, s.at + width / 2, z1);
    }
    return box(s.at - width / 2, s.a + trim, z0, s.at + width / 2, s.b - trim, z1);
  };
  const segLen = (s, full = false) => s.b - s.a + (full ? 0 : -COL);

  // ── Foundations ─────────────────────────────────────────────────────────
  const fnd = LEVELS.foundation;
  const excavation = []; // { elementId, volume, supportArea, depth }

  if (foundation === "strip" || foundation === "pad-strip") {
    const stripW = foundation === "strip" ? 0.675 : 0.6;
    const stripBottom = foundation === "strip" ? -1.2 : -0.9;
    const stripTop = stripBottom + 0.225;
    for (const s of segments) {
      const g = runBox(s, stripW, stripBottom, stripTop, {
        full: foundation === "strip",
      });
      const len = foundation === "strip" ? s.b - s.a : segLen(s) - 1.2 + COL;
      const el = add({
        ifc: "IfcFooting",
        predefined: "STRIP_FOOTING",
        name: `Strip footing ${Math.round(stripW * 1000)}x225`,
        typeName: `Strip Footing ${Math.round(stripW * 1000)} x 225`,
        level: fnd,
        discipline: "structural",
        style: "concrete",
        shapes: [g],
        q: {
          concrete: solidVolume(g),
          blinding: g.dx * g.dy * 0.05,
          formwork: 0,
          rebar: solidVolume(g) * 60,
          length: len,
        },
      });
      const depth = GROUND_LEVEL - stripBottom;
      excavation.push({
        elementId: el.id,
        kind: "trench",
        volume: g.dx * g.dy * depth,
        supportArea: 2 * Math.max(g.dx, g.dy) * depth,
        depth,
      });
      // Sandcrete block wall from footing up to the underside of the ground slab.
      const wallT = EXT_WALL;
      const wg = runBox(s, wallT, stripTop, -SLAB_T, {
        full: foundation === "strip",
      });
      add({
        ifc: "IfcWall",
        name: "Substructure wall 225mm sandcrete block",
        typeName: "Basic Wall: 225mm Sandcrete Block (substructure)",
        level: fnd,
        discipline: "structural",
        style: "blockSub",
        shapes: [wg],
        q: {
          blockArea: Math.max(wg.dx, wg.dy) * wg.dz,
          belowGround: Math.max(wg.dx, wg.dy) * wallT * (GROUND_LEVEL - stripTop),
        },
      });
    }
  }

  if (foundation === "pad-strip") {
    for (const n of nodes) {
      const g = box(n.x - 0.6, n.y - 0.6, -1.5, n.x + 0.6, n.y + 0.6, -1.2);
      const el = add({
        ifc: "IfcFooting",
        predefined: "PAD_FOOTING",
        name: "Pad footing 1200x1200x300",
        typeName: "Pad Footing 1200 x 1200 x 300",
        level: fnd,
        discipline: "structural",
        style: "concrete",
        shapes: [g],
        q: {
          concrete: solidVolume(g),
          blinding: 1.2 * 1.2 * 0.05,
          formwork: 4 * 1.2 * 0.3,
          rebar: solidVolume(g) * 95,
        },
      });
      const depth = GROUND_LEVEL + 1.5;
      excavation.push({
        elementId: el.id,
        kind: "pit",
        volume: 1.2 * 1.2 * depth,
        supportArea: 4 * 1.2 * depth,
        depth,
      });
    }
  }

  if (foundation === "raft") {
    const o = 0.45 + COL / 2;
    const g = box(-o, -o, -1.05, W + o, D + o, -0.75);
    const perimeter = 2 * (W + 2 * o + D + 2 * o);
    // Thickened edge (downstand) under the raft perimeter.
    const e = 0.45;
    const edges = [
      box(-o, -o, -1.5, W + o, -o + e, -1.05),
      box(-o, D + o - e, -1.5, W + o, D + o, -1.05),
      box(-o, -o + e, -1.5, -o + e, D + o - e, -1.05),
      box(W + o - e, -o + e, -1.5, W + o, D + o - e, -1.05),
    ];
    const raftVol = solidVolume(g);
    const edgeVol = edges.reduce((a, b) => a + solidVolume(b), 0);
    const raft = add({
      ifc: "IfcSlab",
      predefined: "BASESLAB",
      name: "Raft slab 300mm with 450x450 thickened edge",
      typeName: "Foundation Slab: 300mm RC Raft",
      level: fnd,
      discipline: "structural",
      style: "concrete",
      shapes: [g, ...edges],
      q: {
        concrete: raftVol + edgeVol,
        blinding: (W + 2 * o) * (D + 2 * o) * 0.05,
        formwork: perimeter * (0.3 + 0.45),
        rebar: (raftVol + edgeVol) * 110,
        area: (W + 2 * o) * (D + 2 * o),
      },
    });
    excavation.push({
      elementId: raft.id,
      kind: "bulk",
      volume: (W + 2 * o + 1) * (D + 2 * o + 1) * (GROUND_LEVEL + 1.05),
      supportArea: 0,
      depth: GROUND_LEVEL + 1.05,
    });
    excavation.push({
      elementId: raft.id,
      kind: "trench",
      volume: perimeter * e * 0.45,
      supportArea: 0,
      depth: 0.45,
    });
    for (const s of segments) {
      const wg = runBox(s, EXT_WALL, -0.75, -SLAB_T, { full: true });
      add({
        ifc: "IfcWall",
        name: "Substructure wall 225mm sandcrete block",
        typeName: "Basic Wall: 225mm Sandcrete Block (substructure)",
        level: fnd,
        discipline: "structural",
        style: "blockSub",
        shapes: [wg],
        q: {
          blockArea: Math.max(wg.dx, wg.dy) * wg.dz,
          belowGround: Math.max(wg.dx, wg.dy) * EXT_WALL * (GROUND_LEVEL + 0.75),
        },
      });
    }
  }

  if (foundation === "pile") {
    const pileLen = 12;
    for (const n of nodes) {
      const cap = box(n.x - 0.45, n.y - 0.45, -1.35, n.x + 0.45, n.y + 0.45, -0.75);
      const pile = add({
        ifc: "IfcPile",
        predefined: "BORED",
        name: `Bored pile 450mm dia x ${pileLen}m`,
        typeName: "Bored Cast In-Situ Pile 450 dia",
        level: fnd,
        discipline: "structural",
        style: "pile",
        shapes: [cyl(n.x, n.y, -1.35 - pileLen, 0.225, pileLen)],
        q: {
          concrete: Math.PI * 0.225 * 0.225 * pileLen,
          boredLength: pileLen,
          rebar: Math.PI * 0.225 * 0.225 * pileLen * 85,
          count: 1,
        },
      });
      const capEl = add({
        ifc: "IfcFooting",
        predefined: "PILE_CAP",
        name: "Pile cap 900x900x600",
        typeName: "Pile Cap 900 x 900 x 600",
        level: fnd,
        discipline: "structural",
        style: "concrete",
        shapes: [cap],
        q: {
          concrete: solidVolume(cap),
          blinding: 0.9 * 0.9 * 0.05,
          formwork: 4 * 0.9 * 0.6,
          rebar: solidVolume(cap) * 120,
          cutOff: 1,
        },
      });
      excavation.push({
        elementId: capEl.id,
        kind: "pit",
        volume: 1.2 * 1.2 * (GROUND_LEVEL + 1.35),
        supportArea: 4 * 1.2 * (GROUND_LEVEL + 1.35),
        depth: GROUND_LEVEL + 1.35,
      });
      pile.q.capId = capEl.id;
    }
    for (const s of segments) {
      const g = runBox(s, 0.3, -0.75, -SLAB_T, {});
      const len = segLen(s) - 0.9 + COL;
      const gb = add({
        ifc: "IfcBeam",
        predefined: "BEAM",
        name: "Ground beam 300x600",
        typeName: "Ground Beam 300 x 600",
        level: fnd,
        discipline: "structural",
        style: "concrete",
        shapes: [g],
        q: {
          concrete: solidVolume(g),
          blinding: len * 0.3 * 0.05,
          formwork: 2 * len * 0.6,
          rebar: solidVolume(g) * 140,
        },
      });
      excavation.push({
        elementId: gb.id,
        kind: "trench",
        volume: len * 0.6 * (GROUND_LEVEL + 0.8),
        supportArea: 2 * len * (GROUND_LEVEL + 0.8),
        depth: GROUND_LEVEL + 0.8,
      });
    }
  }

  // Column stubs: from the top of whatever the column stands on up to FFL.
  const stubBase = {
    strip: -0.975,
    "pad-strip": -1.2,
    raft: -0.75,
    pile: -0.75,
  }[foundation];
  for (const n of nodes) {
    const g = box(n.x - COL / 2, n.y - COL / 2, stubBase, n.x + COL / 2, n.y + COL / 2, 0);
    add({
      ifc: "IfcColumn",
      predefined: "COLUMN",
      name: "Column stub 230x230",
      typeName: "Concrete Column: 230 x 230 (stub)",
      level: fnd,
      discipline: "structural",
      style: "concrete",
      shapes: [g],
      q: {
        concrete: solidVolume(g),
        formwork: 4 * COL * g.dz,
        rebar: solidVolume(g) * 180,
      },
    });
  }

  // Ground floor bed: 150mm slab on hardcore and DPM (suspended on the piled
  // design, where it spans between ground beams).
  const slabExt = COL / 2;
  const groundSlab = add({
    ifc: "IfcSlab",
    predefined: foundation === "pile" ? "FLOOR" : "BASESLAB",
    name:
      foundation === "pile"
        ? "Suspended ground floor slab 150mm"
        : "Ground floor slab 150mm on hardcore",
    typeName:
      foundation === "pile"
        ? "Floor: 150mm RC Suspended Slab"
        : "Floor: 150mm Concrete Bed on Hardcore",
    level: LEVELS.ground,
    discipline: "structural",
    style: "concrete",
    shapes: [box(-slabExt, -slabExt, -SLAB_T, W + slabExt, D + slabExt, 0)],
    q: {
      area: (W + 2 * slabExt) * (D + 2 * slabExt),
      concrete: (W + 2 * slabExt) * (D + 2 * slabExt) * SLAB_T,
    },
  });
  groundSlab.q.rebar =
    foundation === "pile" ? groundSlab.q.concrete * 100 : groundSlab.q.area * 3.95; // BRC A142 mesh ~ 2.22 kg/m2 + laps
  groundSlab.q.formwork = foundation === "pile" ? groundSlab.q.area : 0;

  // ── Frame: columns, beams, suspended slab, staircase ────────────────────
  for (const f of floors) {
    for (const n of nodes) {
      const g = box(n.x - COL / 2, n.y - COL / 2, f.z, n.x + COL / 2, n.y + COL / 2, f.z + H - BEAM_D);
      add({
        ifc: "IfcColumn",
        predefined: "COLUMN",
        name: "Column 230x230",
        typeName: "Concrete Column: 230 x 230",
        level: f.level,
        discipline: "structural",
        style: "concrete",
        shapes: [g],
        q: {
          concrete: solidVolume(g),
          formwork: 4 * COL * g.dz,
          rebar: solidVolume(g) * 180,
        },
      });
    }
    // Beams carry the floor above (first floor slab, then the roof ring).
    const top = f.z + H;
    const isRoof = f.level === LEVELS.first;
    for (const s of segments) {
      const g = runBox(s, COL, top - BEAM_D, top - (isRoof ? 0 : SLAB_T), { full: true });
      add({
        ifc: "IfcBeam",
        predefined: "BEAM",
        name: isRoof ? "Roof ring beam 230x450" : "Floor beam 230x450",
        typeName: isRoof ? "Concrete Beam: 230 x 450 (roof)" : "Concrete Beam: 230 x 450",
        level: isRoof ? LEVELS.roof : LEVELS.first,
        discipline: "structural",
        style: "concrete",
        shapes: [g],
        q: {
          concrete: solidVolume(g),
          formwork: segLen(s, true) * (COL + 2 * g.dz),
          rebar: solidVolume(g) * 160,
        },
      });
    }
  }

  const firstSlab = add({
    ifc: "IfcSlab",
    predefined: "FLOOR",
    name: "First floor slab 150mm",
    typeName: "Floor: 150mm RC Suspended Slab",
    level: LEVELS.first,
    discipline: "structural",
    style: "concrete",
    shapes: [box(-slabExt, -slabExt, H - SLAB_T, W + slabExt, D + slabExt, H)],
    q: {
      area: (W + 2 * slabExt) * (D + 2 * slabExt),
      concrete: (W + 2 * slabExt) * (D + 2 * slabExt) * SLAB_T,
    },
  });
  firstSlab.q.formwork = firstSlab.q.area;
  firstSlab.q.rebar = firstSlab.q.concrete * 100;

  // Dog-leg staircase in the front-left bay.
  const cx0 = xs[0] + COL / 2 + 0.05;
  const cy0 = ys[0] + COL / 2 + 0.05;
  const risers = Math.round(H / 0.18);
  const stepRise = H / risers;
  const half = Math.floor(risers / 2);
  const going = 0.25;
  const run1 = going * (half - 1);
  const landingZ = stepRise * half;
  const flight = (x0, dirSign, zBase, n) => {
    // Stepped profile in the xz plane with a 150mm waist.
    const pts = [];
    for (let k = 0; k < n; k += 1) {
      const x = x0 + dirSign * going * k;
      pts.push([x, zBase + stepRise * (k + 1)]);
      pts.push([x + dirSign * going, zBase + stepRise * (k + 1)]);
    }
    const xEnd = x0 + dirSign * going * n;
    pts.push([xEnd, zBase + stepRise * n - 0.2]);
    pts.push([x0, zBase - 0.2]);
    return dirSign > 0 ? pts : pts.reverse();
  };
  const f1 = prism("xz", flight(cx0, 1, 0, half - 1), cy0, cy0 + 1.0);
  const landing = box(cx0 + run1, cy0, landingZ - 0.15, cx0 + run1 + 1.2, cy0 + 2.2, landingZ);
  const f2 = prism("xz", flight(cx0 + run1, -1, landingZ, risers - half - 1), cy0 + 1.2, cy0 + 2.2);
  const stairVol = solidVolume(f1) + solidVolume(f2) + solidVolume(landing);
  add({
    ifc: "IfcStair",
    predefined: "HALF_TURN_STAIR",
    name: "RC dog-leg staircase 1000mm wide",
    typeName: "Cast-In-Place Stair: 1000mm Dog-leg",
    level: LEVELS.ground,
    discipline: "structural",
    style: "concrete",
    shapes: [f1, landing, f2],
    q: {
      concrete: stairVol,
      formwork: stairVol / 0.2 + risers * 1.0 * stepRise,
      rebar: stairVol * 120,
      treads: risers - 1,
    },
  });

  // ── Walls, openings, lintels ────────────────────────────────────────────
  const midX = Math.floor((xs.length - 1) / 2);
  const openingsFor = (s, f) => {
    const L = segLen(s);
    if (s.external) {
      const isFront = s.dir === "x" && s.j === 0;
      const isBack = s.dir === "x" && s.j === ys.length - 1;
      if (f.level === LEVELS.ground && isFront && s.i === midX) {
        return [{ kind: "doorMain", w: 1.2, h: 2.4, sill: 0 }];
      }
      if (f.level === LEVELS.ground && isBack && s.i === midX) {
        return [{ kind: "doorKitchen", w: 0.9, h: 2.1, sill: 0 }];
      }
      // Stair bay gets a tall window; everything else a standard casement.
      if (L < 1.6) return [];
      return [{ kind: "window", w: L > 3.6 ? 1.8 : 1.2, h: 1.2, sill: 0.9 }];
    }
    if ((s.i + s.j) % 2 === 0 && L > 1.2) {
      return [{ kind: "doorInternal", w: 0.9, h: 2.1, sill: 0 }];
    }
    return [];
  };

  const OPENING_TYPES = {
    doorMain: {
      ifc: "IfcDoor",
      name: "Steel security door 1200x2400 (double leaf)",
      typeName: "Door: Steel Security Double 1200 x 2400",
      style: "steelDoor",
    },
    doorKitchen: {
      ifc: "IfcDoor",
      name: "Steel door 900x2100",
      typeName: "Door: Steel Single 900 x 2100",
      style: "steelDoor",
    },
    doorInternal: {
      ifc: "IfcDoor",
      name: "Flush door 900x2100 with hardwood frame",
      typeName: "Door: Flush Panel 900 x 2100",
      style: "timberDoor",
    },
    window: {
      ifc: "IfcWindow",
      name: "Aluminium casement window",
      typeName: "Window: Aluminium Casement",
      style: "glass",
    },
  };

  for (const f of floors) {
    const wallTop = f.z + H - BEAM_D;
    for (const s of segments) {
      const t = s.external ? EXT_WALL : INT_WALL;
      const g = runBox(s, t, f.z, wallTop);
      const L = segLen(s);
      const openings = openingsFor(s, f);
      const openArea = openings.reduce((a, o) => a + o.w * o.h, 0);
      const gross = L * (wallTop - f.z);
      const wall = add({
        ifc: "IfcWall",
        name: s.external
          ? "External wall 225mm sandcrete block"
          : "Internal wall 150mm sandcrete block",
        typeName: s.external
          ? "Basic Wall: 225mm Sandcrete Block (external)"
          : "Basic Wall: 150mm Sandcrete Block (internal)",
        level: f.level,
        discipline: "architectural",
        style: s.external ? "blockExt" : "blockInt",
        shapes: [g],
        q: {
          external: s.external,
          blockArea: gross - openArea,
          // Plaster / paint faces. External walls: one face inside, one render outside.
          internalFace: (s.external ? 1 : 2) * (gross - openArea),
          externalFace: s.external ? gross - openArea : 0,
          // Skirting runs both sides of an internal wall, inside face of external.
          skirting: (s.external ? 1 : 2) * L - openings.filter((o) => o.sill === 0).length * 0.9,
        },
      });

      // Openings are centred in the segment and stand 20mm proud of each face
      // so they read clearly in the viewer without boolean voids.
      const centre = (s.a + s.b) / 2;
      for (const o of openings) {
        const spec = OPENING_TYPES[o.kind];
        const z0 = f.z + o.sill;
        const og =
          s.dir === "x"
            ? box(centre - o.w / 2, s.at - t / 2 - 0.02, z0, centre + o.w / 2, s.at + t / 2 + 0.02, z0 + o.h)
            : box(s.at - t / 2 - 0.02, centre - o.w / 2, z0, s.at + t / 2 + 0.02, centre + o.w / 2, z0 + o.h);
        add({
          ifc: spec.ifc,
          name: `${spec.name}${spec.ifc === "IfcWindow" ? ` ${Math.round(o.w * 1000)}x${Math.round(o.h * 1000)}` : ""}`,
          typeName:
            spec.ifc === "IfcWindow"
              ? `${spec.typeName} ${Math.round(o.w * 1000)} x ${Math.round(o.h * 1000)}`
              : spec.typeName,
          level: f.level,
          discipline: "architectural",
          style: spec.style,
          kind: o.kind,
          hostWallId: wall.id,
          overall: { w: o.w, h: o.h },
          shapes: [og],
          q: { count: 1, area: o.w * o.h },
        });
        // RC lintel over the opening, 150mm bearing each side.
        const lw = o.w + 0.3;
        const lz = z0 + o.h;
        const lg =
          s.dir === "x"
            ? box(centre - lw / 2, s.at - t / 2, lz, centre + lw / 2, s.at + t / 2, lz + 0.15)
            : box(s.at - t / 2, centre - lw / 2, lz, s.at + t / 2, centre + lw / 2, lz + 0.15);
        add({
          ifc: "IfcBeam",
          predefined: "LINTEL",
          name: `Lintel ${Math.round(t * 1000)}x150`,
          typeName: `Concrete Lintel: ${Math.round(t * 1000)} x 150`,
          level: f.level,
          discipline: "structural",
          style: "concrete",
          shapes: [lg],
          q: {
            concrete: solidVolume(lg),
            formwork: lw * (t + 0.3),
            rebar: solidVolume(lg) * 110,
          },
        });
      }
    }
  }

  // ── Floor and ceiling finishes, one covering per room (grid bay) ────────
  for (const f of floors) {
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < ys.length - 1; j += 1) {
        const tx0 = i === 0 ? EXT_WALL : INT_WALL;
        const tx1 = i === xs.length - 2 ? EXT_WALL : INT_WALL;
        const ty0 = j === 0 ? EXT_WALL : INT_WALL;
        const ty1 = j === ys.length - 2 ? EXT_WALL : INT_WALL;
        const x0 = xs[i] + tx0 / 2;
        const x1 = xs[i + 1] - tx1 / 2;
        const y0 = ys[j] + ty0 / 2;
        const y1 = ys[j + 1] - ty1 / 2;
        const area = (x1 - x0) * (y1 - y0);
        const wet = (i + j) % 3 === 2; // a bathroom / kitchen bay gets wall tiles
        add({
          ifc: "IfcCovering",
          predefined: "FLOORING",
          name: "Floor finish: 25mm screed + 600x600 ceramic tiles",
          typeName: "Floor Finish: Screed + 600x600 Ceramic Tiles",
          level: f.level,
          discipline: "architectural",
          style: "tile",
          shapes: [box(x0, y0, f.z, x1, y1, f.z + 0.03)],
          q: { area, wet, perimeter: 2 * (x1 - x0 + y1 - y0) },
        });
        const cz = f.z + H - BEAM_D;
        add({
          ifc: "IfcCovering",
          predefined: "CEILING",
          name: "Ceiling: POP (plaster of Paris) ceiling",
          typeName: "Ceiling: POP Plain",
          level: f.level,
          discipline: "architectural",
          style: "ceiling",
          shapes: [box(x0, y0, cz - 0.02, x1, y1, cz)],
          q: { area },
        });
      }
    }
  }

  // ── Roof: gable roof, ridge along the long axis, with block gable walls ──
  const pitch = (design.roofPitchDeg * Math.PI) / 180;
  const ridgeAlongX = W >= D;
  const span = ridgeAlongX ? D : W;
  const length = ridgeAlongX ? W : D;
  const overhang = 0.6;
  const rise = (span / 2) * Math.tan(pitch);
  const zE = roofZ;
  const zR = roofZ + rise;
  const tk = 0.08;
  const drop = overhang * Math.tan(pitch);
  const plane = ridgeAlongX ? "yz" : "xz";
  const lo = -overhang;
  const hi = span + overhang;
  const mid = span / 2;
  const slopeA = [
    [lo, zE - drop],
    [mid, zR],
    [mid, zR + tk],
    [lo, zE - drop + tk],
  ];
  const slopeB = [
    [mid, zR],
    [hi, zE - drop],
    [hi, zE - drop + tk],
    [mid, zR + tk],
  ];
  const along0 = -overhang;
  const along1 = length + overhang;
  const slopeLen = (span / 2 + overhang) / Math.cos(pitch);
  const roofArea = 2 * slopeLen * (length + 2 * overhang);
  const roof = add({
    ifc: "IfcRoof",
    predefined: "GABLE_ROOF",
    name: "Roof: 0.55mm longspan aluminium on timber trusses",
    typeName: "Basic Roof: 0.55mm Longspan Aluminium",
    level: LEVELS.roof,
    discipline: "architectural",
    style: "roof",
    shapes: [prism(plane, slopeA, along0, along1), prism(plane, slopeB, along0, along1)],
    q: {
      area: roofArea,
      planArea: (span + 2 * overhang) * (length + 2 * overhang),
      fascia: 2 * (length + 2 * overhang) + 4 * slopeLen,
      ridge: length + 2 * overhang,
    },
  });
  for (const at of [0, length]) {
    const tri = [
      [0, zE],
      [span, zE],
      [mid, zR - 0.05],
    ];
    const g = prism(plane, tri, at - EXT_WALL / 2, at + EXT_WALL / 2);
    add({
      ifc: "IfcWall",
      name: "Gable wall 225mm sandcrete block",
      typeName: "Basic Wall: 225mm Sandcrete Block (gable)",
      level: LEVELS.roof,
      discipline: "architectural",
      style: "blockExt",
      shapes: [g],
      q: {
        external: true,
        blockArea: (span * rise) / 2,
        internalFace: 0,
        externalFace: (span * rise) / 2,
        skirting: 0,
        gable: true,
      },
    });
  }

  return {
    design,
    W,
    D,
    storeyHeight: H,
    roofId: roof.id,
    groundSlabId: groundSlab.id,
    firstSlabId: firstSlab.id,
    excavation,
    elements: elements.map((e) => ({
      ...e,
      q: Object.fromEntries(
        Object.entries(e.q).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v]),
      ),
    })),
  };
}
