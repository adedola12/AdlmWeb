/**
 * Fills in the course details for `BIM-MEP-25` ("BIM Course on Building
 * Services (MEP and HVAC)").
 *
 * REWRITTEN 2026-08-06 against the actual recordings.
 *
 * The first version of this file was a reconstruction: it was written before
 * anyone had located the class videos, and it proposed a six-week programme
 * modelled on the sibling building-works course — week 3 on load analysis and
 * pressure loss, week 6 on clash detection, COBie and handover.
 *
 * The recordings say otherwise. The cohort ran for FIVE weeks and sixteen
 * sessions, and the arc is:
 *
 *   week 1  foundations — BIM/AI/data analytics for MEP cost management
 *   week 2  3D — MEP and HVAC design in Revit
 *   week 3  4D — programme of work and resource management
 *   week 4  5D — quantification, bill preparation and cash flow
 *   week 5  data analytics, EVMS and Power BI dashboards
 *
 * There is no analysis week and no week 6: the load-analysis, clash-detection
 * and COBie material in the old draft was never delivered, so it is gone from
 * here rather than left promising students content that does not exist.
 *
 * Titles come from the recap clip recorded alongside each session, which names
 * its own subject. Week 1 has no recaps; its first two titles come from the
 * slide decks filed with them, and W1P3 is the one genuine guess in the file.
 *
 *   node scripts/seed-course-bim-mep-25.mjs            # dry run
 *   node scripts/seed-course-bim-mep-25.mjs --apply    # writes to the DB
 *
 * Re-running is safe: modules merge by `code` and keep whatever video the
 * ingest has already attached.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";

const SKU = "BIM-MEP-25";
const APPLY = process.argv.includes("--apply");

const blurb =
  "BIM, AI and Data Analytics for MEP and HVAC cost management — 3D services modelling in Revit, 4D programme and resource management, 5D takeoff, bill preparation and cash flow with the ADLM MEP plugin, and Power BI dashboards.";

const description = `The services counterpart to our building works programme: five weeks taking one
MEP and HVAC scheme from design intent through to a priced, programmed model and
a dashboard your client can read.

What you work with:
• Autodesk Revit (mechanical, electrical, plumbing and HVAC systems modelling)
• Microsoft Project (services installation programme, resources, tracking)
• ADLM MEP plugin for Revit — takeoff across the services disciplines
• ADLM RateGen (material and labour rates, rate build-up, budget summary)
• Power BI (cost and progress dashboards, EVMS)
• ChatGPT and Gemini (design checks, schedule optimisation, reporting)

How it runs:
• 5 weeks, 16 recorded sessions, 100% online
• Self-paced — every session is recorded, so you work to your own timetable
• Most sessions carry a 2–4 minute recap clip you can use to revise the week
• Portfolio-driven: the weekly assignment builds one continuous services project

Week 1 — BIM, AI and data analytics for MEP and HVAC cost management
Week 2 — 3D: MEP and HVAC design in Revit
Week 3 — 4D: programme of work and resource management
Week 4 — 5D: quantification, bill preparation and cash flow forecasting
Week 5 — Data analytics, EVMS and Power BI dashboards

You need a Windows PC able to run Revit 2024 (or newer), a Google account, and a
reliable internet connection. The ADLM MEP plugin is licensed separately from the
course — installation support is available Monday to Friday.`;

const modules = [
  // ── Week 1 — foundations ────────────────────────────────────────────────
  {
    code: "W1P1",
    title:
      "Week 1 · Part 1 — BIM, AI and data analytics for MEP and HVAC cost management",
    instructions:
      "The opening session: what the programme covers and why cost management for building services is the thread running through it. BIM as a process rather than a software, the dimensions from 3D through 5D, and where AI and data analytics actually earn their place in an MEP workflow.",
  },
  {
    code: "W1P2",
    title:
      "Week 1 · Part 2 — Introduction to MEP and HVAC systems for new MEP/HVAC BIM managers",
    instructions:
      "The systems themselves, for people coming to services from architecture, structures or quantity surveying: mechanical, electrical, plumbing and HVAC, what each one is made of, and the vocabulary you need before you can model or measure any of it.",
  },
  {
    code: "W1P3",
    title: "Week 1 · Part 3 — Getting set up for the MEP workflow",
    requiresSubmission: true,
    instructions:
      "Session 3 of week 1. This is the one module whose subject is inferred rather than taken from the recording's own recap — week 1 has no recap clips — so check it against the video and rename it in /admin/courses if it is wrong.",
    assignmentPrompt: `Choose a realistic building services scheme to carry for the whole programme — an office floor, a hospital wing, a residential block, whatever suits your practice.

Submit:
1. A short brief describing the scheme and its services scope.
2. Your project folder structure, with the naming convention you will use.
3. A screenshot of your Revit project set up and ready to model.`,
  },

  // ── Week 2 — 3D ─────────────────────────────────────────────────────────
  {
    code: "W2P1",
    title: "Week 2 · Part 1 — 3D MEP and HVAC design in Revit",
    instructions:
      "Into Revit: the Systems environment, linking the architectural model, and starting the services model. System types, naming and how the model has to be organised now so that it can be measured later.",
  },
  {
    code: "W2P2",
    title: "Week 2 · Part 2 — Revit for MEP system design: a comprehensive guide",
    instructions:
      "The long working session on the modelling itself — ductwork, pipework, fittings and terminals, plumbing runs, electrical devices and lighting — and the parameters that turn geometry into information the takeoff can read.",
  },
  {
    code: "W2P3",
    title: "Week 2 · Part 3 — 3D BIM for HVAC works",
    requiresSubmission: true,
    instructions:
      "HVAC specifically: air distribution, plant and equipment, and the families that carry real manufacturer data. Finishing the 3D model to the standard the rest of the programme depends on.",
    assignmentPrompt: `Model the services for your scheme in Revit, linked to an architectural model.

Submit:
1. The Revit model with mechanical/HVAC, plumbing, electrical and lighting systems modelled and named by system.
2. Type parameters filled in (manufacturer, model, description) for your main equipment, terminals and fixtures.
3. A short note on any modelling decision you had to make and why.`,
  },

  // ── Week 3 — 4D ─────────────────────────────────────────────────────────
  {
    code: "W3P1",
    title: "Week 3 · Part 1 — 4D BIM for MEP projects",
    instructions:
      "Adding time to the model. What 4D is for on a services package, what it needs from the model you built in week 2, and how the installation sequence differs from the main contractor's programme.",
  },
  {
    code: "W3P2",
    title: "Week 3 · Part 2 — Programme of work and resource management",
    instructions:
      "Building the services programme in MS Project: the work breakdown for first fix, second fix, plant, testing and commissioning; durations derived from your own quantities and gang outputs; resources assigned and levelled.",
  },
  {
    code: "W3P3",
    title: "Week 3 · Part 3 — BIM, AI and data analytics in HVAC",
    requiresSubmission: true,
    instructions:
      "The longest session of the programme. Where AI and data analytics fit around the 4D model — checking a sequence, optimising a schedule, and drafting the reporting that comes off it.",
    assignmentPrompt: `Programme the installation of your scheme.

Submit:
1. A services programme in MS Project with durations, predecessors and a project calendar.
2. Resources assigned and levelled.
3. A baseline set, with planned versus complete reporting configured.`,
  },

  // ── Week 4 — 5D ─────────────────────────────────────────────────────────
  {
    code: "W4P1",
    title: "Week 4 · Part 1 — 5D BIM: quantification and cost management in MEP and HVAC",
    instructions:
      "What 5D means for services: measuring from the live model rather than from drawings, and why the quality of the week 2 model decides how much of this is automatic.",
  },
  {
    code: "W4P2",
    title:
      "Week 4 · Part 2 — MEP and HVAC quantification, bill preparation and cash flow forecasting",
    instructions:
      "Takeoff across the services disciplines, turning it into a bill of quantities, and forecasting cash flow off the priced bill and the week 3 programme.",
  },
  {
    code: "W4P3",
    title: "Week 4 · Part 3 — MEP quantification training with the ADLM plugin",
    requiresSubmission: true,
    instructions:
      "Hands-on with the ADLM MEP plugin: takeoff by level, type and system, highlight-in-model to check what a row actually measured, rate build-up with RateGen, and the Budget Summary export.",
    assignmentPrompt: `Price your scheme.

Submit:
1. Takeoff across every discipline present in your model.
2. A services bill of quantities with rates and amounts, showing your build-up.
3. A cash-flow forecast from the priced bill and your week 3 programme.`,
  },

  // ── Week 5 — data analytics ─────────────────────────────────────────────
  {
    code: "W5P1",
    title: "Week 5 · Part 1 — BIM and data analytics in construction",
    instructions:
      "Why the data you have been building all programme is worth more in a dashboard than in a spreadsheet, and what questions a services team should be asking of it.",
  },
  {
    code: "W5P2",
    title: "Week 5 · Part 2 — Restructuring the bill of quantities for data analysis",
    instructions:
      "The unglamorous step everything else depends on: reshaping a bill written for humans into a table Power BI can model — cleaning, normalising and keying it so cost, programme and progress can be joined.",
  },
  {
    code: "W5P3",
    title: "Week 5 · Part 3 — Data analytics and EVMS in construction",
    instructions:
      "Earned value on a services package: planned value, earned value and actual cost, SPI and CPI, and reading them honestly against the programme you baselined in week 3.",
  },
  {
    code: "W5P4",
    title: "Week 5 · Part 4 — Construction data analytics dashboard in Power BI",
    requiresSubmission: true,
    instructions:
      "The final session: building the dashboard itself — cost and schedule KPIs, an executive view, and getting it in front of someone who will not open Revit. Portfolio review and certification.",
    assignmentPrompt: `Final submission — your complete portfolio.

1. A Power BI dashboard covering cost and schedule performance for your scheme.
2. Your EVMS figures (SPI and CPI) with a short read on what they say.
3. Your model, programme and priced bill, filed together.`,
  },
];

/**
 * Keeps whatever the video pipeline has already attached.
 *
 * `summary` is a nested track now, so it has to be carried across explicitly —
 * spreading the module would drop it, and a dropped sourceKey means the next
 * ingest re-uploads gigabytes that are already in S3.
 */
function mergeModules(existing = [], incoming) {
  const byCode = new Map(existing.map((m) => [m.code, m]));
  return incoming.map((m) => {
    const prev = byCode.get(m.code) || {};
    const carried = {};
    for (const field of [
      "videoUrl",
      "durationSec",
      "sourceKey",
      "sourceName",
      "sourceBytes",
      "hlsKey",
      "transcodeJobId",
      "transcodeStatus",
      "transcodeError",
      "summary",
    ]) {
      if (prev[field]) carried[field] = prev[field];
    }
    return {
      code: m.code,
      title: m.title,
      requiresSubmission: Boolean(m.requiresSubmission),
      instructions: m.instructions || "",
      assignmentPrompt: m.assignmentPrompt || "",
      ...carried,
    };
  });
}

await connectDB();

const course = await PaidCourse.findOne({ sku: SKU });
if (!course) {
  console.error(`No course with sku "${SKU}" — nothing to update.`);
  process.exit(1);
}

const nextModules = mergeModules(course.modules, modules);

// Modules that exist today and would disappear. Worth naming individually:
// dropping one silently would take any video attached to it out of reach.
const incomingCodes = new Set(modules.map((m) => m.code));
const dropped = (course.modules || []).filter((m) => !incomingCodes.has(m.code));

console.log(`course: ${course.title} (${SKU})`);
console.log(`blurb:   ${course.blurb?.length || 0} chars -> ${blurb.length} chars`);
console.log(`description: ${course.description?.length || 0} chars -> ${description.length} chars`);
console.log(`modules: ${course.modules?.length || 0} -> ${nextModules.length}`);
for (const m of nextModules) {
  const has = m.sourceKey ? "video" : "     ";
  console.log(`  [${m.code}] ${m.requiresSubmission ? "A" : " "} ${has} ${m.title}`);
}

if (dropped.length) {
  console.log(`\ndropping ${dropped.length} module(s):`);
  for (const m of dropped) {
    console.log(`  [${m.code}] ${m.title}${m.sourceKey ? "  ⚠ HAS AN ARCHIVED VIDEO" : ""}`);
  }
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write these to the database.");
  process.exit(0);
}

course.blurb = blurb;
course.description = description;
course.modules = nextModules;
await course.save();
console.log("\nSaved.");
process.exit(0);
