// A real programme of works, as a template.
//
// WHERE THIS COMES FROM
//
// Transcribed from a genuine 451-day programme for a 7-storey hotel at Idimu
// Road, Egbeda (prepared by Bldr. Adegboye S. Nurudeen MNIOB, 135 tasks,
// Apr 2025 - Jan 2027), cross-checked against a sectional slab-and-column
// programme from the same practice. Nothing here is invented: the WBS shape,
// the trade sequence and the durations are what a Nigerian builder actually
// programmes.
//
// WHY A TEMPLATE AND NOT A COPY
//
// The samples are a duplex, an MEP job, a road and an ArchiCAD job — none of
// them is a 7-storey hotel. What transfers is the SHAPE, not the dates:
//
//   * the trade triad. Formwork, reinforcement, concrete, in that order, with
//     the pour always a single day. Every concrete element in the source
//     programme is three tasks, never one.
//   * the overlaps. Reinforcement starts before formwork finishes on a column
//     (2 days in), MEP first fix runs inside the slab reinforcement, and
//     blockwork trails the frame by two floors. A programme drawn as strict
//     finish-to-start is the tell-tale of a generated one.
//   * the proportions. Substructure is ~18% of the build, superstructure ~73%,
//     finishes overlap the frame's tail rather than following it, and external
//     works start while the top floors are still going up.
//
// The old sample programme was one task per phase, sequential, no overlap - it
// demonstrated the Gantt and taught a QS nothing. This teaches the shape of a
// real one.
//
// USE
//
// buildProgramme(sections, { start, days }) returns tasks in the schema's own
// shape, scaled to the project's own duration, with each leaf carrying the
// section name it belongs to so the caller can link it to bill lines.

/** The trade sequence inside one concrete element, as a share of its span. */
const TRIAD = [
  // name, start as a share of the element, duration as a share of it
  { trade: "Formwork", from: 0, span: 0.45 },
  // Reinforcement starts before the formwork is off: 2 days into a 9-day
  // formwork run on the source programme's columns.
  { trade: "Reinforcement", from: 0.38, span: 0.52 },
  // The pour is always one day, whatever the element.
  { trade: "Concrete", from: 0.93, span: 0.07, pour: true },
];

/**
 * The bands every building job has, with the share of the programme each takes
 * and what goes in it. Shares are from the source programme's own durations.
 */
export const BANDS = [
  {
    key: "mobilisation",
    name: "Mobilisation",
    share: 0.045,
    leaves: [{ name: "Contract approval and mobilisation", span: 1 }],
  },
  {
    key: "substructure",
    name: "Substructure",
    share: 0.18,
    match: /sub ?structure|foundation|excavat|pile|ground beam|oversite|hardcore|dpm|filling/i,
    leaves: [
      { name: "Site clearance", from: 0, span: 0.09 },
      { name: "Top soil removal and disposal", from: 0.09, span: 0.06 },
      { name: "Excavation and piling", from: 0.15, span: 0.12 },
      { element: "Pile cap", from: 0.27, span: 0.24 },
      { element: "Ground beam", from: 0.51, span: 0.18 },
      { name: "Laterite filling", from: 0.7, span: 0.05 },
      { name: "Hardcore filling", from: 0.75, span: 0.05 },
      { name: "Damp proof membrane", from: 0.8, span: 0.02 },
      { name: "MEP first fix", from: 0.83, span: 0.05 },
      { element: "Ground floor slab", from: 0.85, span: 0.15 },
    ],
  },
  {
    key: "superstructure",
    name: "Superstructure",
    share: 0.5,
    match: /super ?structure|frame|column|beam|slab|blockwork|roof|wall/i,
    // Per floor, repeating. The caller says how many.
    perFloor: [
      { element: "{floor} beam, staircase and slab", span: 0.62, mep: true },
      { element: "{floor} column and lift wall", span: 0.26 },
      { name: "Blockwork to {floor}", span: 0.34, from: 0.66, trails: true },
    ],
  },
  {
    key: "finishes",
    name: "Finishes",
    share: 0.2,
    match: /finish|plaster|screed|paint|tiling|ceiling|render|door|window/i,
    leaves: [
      // Finishes run in two halves, upper and lower, in parallel - which is why
      // a finishes band is never a single queue.
      { name: "Plastering, lower floors", from: 0, span: 0.18 },
      { name: "Plastering, upper floors", from: 0, span: 0.18 },
      { name: "Screeding, lower floors", from: 0.18, span: 0.12 },
      { name: "Screeding, upper floors", from: 0.18, span: 0.12 },
      { name: "External painting", from: 0.3, span: 0.22 },
      { name: "Internal painting", from: 0.32, span: 0.15 },
      { name: "Floor tiling", from: 0.44, span: 0.26 },
      { name: "Ceiling works", from: 0.62, span: 0.28 },
      { name: "Windows and doors final fix", from: 0.62, span: 0.16 },
      { name: "MEP final fix", from: 0.83, span: 0.17 },
    ],
  },
  {
    key: "external",
    name: "External works",
    share: 0.1,
    match: /external|fence|gate|septic|soakaway|landscap|interlock|drain|apron/i,
    // Externals start while the frame is still going up, not after it.
    startsAt: 0.68,
    leaves: [
      { name: "Gate works", from: 0, span: 0.05 },
      { name: "Fence", from: 0.02, span: 0.16 },
      { name: "Septic tank and soakaway", from: 0.2, span: 0.18 },
      { name: "Interlocking", from: 0.5, span: 0.2 },
      { name: "Landscaping", from: 0.52, span: 0.17 },
      { name: "Security installation", from: 0.78, span: 0.12 },
    ],
  },
  {
    key: "handover",
    name: "Completion and handover",
    share: 0.045,
    leaves: [
      { name: "Making good snags", from: 0, span: 0.55 },
      { name: "Handing over", from: 0.55, span: 0.42 },
      { name: "Practical completion", from: 1, span: 0, milestone: true },
    ],
  },
];

const DAY = 86400000;
const addDays = (d, n) => new Date(new Date(d).getTime() + Math.round(n) * DAY);

/**
 * The programme, as flat tasks.
 *
 * @param {object} opts
 * @param {Date|string} opts.start   when the job starts
 * @param {number} opts.days         the whole programme's length
 * @param {number} [opts.floors]     how many suspended floors; 0 for a bungalow
 * @returns {Array} tasks with {wbs, name, band, trade, startDate, endDate,
 *                  durationDays, isMilestone, isSummary}
 */
export function buildProgramme({ start, days = 240, floors = 1 } = {}) {
  const t0 = new Date(start || Date.now());
  const out = [];
  let wbs = 0;
  let cursor = 0; // days from t0

  const push = (row) => {
    const s = Math.max(0, Math.round(row.at));
    const e = Math.max(s, Math.round(row.at + row.len));
    out.push({
      wbs: row.wbs,
      name: row.name,
      band: row.band,
      trade: row.trade || "",
      startDate: addDays(t0, s),
      endDate: addDays(t0, e),
      durationDays: Math.max(row.milestone ? 0 : 1, e - s),
      isMilestone: Boolean(row.milestone),
      isSummary: Boolean(row.summary),
    });
  };

  /** One concrete element as its three trades. */
  const element = ({ name, at, len, band, wbsRoot, mep }) => {
    push({ wbs: wbsRoot, name, band, at, len, summary: true });
    TRIAD.forEach((t, i) => {
      push({
        wbs: `${wbsRoot}.${i + 1}`,
        name: `${t.trade} to ${name.toLowerCase()}`,
        band,
        trade: t.trade,
        at: at + len * t.from,
        // A pour is one day however big the element is.
        len: t.pour ? 1 : Math.max(1, len * t.span),
      });
    });
    if (mep) {
      // MEP first fix runs INSIDE the slab reinforcement, not after it.
      push({
        wbs: `${wbsRoot}.4`,
        name: `MEP first fix to ${name.toLowerCase()}`,
        band,
        trade: "MEP",
        at: at + len * 0.5,
        len: Math.max(1, len * 0.28),
      });
    }
  };

  for (const band of BANDS) {
    wbs += 1;
    const bandLen = Math.max(2, days * band.share);
    const bandAt = band.startsAt != null ? days * band.startsAt : cursor;
    push({ wbs: String(wbs), name: band.name, band: band.key, at: bandAt, len: bandLen, summary: true });

    if (band.perFloor) {
      // One repeat per floor. A floor's frame is beam+slab then columns; the
      // blockwork for it trails two floors behind, which is what keeps a real
      // frame ahead of its walls.
      const per = bandLen / Math.max(1, floors);
      for (let f = 0; f < floors; f += 1) {
        const label = floors === 1 ? "Ground floor" : `Floor ${f + 1}`;
        const at = bandAt + f * per;
        band.perFloor.forEach((leaf, li) => {
          const nm = (leaf.element || leaf.name).replace("{floor}", label);
          const lAt = at + per * (leaf.from || 0) + (leaf.trails ? per * 2 : 0);
          const lLen = Math.max(1, per * leaf.span);
          if (lAt > days) return;
          if (leaf.element) {
            element({
              name: nm,
              at: lAt,
              len: lLen,
              band: band.key,
              wbsRoot: `${wbs}.${f + 1}.${li + 1}`,
              mep: leaf.mep,
            });
          } else {
            push({ wbs: `${wbs}.${f + 1}.${li + 1}`, name: nm, band: band.key, at: lAt, len: lLen });
          }
        });
      }
    } else {
      band.leaves.forEach((leaf, li) => {
        const at = bandAt + bandLen * (leaf.from || 0);
        const len = Math.max(leaf.milestone ? 0 : 1, bandLen * (leaf.span ?? 1));
        if (leaf.element) {
          element({
            name: leaf.element,
            at,
            len,
            band: band.key,
            wbsRoot: `${wbs}.${li + 1}`,
          });
        } else {
          push({
            wbs: `${wbs}.${li + 1}`,
            name: leaf.name,
            band: band.key,
            at,
            len,
            milestone: leaf.milestone,
          });
        }
      });
    }
    // The next band starts where this one ends, unless it was pinned.
    if (band.startsAt == null) cursor = bandAt + bandLen;
  }

  out.sort((a, b) => a.startDate - b.startDate || String(a.wbs).localeCompare(String(b.wbs)));
  return out;
}

/**
 * Which band a bill line belongs to, from its section or description.
 *
 * Used to link a generated task back to the lines it builds, so the sample's
 * earned value is real rather than assigned at random.
 */
export function bandForLine(text) {
  const s = String(text || "");
  // Specificity, not band order. "Plastering to walls" is a finish, but the
  // superstructure pattern owns the word `wall`, so testing the bands in
  // programme order hands every finishing trade to the frame. A finishing verb
  // beats a structural noun, which is the rule a QS applies reading a bill.
  for (const key of ["finishes", "external", "substructure", "superstructure"]) {
    const b = BANDS.find((x) => x.key === key);
    if (b?.match?.test(s)) return b.key;
  }
  return "superstructure";
}

/**
 * One of the sample's coarse phases, expanded into the trades a builder would
 * actually programme for it.
 *
 * The sample used to draw a phase as a single bar. A QS opening "Substructure,
 * 24 days" learns nothing; "formwork 6 days, reinforcement 7 overlapping, pour
 * 1" is the thing they recognise. The phase keeps its own start and length, so
 * every figure already derived from phases — progress, earned value,
 * certificates — is untouched.
 *
 * Returns leaves only. The caller pushes its own summary bar for the phase.
 *
 * @returns {Array<{name, trade, offset, days}>} offset in days from the phase start
 */
export function phaseTasks(phaseName, days) {
  const n = String(phaseName || "").toLowerCase();
  const d = Math.max(3, Number(days) || 3);
  const at = (f) => Math.round(d * f);
  const len = (f) => Math.max(1, Math.round(d * f));

  // A concrete element: formwork, reinforcement overlapping it, one-day pour.
  const concrete = (what) => [
    { name: `Formwork to ${what}`, trade: "Formwork", offset: 0, days: len(0.45) },
    { name: `Reinforcement to ${what}`, trade: "Reinforcement", offset: at(0.38), days: len(0.5) },
    { name: `MEP first fix`, trade: "MEP", offset: at(0.55), days: len(0.25) },
    { name: `Concrete to ${what}`, trade: "Concrete", offset: Math.max(1, d - 1), days: 1 },
  ];

  if (/substructure|foundation/.test(n)) {
    return [
      { name: "Site clearance and setting out", trade: "Groundworks", offset: 0, days: len(0.16) },
      { name: "Excavate for foundations", trade: "Groundworks", offset: at(0.14), days: len(0.2) },
      { name: "Formwork to bases and ground beam", trade: "Formwork", offset: at(0.3), days: len(0.22) },
      { name: "Reinforcement to bases and ground beam", trade: "Reinforcement", offset: at(0.44), days: len(0.24) },
      { name: "Concrete to foundations", trade: "Concrete", offset: at(0.66), days: 1 },
      { name: "Hardcore filling and damp proof membrane", trade: "Groundworks", offset: at(0.7), days: len(0.16) },
      { name: "Oversite concrete", trade: "Concrete", offset: Math.max(1, d - 1), days: 1 },
    ];
  }
  if (/slab|staircase/.test(n)) return concrete("slab and staircase");
  if (/frame|column/.test(n)) {
    return [
      ...concrete("columns and beams"),
      { name: "Blockwork to walls", trade: "Masonry", offset: at(0.62), days: len(0.38) },
    ];
  }
  if (/roof/.test(n)) {
    return [
      { name: "Roof carpentry and trusses", trade: "Carpentry", offset: 0, days: len(0.55) },
      { name: "Roof covering and flashings", trade: "Roofing", offset: at(0.5), days: len(0.4) },
      { name: "Rainwater goods", trade: "Roofing", offset: at(0.82), days: len(0.18) },
    ];
  }
  if (/door|window/.test(n)) {
    return [
      { name: "Frames and first fix", trade: "Joinery", offset: 0, days: len(0.5) },
      { name: "Glazing and ironmongery", trade: "Joinery", offset: at(0.48), days: len(0.52) },
    ];
  }
  if (/finish/.test(n)) {
    return [
      { name: "Plastering to walls", trade: "Plastering", offset: 0, days: len(0.26) },
      { name: "Screed to floors", trade: "Plastering", offset: at(0.22), days: len(0.18) },
      { name: "Wall and floor tiling", trade: "Tiling", offset: at(0.36), days: len(0.26) },
      { name: "POP and ceiling works", trade: "Ceilings", offset: at(0.52), days: len(0.24) },
      { name: "Painting, internal and external", trade: "Painting", offset: at(0.7), days: len(0.3) },
    ];
  }
  // Anything unnamed still gets a shape rather than one bar.
  return [
    { name: `${phaseName} — first fix`, trade: "", offset: 0, days: len(0.55) },
    { name: `${phaseName} — completion`, trade: "", offset: at(0.5), days: len(0.5) },
  ];
}
