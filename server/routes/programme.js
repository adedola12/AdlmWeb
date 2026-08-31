// server/routes/programme.js
//
// Gang outputs for the programme, estimated from the bill's own words.
//
// WHY THIS EXISTS
//
// A programme is quantity ÷ output ÷ gangs. The bill carries the quantity and
// the trade; the output — how much one gang does in a day — is the one number
// nothing in the platform holds. appliedRateKey is empty on every bill line in
// the database, the shared labour library has no rows, and Time Pro's recorded
// tasks are an empty collection, so there is nowhere to read it from. Until
// this endpoint the programme seeded a default per trade and asked somebody to
// correct it by hand, for every unit of every trade, on every project.
//
// The line descriptions, though, are specific: "Vibrated hollow sandcrete
// blocks in cement mortar (1:6), 230mm thick, vertical" says far more about
// how fast the work goes than the word "Masonry" does. That is a judgement
// about construction expressed in prose, which is the shape of problem a model
// is actually good at, so this asks one.
//
// WHAT IT IS NOT
//
// It is not a measurement, and the screen never presents it as one. Every
// figure comes back with a one-line basis and stays editable — a QS who knows
// their own gangs overrides it and the programme moves. The model is being
// asked to replace a hand-typed assumption with a better-argued assumption,
// not to invent evidence.
//
// The bill is read here, server-side, from the caller's own project. Nothing
// the client sends about quantities is trusted, because the answer feeds a
// programme somebody may price work against.

import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { createMessage, providerConfigured } from "../services/aiClient.js";
import { checkAiAllowance } from "../services/aiUsage.js";

const router = express.Router();
router.use(requireAuth);

// One call covers a whole project, so the cap is on the number of DISTINCT
// trade-and-unit groups, not on lines. A bill of four thousand rows is still
// a dozen or so groups; anything past this is a bill whose trades have not
// been set, and estimating sixty of them would be answering the wrong question.
const MAX_GROUPS = 40;
const SAMPLES_PER_GROUP = 6;

/* Same normalisation the screen uses. HERON writes "CU M" where QUIV writes
   "m3"; an output held against one has to find lines measured as the other. */
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

/* These rules MUST match client/src/ds/DsWorkProgramme.jsx, which groups the
   same bill for display. If the two disagree the estimator answers about
   groups the screen never shows, and the screen shows groups with no estimate.
   The reasoning behind each of them is written out there. */
const NOT_A_TRADE = new Set(["labour", "labor", "material", "materials"]);
const kindOf = (it) => String(it.componentKind || "").trim().toLowerCase();
const tradeOf = (it) => {
  const t = String(it.trade || "").trim();
  return t && !NOT_A_TRADE.has(t.toLowerCase()) ? t : "";
};
const beforeGuid = (v) => String(v || "").split("|")[0].trim();

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

const isSchedule = (k) => /-materials?$/i.test(String(k || ""));
const isCivil = (k) => /^civil3d/i.test(String(k || ""));

const SYSTEM = `You are a Nigerian quantity surveyor setting the labour outputs
for a construction programme.

You are given groups of bill items from one real project. Each group is one
trade measured in one unit, with the total quantity and a few of the actual
line descriptions.

For each group, give the OUTPUT: how much ONE GANG completes in ONE WORKING DAY,
expressed in that group's unit. A gang is the normal crew for that trade on a
Nigerian site — for blockwork a blocklayer with two labourers, for concrete a
placing gang of six to eight, and so on.

Judge from the descriptions, not from the trade name alone. 230mm blockwork in
cement mortar and 150mm blockwork are different rates. Concrete placed in a
column is slower per cubic metre than concrete in a slab. Excavation by hand and
excavation by machine differ by an order of magnitude — if the description does
not say, assume the ordinary Nigerian method for that kind and size of work and
say which you assumed.

Rules:
- output must be a positive number in the unit given, per gang per day
- ordinary ranges: blockwork 12-20 m2, wall rendering 25-40 m2, concrete
  6-12 m3, formwork 15-25 m2, reinforcement fixing 150-350 kg, hand excavation
  8-20 m3, painting 40-80 m2, floor tiling 15-25 m2
- if a group's descriptions are too vague or the unit makes no sense for the
  trade, still give your best ordinary figure and say so in the basis
- ROAD AND CIVIL WORK is done by plant, not by hand, and the outputs are one to
  two orders of magnitude larger: a gang here means an excavator with its
  tipper fleet, a grader, a paver. Ordinary ranges: bulk excavation 200-500 m3,
  disposal 150-400 m3, embankment filling 150-400 m3, formation trimming
  800-1500 m2, geotextile laying 600-1000 m2, subbase and base 300-700 m2,
  asphalt surfacing 500-1000 m2, kerb laying 40-90 m. Only assume hand work if
  the description says so
- basis is ONE sentence, under 140 characters, saying what you assumed and why

Write in British English. Return ONLY a JSON object, no prose and no code fence:
{"outputs":[{"key":"<the group key given to you>","output":16.7,"basis":"..."}]}`;

/** The model's reply, validated before it is allowed to move a programme. */
function parseOutputs(raw, allowed) {
  const text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the reply");

  let obj;
  try {
    obj = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
  } catch {
    // A reply cut off by the token ceiling loses its last group, not all of
    // them: pull out the objects that did close and keep those.
    const rows = [];
    let depth = 0;
    let open = -1;
    const from = text.indexOf("[", text.indexOf('"outputs"'));
    for (let i = Math.max(0, from); i < text.length && from >= 0; i += 1) {
      if (text[i] === "{") {
        if (depth === 0) open = i;
        depth += 1;
      } else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0 && open >= 0) {
          try {
            rows.push(JSON.parse(text.slice(open, i + 1)));
          } catch {
            /* a row that will not parse on its own is dropped */
          }
          open = -1;
        }
      }
    }
    if (!rows.length) throw new Error("reply was truncated before any group closed");
    obj = { outputs: rows };
  }

  const out = {};
  for (const r of Array.isArray(obj.outputs) ? obj.outputs : []) {
    const key = String(r?.key || "").trim();
    const n = Number(r?.output);
    // Only groups we actually asked about, and only numbers that could be a
    // day's work. A model returning 0 or 900000 for blockwork would otherwise
    // put a trade on the programme for one day or four hundred years.
    if (!allowed.has(key)) continue;
    if (!Number.isFinite(n) || n <= 0 || n > 100000) continue;
    out[key] = {
      output: Math.round(n * 100) / 100,
      basis: String(r?.basis || "").trim().slice(0, 200),
    };
  }
  if (!Object.keys(out).length) throw new Error("no usable outputs survived validation");
  return out;
}

/**
 * POST /programme/:productKey/:id/outputs
 *
 * Reads the caller's own project, groups its bill by trade and unit, and asks
 * for a gang output per group. Returns { outputs: { "Trade|unit": {output,
 * basis} }, groups, model } — the screen merges these into the same store a
 * hand-typed output goes into, so the two are interchangeable and either can
 * be overwritten by the other.
 */
router.post("/:productKey/:id/outputs", async (req, res, next) => {
  try {
    if (!providerConfigured()) {
      return res.status(503).json({
        error: "No AI provider is configured on this server.",
        code: "NOT_CONFIGURED",
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Not a project id" });
    }
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    // Owner or collaborator, and nothing else. Fails closed: a project this
    // person cannot open is a project they cannot spend AI allowance on.
    const project = await TakeoffProject.findOne({
      _id: id,
      productKey: req.params.productKey,
      $or: [{ userId }, { "collaborators.userId": userId }],
    })
      .select("name items productKey")
      .lean();
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Group the bill. Derived material and labour components are the same
    // work counted a second time in its parts, so they are left out — the
    // programme does not sequence them either.
    const items = project.items || [];
    const road = isCivil(req.params.productKey);

    // Which lines ARE the work, decided exactly as the screen decides it: a
    // schedule programmes its labour lines where it has traded ones and its
    // traded lines otherwise, and a bill leaves out derived components. If
    // these two ever disagree, the estimator answers about groups the screen
    // never shows and the screen shows groups with no estimate.
    let source;
    if (isSchedule(req.params.productKey)) {
      const traded = items.filter((i) => (Number(i.qty) || 0) > 0 && tradeOf(i));
      const lab = traded.filter((i) => kindOf(i) === "labour");
      source = lab.length ? lab : traded;
    } else {
      source = items.filter((i) => !kindOf(i));
    }

    const groups = new Map();
    for (const it of source) {
      const q = Number(it.qty) || 0;
      if (q <= 0) continue;
      const unit = normUnit(it.unit);
      if (!unit) continue;
      // On a road every line says "Civil"; the operation is in the name.
      const named = lineName(it, tradeOf(it) || "Work", unit);
      const trade = road ? civilStage(named) : tradeOf(it);
      if (!trade) continue;

      const key = `${trade}|${unit}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, trade, unit, qty: 0, lines: 0, samples: [] };
        groups.set(key, g);
      }
      g.qty += q;
      g.lines += 1;
      // Distinct names only — six copies of one line teaches nothing, and the
      // useful signal is the spread of work inside the group.
      if (named && g.samples.length < SAMPLES_PER_GROUP && !g.samples.includes(named)) {
        g.samples.push(named.slice(0, 220));
      }
    }

    if (!groups.size) {
      return res.status(422).json({
        error:
          "Nothing on this bill carries both a trade and a quantity, so there is no work to put an output against.",
        code: "NO_GROUPS",
      });
    }

    // Biggest first, so if a bill somehow has more groups than the cap the
    // ones that actually drive the programme are the ones estimated.
    const chosen = [...groups.values()].sort((a, b) => b.qty - a.qty).slice(0, MAX_GROUPS);
    const skipped = groups.size - chosen.length;

    const allowance = await checkAiAllowance({
      user: req.user,
      feature: "programme-outputs",
    });
    if (!allowance.allowed) {
      return res.status(429).json({
        error: allowance.reason || "This month's AI allowance is spent.",
        code: allowance.code || "LOCAL_QUOTA",
      });
    }

    const brief = chosen
      .map(
        (g) =>
          `key: ${g.key}\n  trade: ${g.trade}\n  unit: ${g.unit}\n` +
          `  total quantity: ${Math.round(g.qty * 100) / 100} ${g.unit} across ${g.lines} line(s)\n` +
          `  lines:\n${g.samples.map((s) => `    - ${s}`).join("\n") || "    - (no description)"}`,
      )
      .join("\n\n");

    const reply = await createMessage({
      system: SYSTEM,
      maxTokens: 4000,
      temperature: 0.2,
      meta: { feature: "programme-outputs", user: req.user, product: req.params.productKey },
      messages: [
        {
          role: "user",
          content:
            `Project: ${project.name || "Untitled"}\n\n` +
            (road
              ? `This is a ROAD project — civil earthworks and pavement, built with plant. Use the road ranges, not the building ones.

`
              : "") +
            `Give a gang output for each of these ${chosen.length} group(s).\n\n${brief}`,
        },
      ],
    });

    const body =
      reply?.content?.map?.((c) => c.text || "").join("") ?? reply?.text ?? String(reply);
    const outputs = parseOutputs(body, new Set(chosen.map((g) => g.key)));

    return res.json({
      outputs,
      groups: chosen.map((g) => ({ key: g.key, trade: g.trade, unit: g.unit, qty: g.qty, lines: g.lines })),
      skipped,
      model: reply?.model || "",
    });
  } catch (err) {
    console.error("programme/outputs error:", err);
    if (String(err?.message || "").includes("survived validation")) {
      return res.status(502).json({ error: "The estimate came back unreadable. Try again.", code: "BAD_REPLY" });
    }
    return next(err);
  }
});

export default router;
