// The programme — Richard's Time Pro screen, on our projects.
//
// His argument, which the port keeps: nothing gets measured twice. The screen
// does not ask anybody to type a duration. It reads the quantities QUIV,
// HERON, Revit MEP and CIVIQ already measured, divides each by the gang output
// for that kind of work, and sequences the trades. Change the crews and the
// bar moves; every bar is arithmetic on the bill, and the money beside it is
// the bill's own money.
//
//     gang-days for a line  = quantity ÷ output per gang-day
//     duration for a trade  = Σ gang-days ÷ the gangs put on it
//
// WHERE OURS DIFFERS FROM HIS, AND WHY
//
// His outputs come from the rate that priced each line: r.lab carries labour
// days per unit, so quantity × that is gang-days and nothing is typed at all.
// Ours cannot do that yet, and it is worth being exact about why rather than
// quietly substituting something:
//
//   - appliedRateKey is empty on all 10,169 bill lines in the database, so no
//     line can currently be followed to the build-up that priced it;
//   - the shared labour library (RateGenLabour) has no rows at all;
//   - the 28 catalogue rates that DO carry a labour line state it in mixed
//     units — hr/m2, hr/m3, m3/hr inverted, "per Hr", "No/Day" — so even a
//     matched line would not give a comparable output;
//   - Time Pro's recorded tasks, which measure real gang output on site, is
//     an empty collection.
//
// So the one number his build reads from the library is the one number ours
// has to be argued. It is held per trade and per unit, and it arrives three
// ways, in this order of authority: typed by the estimator, estimated from the
// lines' own wording by POST /programme/:productKey/:id/outputs, or seeded
// with an ordinary building figure. All three land in the same store and are
// edited in the Output column of his own second panel, which is already the
// column for it. Everything else on this screen is the project's own data, and
// the page says which is which rather than passing an assumption off as a
// measurement.
//
// The screen also programmes what is LEFT rather than the whole bill: the bill
// records `completed` and `percentComplete` per line, so a job half built gets
// a programme for its second half. Where no progress is recorded the two are
// the same thing and nothing about the screen changes.
//
// His markup throughout: .wk-head/.wk-acts, .dsh-stats, .wk-panel/.wk-ph,
// .wk-gantt with .wk-ghd + .wk-gr (bar, crew stepper, dates, value), .wk-note,
// and .wk-qt with .wk-qhd/.wk-qr/.wk-qtot. The porter renames his `a` class to
// `ds-a`, so the gang-days cell carries that.

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import WkDropdown from "./WkDropdown.jsx";
import WkPrefs from "./WkPrefs.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const num = (n) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(Number(n) || 0);

const count = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
  "qs-takeoff": "Time Pro",
  rategen: "RateGen",
};

const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

/* The bill writes units the way the plugin that measured them writes them —
   "CU M" from HERON, "m3" from QUIV, "SQ M" and "m2" for the same thing. An
   output held against "m2" has to find the line measured in "SQ M", or the
   trade silently programmes as zero. */
const UNIT = {
  m3: "m3", "m³": "m3", "cu m": "m3", cum: "m3", "cu.m": "m3",
  m2: "m2", "m²": "m2", "sq m": "m2", sqm: "m2", "sq.m": "m2", sm: "m2",
  m: "m", lm: "m", "l m": "m", rm: "m", ln: "m",
  kg: "kg", kgs: "kg",
  t: "t", tonne: "t", tonnes: "t", ton: "t", mt: "t",
  nr: "nr", no: "nr", "no.": "nr", nos: "nr", ea: "nr", each: "nr",
  item: "nr", pcs: "nr", pc: "nr", unit: "nr", units: "nr",
};
const normUnit = (u) => {
  const k = String(u || "").trim().toLowerCase();
  return UNIT[k] || k;
};

/* Ordinary outputs for one gang in one day, by trade and by what the work is
   measured in. Seeds, not measurements — the note under the table says so, and
   every one of them is editable on the page.

   The masonry figure is Richard's own: a blocklayer gang lays 16.7 m² a day,
   so 1,842 m² of 225mm wall is 110 gang-days. */
const OUTPUT = {
  Earthworks: { m3: 15, m2: 40, m: 30, nr: 4 },
  Substructure: { m3: 10, m2: 20, m: 25, nr: 3 },
  "Concrete Works": { m3: 8, m2: 20, m: 25 },
  Reinforcement: { kg: 250, t: 0.25, m: 60 },
  Formwork: { m2: 20, m: 25, m3: 10 },
  "Structural Steelwork": { kg: 300, t: 0.3, m: 20, nr: 4 },
  Frame: { m3: 8, m2: 18, m: 22, kg: 250 },
  Masonry: { m2: 16.7, m3: 4, m: 20, nr: 6 },
  "Carpentry & Roofing": { m2: 22, m: 30, nr: 5 },
  "Damp-proofing": { m2: 60, m: 45 },
  Joinery: { nr: 4, m2: 12, m: 20 },
  "Windows and external doors": { nr: 5, m2: 10, m: 18 },
  "Finishes — Floor": { m2: 25, m: 30 },
  "Finishes — Wall": { m2: 30, m: 35 },
  "Finishes — Ceiling": { m2: 25, m: 30 },
  Finishes: { m2: 27, m: 32 },
  Decoration: { m2: 60, m: 60, nr: 8 },
  "Plumbing & Drainage": { nr: 6, m: 25, m2: 20, m3: 8 },
  "Electrical Installations": { nr: 12, m: 60, m2: 30 },
  HVAC: { nr: 3, m: 20, m2: 20, kg: 120 },
  Other: { m3: 10, m2: 25, m: 30, kg: 250, t: 0.25, nr: 6 },
};

/* The building sequence, with the overlap each trade is normally started at.
   `over: 0.6` means the trade begins when the one before it is 60% through —
   blockwork does not wait for the last beam to cure before the first course
   goes up. Planning conventions, stated on the page rather than buried in the
   arithmetic, and expressed in OUR trade names because those are the ones the
   plugins write onto a bill line. */
const SEQ = [
  { trade: "Earthworks", after: null, over: 0, crews: 2 },
  { trade: "Substructure", after: "Earthworks", over: 0.6, crews: 2 },
  { trade: "Formwork", after: "Substructure", over: 0.6, crews: 3 },
  { trade: "Reinforcement", after: "Formwork", over: 0.5, crews: 3 },
  { trade: "Concrete Works", after: "Reinforcement", over: 0.6, crews: 3 },
  { trade: "Structural Steelwork", after: "Concrete Works", over: 0.7, crews: 2 },
  { trade: "Frame", after: "Concrete Works", over: 0.75, crews: 2 },
  { trade: "Masonry", after: "Concrete Works", over: 0.6, crews: 3 },
  { trade: "Carpentry & Roofing", after: "Masonry", over: 0.85, crews: 2 },
  { trade: "Damp-proofing", after: "Masonry", over: 0.8, crews: 1 },
  { trade: "Plumbing & Drainage", after: "Carpentry & Roofing", over: 0.5, crews: 2 },
  { trade: "Electrical Installations", after: "Carpentry & Roofing", over: 0.5, crews: 2 },
  { trade: "HVAC", after: "Carpentry & Roofing", over: 0.5, crews: 2 },
  { trade: "Windows and external doors", after: "Carpentry & Roofing", over: 0.6, crews: 1 },
  { trade: "Joinery", after: "Windows and external doors", over: 0.6, crews: 2 },
  { trade: "Finishes — Floor", after: "Plumbing & Drainage", over: 0.55, crews: 3 },
  { trade: "Finishes — Wall", after: "Plumbing & Drainage", over: 0.55, crews: 3 },
  { trade: "Finishes — Ceiling", after: "Electrical Installations", over: 0.55, crews: 2 },
  { trade: "Finishes", after: "Plumbing & Drainage", over: 0.55, crews: 3 },
  { trade: "Decoration", after: "Finishes — Wall", over: 0.7, crews: 2 },
  { trade: "Other", after: "Masonry", over: 0.5, crews: 2 },
];
const SEQ_AT = new Map(SEQ.map((s, i) => [s.trade, i]));

/* ── roads ────────────────────────────────────────────────────────────────

   CIVIQ writes ONE trade on a road — every line of a 22-line earthworks and
   pavement bill says "Civil" — so grouping on the trade field gives a
   programme of a single bar, which is not a programme.

   The sequence is in the descriptions instead, and it is not a guess: cut and
   fill, formation, capping, subbase, base, surfacing, kerbs, furniture is the
   order a road is built in and the order the bill is written in. So a civil
   project is grouped by the operation its line names, and sequenced by that.

   Matched in this order, which is not the order they run in — "Preparation of
   Excavated Surface" has to reach Formation before /excavat/ claims it for
   Excavation, and "Subbase Course" has to be settled before /base course/. */
const CIVIL_MATCH = [
  [/topsoil strip|site clearance|clearing|grubbing|^cutting topsoil/i, "Site clearance"],
  [/disposal|double handling|cart away|spoil/i, "Disposal"],
  [/preparation|trimming|formation|compact/i, "Formation"],
  [/cutting|excavat/i, "Excavation"],
  [/filling|embankment|backfill/i, "Filling"],
  [/geotextile|geogrid|capping/i, "Capping and geotextile"],
  [/sub-?base/i, "Subbase"],
  [/base course|road ?base/i, "Base course"],
  [/surface course|wearing course|binder course|asphalt|surfacing|chipping/i, "Surfacing"],
  [/kerb|channel|gully|drain|culvert|manhole/i, "Kerbs and drainage"],
  [/marking|traffic sign|\bsigns?|mileage|road stud|guard ?rail|barrier/i, "Road furniture"],
  [/landscap|seeding|turf|planting|topsoil(?!\s*strip)/i, "Landscaping"],
];
const civilStage = (text) => {
  const d = String(text || "");
  for (const [re, name] of CIVIL_MATCH) if (re.test(d)) return name;
  return "Civil";
};

const CIVIL_SEQ = [
  { trade: "Site clearance", after: null, over: 0, crews: 1 },
  { trade: "Excavation", after: "Site clearance", over: 0.5, crews: 2 },
  { trade: "Disposal", after: "Excavation", over: 0.3, crews: 2 },
  { trade: "Filling", after: "Excavation", over: 0.6, crews: 2 },
  { trade: "Formation", after: "Filling", over: 0.7, crews: 1 },
  { trade: "Capping and geotextile", after: "Formation", over: 0.85, crews: 1 },
  { trade: "Subbase", after: "Capping and geotextile", over: 0.8, crews: 2 },
  { trade: "Base course", after: "Subbase", over: 0.8, crews: 2 },
  { trade: "Surfacing", after: "Base course", over: 0.85, crews: 2 },
  { trade: "Kerbs and drainage", after: "Base course", over: 0.6, crews: 2 },
  { trade: "Road furniture", after: "Surfacing", over: 0.9, crews: 1 },
  { trade: "Landscaping", after: "Surfacing", over: 0.8, crews: 1 },
  { trade: "Civil", after: "Surfacing", over: 0.5, crews: 2 },
];
const CIVIL_SEQ_AT = new Map(CIVIL_SEQ.map((x, i) => [x.trade, i]));

/* Road outputs are plant outputs, not gang outputs — an excavator and its
   tipper fleet shift two orders of magnitude more earth in a day than men
   with shovels — so they are seeded from a separate table rather than from
   the building one, which would have programmed 11,791 m3 of subsoil as
   786 gang-days. Editable in the same column, and the estimator reads the
   line wording, which is where the method usually shows up. */
const CIVIL_OUTPUT = {
  "Site clearance": { m3: 400, m2: 1500, m: 500 },
  Excavation: { m3: 300, m2: 800 },
  Disposal: { m3: 250, m2: 800 },
  Filling: { m3: 250, m2: 900 },
  Formation: { m2: 1200, m3: 300 },
  "Capping and geotextile": { m2: 800, m3: 250 },
  Subbase: { m2: 500, m3: 200 },
  "Base course": { m2: 500, m3: 200 },
  Surfacing: { m2: 700, m3: 150, t: 120 },
  "Kerbs and drainage": { m: 60, nr: 12, m3: 40 },
  "Road furniture": { nr: 8, m: 400, m2: 200 },
  Landscaping: { m2: 500, m3: 200 },
  Civil: { m3: 250, m2: 600, m: 100, nr: 8, kg: 400, t: 50 },
};

/* ── what counts as a line of work ────────────────────────────────────────

   A materials schedule is a bill broken into its parts, and the three
   products break it differently:

     HERON  — Labour lines carrying the real trade, the quantity and the
              original bill wording in sourceTakeoffCode. The description
              field just says "Labour".
     QUIV   — Material lines carrying the real trade, and Labour lines whose
              trade field says "Labour", which is the component kind leaking
              into it rather than a trade.
     CIVIQ  — no component kinds at all; every line says "Civil" and the
              operation is in the description.
     MEP    — Revit family names with no trade at all. An equipment schedule,
              not work, and there is no sequence in it.

   So "Labour" and "Material" are not trades, and a schedule programmes its
   labour lines where it has them and its traded lines where it does not —
   otherwise HERON's 79 labour lines and its 97 material lines would both be
   put on the programme and the road built twice. */
const NOT_A_TRADE = new Set(["labour", "labor", "material", "materials"]);
const kindOf = (it) => String(it.componentKind || "").trim().toLowerCase();
const tradeOf = (it) => {
  const t = String(it.trade || "").trim();
  return t && !NOT_A_TRADE.has(t.toLowerCase()) ? t : "";
};
const beforeGuid = (v) => String(v || "").split("|")[0].trim();

/* The name to put on a row. Falls all the way through rather than printing
   "Unnamed line": a schedule that carries no descriptions still knows what
   trade the work is and what it was measured in, and that is a truer label
   than nothing. */
const lineName = (it, trade, unit) => {
  const d = String(it.description || "").trim();
  if (d && !NOT_A_TRADE.has(d.toLowerCase())) return d;
  const src = beforeGuid(it.sourceTakeoffCode);
  const cut = src.indexOf(":");
  const tail = (cut > -1 ? src.slice(cut + 1) : src).trim();
  if (tail) return tail;
  const m = String(it.materialName || "").trim();
  if (m && !NOT_A_TRADE.has(m.toLowerCase())) return m;
  return `${trade} measured in ${unit}`;
};
const lineSection = (it) => {
  const src = beforeGuid(it.sourceTakeoffCode);
  const cut = src.indexOf(":");
  return cut > -1 ? src.slice(0, cut).trim() : "";
};

const isSchedule = (productKey) => /-materials?$/i.test(String(productKey || ""));
const isCivil = (productKey) => /^civil3d/i.test(String(productKey || ""));

const WEEK = 6; /* working days in a week, six-day site */

/* Sundays are not worked, so a duration in working days is not a duration in
   calendar days and the finish date has to walk. */
function addDays(d, n) {
  const x = new Date(d.getTime());
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    x.setDate(x.getDate() + 1);
    if (x.getDay() !== 0) left -= 1;
  }
  return x;
}
const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* Start on the next working day rather than a date typed into the source, so
   the programme somebody opens today is a programme they could start today. */
function firstWorkingDay() {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return d.getDay() === 0 ? addDays(d, 1) : d;
}

/* Crews and outputs are the two planning decisions on this screen, and both
   are held against the project — the gangs a practice can field on one job say
   nothing about another. His build keeps crews in localStorage for the same
   reason: they are somebody's judgement, not a measurement to sync. */
const readStore = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
};
const writeStore = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a planning preference is not worth an error state */
  }
};

export default function DsWorkProgramme() {
  const { accessToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = React.useState(null);
  const [project, setProject] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [schedules, setSchedules] = React.useState(0);
  const [crews, setCrews] = React.useState({});
  const [outputs, setOutputs] = React.useState({});
  const [basis, setBasis] = React.useState({});
  const [ai, setAi] = React.useState({ busy: false, error: "", ran: "" });

  const chosenId = params.get("p") || "";

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/projects-rollup", { token: accessToken })
      .then((d) => {
        if (!alive) return;
        const all = Array.isArray(d?.projects) ? d.projects : d?.items || [];
        // The shelf is "has work that can be sequenced", not "is a bill".
        //
        // That distinction is the whole reason HERON and CIVIQ were missing:
        // in this account every one of their projects is a materials schedule,
        // and excluding schedules wholesale left two products looking like
        // products nobody had used. But a HERON schedule carries the real
        // trade, quantity and original wording on each labour line, and a
        // CIVIQ road carries its operation in the description — both are
        // programmes. A Revit MEP schedule is a list of diffuser part numbers
        // with no trade anywhere, and is not.
        //
        // tradedItems is counted server-side in /me/projects-rollup, because
        // the answer needs every line of every project and the shelf holds
        // only summaries.
        const can = all.filter((p) => Number(p.tradedItems) > 0);
        setSchedules(all.length - can.length);
        setProjects(can);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Nothing is assumed open. The screen starts on the products, opens to that
  // product's projects, and only then to a programme — so the first thing
  // somebody sees is their own shelf rather than whichever project happened to
  // be touched last, which is never the one they came for.
  const current = React.useMemo(() => {
    if (!projects?.length || !chosenId) return null;
    return projects.find((p) => String(p.id) === chosenId) || null;
  }, [projects, chosenId]);

  // One card per product, over the product the work BELONGS to — the same
  // grouping the Projects screen uses, so a schedule saved under
  // planswift-materials counts toward HERON rather than opening a folder of
  // its own. See DsWorkProjects for the reasoning.
  const folders = React.useMemo(() => {
    if (!projects) return null;
    const by = new Map();
    for (const p of projects) {
      const key = p.baseProductKey || p.productKey || "other";
      let f = by.get(key);
      if (!f) {
        f = { key, count: 0, items: 0, value: 0, touched: null };
        by.set(key, f);
      }
      f.count += 1;
      f.items += Number(p.itemCount) || 0;
      f.value += Number(p.totalCost) || 0;
      if (!f.touched || new Date(p.updatedAt) > new Date(f.touched)) f.touched = p.updatedAt;
    }
    return [...by.values()]
      .map((f) => ({ ...f, name: PRODUCT[f.key] || (f.key === "other" ? "Imported" : f.key) }))
      .sort((a, b) => b.value - a.value || b.count - a.count);
  }, [projects]);

  // The open folder rides in the URL rather than in state, which is the one
  // place this differs from the Projects screen. There, opening a folder is
  // the whole navigation; here it is a step on the way to a programme, and
  // coming back from one should land on the shelf you left rather than at the
  // top again.
  const openKey = params.get("s") || "";
  const inFolder = React.useMemo(
    () =>
      !openKey || !projects
        ? []
        : projects
            .filter((p) => (p.baseProductKey || p.productKey || "other") === openKey)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [projects, openKey],
  );

  React.useEffect(() => {
    if (!accessToken || !current) return undefined;
    let alive = true;
    setProject(null);
    apiAuthed(`/projects/${current.productKey}/${current.id}`, { token: accessToken })
      .then((d) => alive && setProject(d?.project || d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, current]);

  // Reload this project's own crews and outputs whenever the project changes.
  React.useEffect(() => {
    if (!current) return;
    setCrews(readStore(`adlm-crews:${current.id}`, {}));
    setOutputs(readStore(`adlm-output:${current.id}`, {}));
    setBasis(readStore(`adlm-basis:${current.id}`, {}));
    setAi({ busy: false, error: "", ran: "" });
  }, [current]);

  // A road and a building are sequenced from different tables. The flag rides
  // through rather than being read from state, because `plan` recomputes for a
  // project the callbacks were not built for otherwise.
  const civil = isCivil(current?.productKey);

  const crewsFor = React.useCallback(
    (trade, road) => {
      if (crews[trade] != null) return crews[trade];
      return (road ? CIVIL_SEQ : SEQ).find((s) => s.trade === trade)?.crews || 2;
    },
    [crews],
  );

  const outputFor = React.useCallback(
    (trade, unit, road) => {
      const key = `${trade}|${unit}`;
      if (outputs[key] != null) return outputs[key];
      const table = road ? CIVIL_OUTPUT : OUTPUT;
      return table[trade]?.[unit] ?? table[road ? "Civil" : "Other"]?.[unit] ?? 0;
    },
    [outputs],
  );

  const setCrew = (trade, delta) => {
    const next = { ...crews, [trade]: Math.max(1, Math.min(12, crewsFor(trade, civil) + delta)) };
    setCrews(next);
    writeStore(`adlm-crews:${current.id}`, next);
  };

  const setOutput = (trade, unit, value) => {
    const n = Number(value);
    const key = `${trade}|${unit}`;
    const next = { ...outputs, [key]: Number.isFinite(n) && n > 0 ? n : 0 };
    setOutputs(next);
    writeStore(`adlm-output:${current.id}`, next);
    // A figure somebody types replaces the estimate AND its reasoning. Leaving
    // the model's basis attached to a number it no longer explains would be
    // the worst of both: an assumption wearing somebody else's argument.
    if (basis[key]) {
      const nb = { ...basis };
      delete nb[key];
      setBasis(nb);
      writeStore(`adlm-basis:${current.id}`, nb);
    }
  };

  /* Ask for a gang output per trade and unit, read off the lines' own words.
     See server/routes/programme.js for what is and is not being claimed. */
  const estimate = React.useCallback(
    async (projectRef) => {
      if (!projectRef || !accessToken) return;
      setAi({ busy: true, error: "", ran: String(projectRef.id) });
      try {
        const d = await apiAuthed(
          `/programme/${projectRef.productKey}/${projectRef.id}/outputs`,
          { token: accessToken, method: "POST", body: {} },
        );
        const got = d?.outputs || {};
        const nums = {};
        const notes = {};
        for (const [k, v] of Object.entries(got)) {
          const n = Number(v?.output);
          if (!Number.isFinite(n) || n <= 0) continue;
          nums[k] = n;
          if (v.basis) notes[k] = v.basis;
        }
        if (!Object.keys(nums).length) {
          setAi({ busy: false, error: "Nothing usable came back.", ran: String(projectRef.id) });
          return;
        }
        // Merged over the seeds, under nothing. An output already typed by
        // hand is somebody's own knowledge of their own gangs and outranks an
        // estimate, so it is not overwritten.
        const nextOut = { ...nums, ...outputs };
        const nextBasis = { ...notes, ...basis };
        for (const k of Object.keys(outputs)) delete nextBasis[k];
        setOutputs(nextOut);
        setBasis(nextBasis);
        writeStore(`adlm-output:${projectRef.id}`, nextOut);
        writeStore(`adlm-basis:${projectRef.id}`, nextBasis);
        setAi({ busy: false, error: "", ran: String(projectRef.id) });
      } catch (e) {
        setAi({
          busy: false,
          error:
            e?.status === 429
              ? "This month's AI allowance is spent — the seeded outputs are still editable below."
              : e?.status === 503
                ? "No AI provider is configured on this server."
                : "The estimate could not be made just now.",
          ran: String(projectRef.id),
        });
      }
    },
    [accessToken, outputs, basis],
  );

  /* Run it once, unprompted, the first time a project's programme is opened.
     That is the point of the feature: a programme should arrive with durations
     argued from the work, not with a table of blanks to fill in. It never
     re-runs on its own — the outputs are stored, so a second visit costs
     nothing, and re-running is a button. */
  React.useEffect(() => {
    if (!project || !current) return;
    if (ai.busy || ai.ran === String(current.id)) return;
    if (Object.keys(readStore(`adlm-output:${current.id}`, {})).length) return;
    estimate(current);
  }, [project, current, ai.busy, ai.ran, estimate]);

  const plan = React.useMemo(() => {
    if (!project) return null;
    const items = Array.isArray(project.items) ? project.items : [];
    const road = isCivil(current?.productKey);

    // Which lines ARE the work. See the note above NOT_A_TRADE: a schedule
    // programmes its labour lines where it has traded ones, and its traded
    // lines otherwise; a bill programmes everything that is not a derived
    // component, because on a bill those are the same work counted twice.
    let source;
    if (isSchedule(current?.productKey)) {
      const traded = items.filter((i) => (Number(i.qty) || 0) > 0 && tradeOf(i));
      const lab = traded.filter((i) => kindOf(i) === "labour");
      source = lab.length ? lab : traded;
    } else {
      source = items.filter((i) => !kindOf(i));
    }

    const byTrade = new Map();
    let unprogrammed = 0; /* lines with no output for their unit */
    let untraded = 0; /* lines the plugin left without a trade */
    let billValue = 0; /* the whole bill, done and undone */
    let doneValue = 0; /* what the bill says has already been earned */
    let settled = 0; /* lines with nothing left on them */

    for (const it of source) {
      const q = Number(it.qty) || 0;
      if (q <= 0) continue;

      const rate = Number(it.rate) || 0;
      billValue += q * rate;

      // A programme is a plan for the work that is LEFT. The bill already
      // records what has been done — `completed` when a line is signed off and
      // `percentComplete` while it is running — so a job half built should not
      // be handed a programme for the whole of it. Where nothing is recorded
      // this is the whole quantity and the screen is unchanged.
      const left = it.completed
        ? 0
        : Math.min(1, Math.max(0, 1 - (Number(it.percentComplete) || 0) / 100));
      doneValue += q * rate * (1 - left);
      if (left <= 0) {
        settled += 1;
        continue;
      }
      const qLeft = q * left;

      const unit = normUnit(it.unit);
      // On a road the trade field says "Civil" on every line, so the operation
      // has to come from what the line is called. Everywhere else the plugin
      // wrote a real trade and the name is just a name.
      const named = lineName(it, tradeOf(it) || "Work", unit);
      const trade = road ? civilStage(named) : tradeOf(it);
      if (!trade) {
        untraded += 1;
        continue;
      }
      const out = outputFor(trade, unit, road);
      const gangDays = out > 0 ? qLeft / out : 0;
      if (out <= 0) unprogrammed += 1;

      let t = byTrade.get(trade);
      if (!t) {
        t = { trade, gangDays: 0, value: 0, items: [] };
        byTrade.set(trade, t);
      }
      t.gangDays += gangDays;
      t.value += qLeft * rate;
      t.items.push({ it, unit, out, gangDays, qty: qLeft, part: left < 1, name: named, amount: qLeft * rate });
    }

    // Sequence in the building order, then anything the sequence does not name
    // after the last trade it does — a bill is allowed to carry a trade we
    // have never seen, and dropping it would drop its money too.
    const seq = road ? CIVIL_SEQ : SEQ;
    const seqAt = road ? CIVIL_SEQ_AT : SEQ_AT;
    const present = [...byTrade.values()].sort(
      (a, b) => (seqAt.get(a.trade) ?? 99) - (seqAt.get(b.trade) ?? 99),
    );

    const done = new Map();
    const rows = [];
    let lastKnown = null;
    for (const t of present) {
      const s = seq.find((x) => x.trade === t.trade) || { after: lastKnown, over: 0.5 };
      const n = Math.max(1, crewsFor(t.trade, road));
      const dur = Math.max(1, Math.ceil(t.gangDays / n));
      const prev = s.after ? done.get(s.after) : null;
      const start = prev ? Math.round(prev.start + prev.dur * s.over) : 0;
      const row = { ...t, crews: n, dur, start, over: s.over, after: s.after };
      done.set(t.trade, row);
      if (seqAt.has(t.trade)) lastKnown = t.trade;
      rows.push(row);
    }

    const end = rows.reduce((a, r) => Math.max(a, r.start + r.dur), 0);

    // Peak gangs: how many are on site on the busiest day. This is the number
    // that decides whether a programme is affordable, not the finish date.
    let peak = 0;
    for (let d = 0; d < end; d += 1) {
      let on = 0;
      for (const r of rows) if (d >= r.start && d < r.start + r.dur) on += r.crews;
      peak = Math.max(peak, on);
    }

    return {
      rows,
      end,
      peak,
      unprogrammed,
      untraded,
      settled,
      billValue,
      doneValue,
      value: rows.reduce((a, r) => a + r.value, 0),
      gangDays: rows.reduce((a, r) => a + r.gangDays, 0),
    };
  }, [project, current, crewsFor, outputFor]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="ds-sub">The programme could not be loaded just now. Please refresh.</p>
      </div>
    );
  }

  // The switcher is for moving between programmes, so it only exists once one
  // is open. On the shelf the cards ARE the choice.
  const options = (projects || [])
    .filter((p) => !openKey || (p.baseProductKey || p.productKey || "other") === openKey)
    .map((p) => ({
      value: String(p.id),
      label: p.name || "Untitled project",
      note: PRODUCT[p.baseProductKey] || PRODUCT[p.productKey] || "Imported",
    }));

  const folder = folders?.find((f) => f.key === openKey) || null;

  // Up one level: a programme closes back to its product's shelf, a shelf
  // closes back to the products.
  const goUp = () => {
    if (current && openKey) setParams({ s: openKey });
    else setParams({});
  };

  const start = firstWorkingDay();
  const weeks = plan?.end ? Math.max(1, Math.ceil(plan.end / WEEK)) : 0;
  const finish = plan ? addDays(start, plan.end) : start;

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          {(openKey || current) && (
            <p className="wk-ref">
              <button type="button" className="prg-back" onClick={goUp}>
                ← {current ? folder?.name || "Projects" : "All products"}
              </button>
            </p>
          )}
          <h1>{current ? project?.name || "Programme" : folder ? folder.name : "Programme"}</h1>
          <p>
            {current && plan?.rows.length
              ? `${plan.rows.length} trade${plan.rows.length === 1 ? "" : "s"}, sequenced from the quantities already measured. Nothing here was estimated by hand.`
              : folder
                ? `${folder.count} project${folder.count === 1 ? "" : "s"} measured in ${folder.name}. Open one to see it sequenced.`
                : "Every project you have measured, sequenced from its own quantities. Open a product, then a project."}
          </p>
        </div>
        <div className="wk-acts">
          {current && options.length > 1 && (
            <WkDropdown
              label="Project"
              value={String(current.id)}
              options={options}
              onPick={(v) => setParams(openKey ? { s: openKey, p: v } : { p: v }, { replace: true })}
            />
          )}
          <WkPrefs />
        </div>
      </div>

      {!projects || (current && !project) ? (
        <p className="ds-sub">{current ? "Loading the programme…" : "Loading…"}</p>
      ) : !projects.length ? (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>Nothing to programme yet</h2>
          </div>
          <p className="wk-note">
            A programme is built from a measured bill. Save a project from QUIV, HERON, Revit
            MEP or CIVIQ and it appears here, sequenced.
          </p>
        </section>
      ) : !current && !openKey ? (
        /* Level one: the products. A card per product, over the projects that
           belong to it — the same shelf the Projects screen opens on, so the
           two surfaces do not disagree about how many QUIV projects exist. */
        <div className="wk-projs">
          {folders.map((f) => (
            <button
              type="button"
              className="wk-proj prg-card"
              key={f.key}
              onClick={() => setParams({ s: f.key })}
            >
              <div className="t">
                <h3>
                  {ICONS[f.key] && <img src={ICONS[f.key]} alt="" />}
                  {f.name}
                </h3>
                <span className="stage">
                  {f.count} project{f.count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="c">
                {f.key === "other" ? "No extraction source recorded" : `Measured in ${f.name}`}
                {f.touched ? ` · touched ${when(f.touched)}` : ""}
              </p>
              <div className="f">
                <div>
                  <b>{count(f.items)}</b>
                  <span>items</span>
                </div>
                <div>
                  <b>{money(f.value)}</b>
                  <span>value</span>
                </div>
              </div>
            </button>
          ))}
          {schedules > 0 && (
            <p className="wk-note prg-aside">
              {schedules} project{schedules === 1 ? " is" : "s are"} not shown, because no line on
              {schedules === 1 ? " it" : " them"} carries a trade — mostly Revit MEP equipment
              schedules, which are lists of parts rather than work. A programme is a sequence of
              trades, and there is nothing in them to sequence.
            </p>
          )}
        </div>
      ) : !current ? (
        /* Level two: this product's projects. Opening one is a navigation —
           the programme it builds is addressable, so it gets a URL. */
        <div className="wk-projs">
          {inFolder.map((p) => (
            <button
              type="button"
              className="wk-proj prg-card"
              key={p.id}
              onClick={() => setParams({ s: openKey, p: String(p.id) })}
            >
              <div className="t">
                <h3>{p.name || "Untitled project"}</h3>
                <span className="stage">
                  {count(p.itemCount)} item{Number(p.itemCount) === 1 ? "" : "s"}
                </span>
              </div>
              <p className="c">
                {p.isMaterials
                  ? "Material and labour schedule"
                  : p.origin === "boq-import"
                    ? "Imported from a BoQ"
                    : "Measured off the model"}
                {p.updatedAt ? ` · touched ${when(p.updatedAt)}` : ""}
              </p>
              <div className="f">
                <div>
                  <b>{money(p.totalCost)}</b>
                  <span>bill value</span>
                </div>
                <div>
                  <b>Open</b>
                  <span>the programme</span>
                </div>
              </div>
            </button>
          ))}
          {!inFolder.length && (
            <p className="ds-sub">Nothing measured in {folder?.name || "this product"} yet.</p>
          )}
        </div>
      ) : !plan?.rows.length ? (
        <section className="wk-panel">
          <div className="wk-ph">
            <h2>{project?.name}</h2>
            <span className="wk-locnote">Nothing on this bill can be sequenced</span>
          </div>
          <p className="wk-note">
            {plan?.untraded
              ? `All ${plan.untraded} line${plan.untraded === 1 ? "" : "s"} on this bill were saved without a trade, and a programme is a sequence of trades. Re-save the project from the plugin with trades set, or pick another project above.`
              : "This project has no priced quantities to sequence."}
          </p>
        </section>
      ) : (
        <>
          <div className="dsh-stats">
            <div className="dsh-stat">
              <span className="k">{plan.settled ? "Left to run" : "Duration"}</span>
              <b>
                {weeks}
                <span className="u">weeks</span>
              </b>
              <span className="ds-sub">{plan.end} working days, six-day week</span>
            </div>
            <div className="dsh-stat">
              <span className="k">Start on site</span>
              <b>{fmt(start)}</b>
              <span className="ds-sub">{start.getFullYear()}</span>
            </div>
            <div className="dsh-stat">
              <span className="k">Practical completion</span>
              <b>{fmt(finish)}</b>
              <span className="ds-sub">{finish.getFullYear()}</span>
            </div>
            <div className="dsh-stat">
              <span className="k">Peak gangs on site</span>
              <b>{plan.peak}</b>
              <span className="ds-sub">across every trade running at once</span>
            </div>
          </div>

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>The programme</h2>
              <span className="wk-locnote">Add or remove a gang and the whole chain moves</span>
            </div>
            <div className="wk-gantt">
              <div className="wk-ghd">
                <span>Trade</span>
                <span className="rl">
                  {Array.from({ length: weeks }, (_, i) => (
                    <span key={i} style={{ width: `${100 / weeks}%` }}>
                      {i % 2 ? "" : `W${i + 1}`}
                    </span>
                  ))}
                </span>
                <span>Gangs</span>
                <span>Dates</span>
                <span>Value</span>
              </div>
              {plan.rows.map((r) => (
                <div className="wk-gr" data-trade={r.trade} key={r.trade}>
                  <span className="t">{r.trade}</span>
                  <span className="g">
                    <em
                      className="b"
                      style={{
                        left: `${((r.start / plan.end) * 100).toFixed(2)}%`,
                        width: `${((r.dur / plan.end) * 100).toFixed(2)}%`,
                      }}
                    >
                      <i>{r.dur}d</i>
                    </em>
                  </span>
                  <span className="c">
                    <button
                      type="button"
                      onClick={() => setCrew(r.trade, -1)}
                      aria-label={`One gang fewer on ${r.trade}`}
                    >
                      −
                    </button>
                    <b>{r.crews}</b>
                    <button
                      type="button"
                      onClick={() => setCrew(r.trade, 1)}
                      aria-label={`One gang more on ${r.trade}`}
                    >
                      +
                    </button>
                  </span>
                  <span className="d">
                    {fmt(addDays(start, r.start))} – {fmt(addDays(start, r.start + r.dur))}
                  </span>
                  <span className="v">{money(r.value)}</span>
                </div>
              ))}
            </div>
            <p className="wk-note">
              {plan.doneValue > 0 &&
                `${money(plan.doneValue)} of this bill is already recorded as done, so what follows is the work that is left: ${plan.settled} line${plan.settled === 1 ? " is" : "s are"} off the programme entirely, and a part-finished line carries only its outstanding quantity. `}
              Every duration is the quantity measured off the model divided by the gang output
              for that work, divided again by the gangs put on it. Trades start at their normal
              overlap rather than waiting for the one before to finish — blockwork begins when
              the frame is 60% through, not after the last beam. The value beside each bar is
              that trade&rsquo;s own lines on the bill, at the bill&rsquo;s own rates.
            </p>
          </section>

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>Where the time comes from</h2>
              <span className="wk-locnote">
                {money(plan.value)} across {num(Math.round(plan.gangDays))} gang-days
                <button
                  type="button"
                  className="prg-est"
                  onClick={() => estimate(current)}
                  disabled={ai.busy}
                >
                  {ai.busy
                    ? "Reading the bill…"
                    : Object.keys(basis).length
                      ? "Estimate again"
                      : "Estimate the outputs"}
                </button>
              </span>
            </div>
            <div className="wk-qt prg-qt">
              <div className="wk-qhd">
                <span>Item of work</span>
                <span>Trade</span>
                <span>Quantity</span>
                <span>Output</span>
                <span>Gang-days</span>
                <span>Cost</span>
              </div>
              {plan.rows.map((r) =>
                r.items.map((g, i) => (
                  <div className="wk-qr" key={`${r.trade}-${i}`}>
                    <span className="d">
                      <Link to={`/work/project/${current.productKey}/${current.id}`}>
                        {g.name}
                      </Link>
                      <em>
                        {g.it.takeoffLine ||
                          g.it.level ||
                          lineSection(g.it) ||
                          g.it.category ||
                          r.trade}
                      </em>
                    </span>
                    <span className="s">{r.trade}</span>
                    <span className="q">
                      {num(g.qty)}
                      <i>{g.it.unit || g.unit}</i>
                    </span>
                    <span className="r">
                      <input
                        className={`prg-out${basis[`${r.trade}|${g.unit}`] ? " est" : ""}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={g.out || ""}
                        onChange={(e) => setOutput(r.trade, g.unit, e.target.value)}
                        title={basis[`${r.trade}|${g.unit}`] || undefined}
                        aria-label={`Gang output for ${r.trade} measured in ${g.unit}${
                          basis[`${r.trade}|${g.unit}`]
                            ? `. Estimated: ${basis[`${r.trade}|${g.unit}`]}`
                            : ""
                        }`}
                      />
                      <i>{g.unit}/day</i>
                    </span>
                    <span className="ds-a">{g.out > 0 ? num(g.gangDays) : "—"}</span>
                    <span className="v">{money(g.amount)}</span>
                  </div>
                )),
              )}
              <div className="wk-qtot">
                <span>Total gang-days</span>
                <b>{num(Math.round(plan.gangDays))}</b>
              </div>
            </div>
            <p className="wk-note">
              A gang-day is one gang working one day. The blocklayer gang lays 16.7 m² a day, so
              1,842 m² of 225mm wall is 110 gang-days — three gangs, 37 days. The quantity, the
              trade and the cost on every line are the bill&rsquo;s own; the output is the one
              number the bill does not carry, so it is seeded with an ordinary building figure
              and editable here. It is held per trade and per unit, so changing it on one line
              changes it for every line of that trade measured the same way.
              {Object.keys(basis).length > 0 &&
                " The figures with a rule under them were estimated from the wording of the lines themselves — hover one to read what was assumed. They are an argued assumption, not a measurement, and typing over one replaces it for good."}
              {ai.error ? ` ${ai.error}` : ""}
              {plan.unprogrammed > 0 &&
                ` ${plan.unprogrammed} line${plan.unprogrammed === 1 ? " is" : "s are"} measured in a unit with no output set, so ${plan.unprogrammed === 1 ? "it adds" : "they add"} cost but no time until one is typed in.`}
              {plan.untraded > 0 &&
                ` ${plan.untraded} line${plan.untraded === 1 ? " was" : "s were"} saved without a trade and could not be sequenced at all.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
