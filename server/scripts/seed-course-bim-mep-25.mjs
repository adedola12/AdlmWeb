/**
 * Fills in the course details for `BIM-MEP-25` ("BIM Course on Building
 * Services (MEP and HVAC)") — the services counterpart to bim-bld-arch.
 *
 * IMPORTANT — read before publishing:
 * There are no class recordings for this course to work from. Every module
 * below is a DRAFT reconstructed from four sources that ARE real:
 *   1. the course's own existing blurb, which states the arc (3D Revit ->
 *      4D Navisworks + MS Project -> 5D quantification and rate build-up
 *      with ADLM tools -> Power BI dashboards)
 *   2. the sibling building-works programme, whose structure and pedagogy
 *      this course shares (same CDE discipline, same weekly portfolio brief)
 *   3. the ADLM MEP plugin's documented discipline coverage
 *      (client/src/data/changelogs/mep.md) and its pricing flow
 *      (docs/MEP_PLUGIN_PRICING_SPEC.md)
 *   4. the MEP passages in the building-works recordings — the Revit Systems
 *      and Analyse tabs, duct/pipe pressure loss, sizing air conditioning
 *      units, and the MEP model in the federated clash-detection set
 *
 * Treat the titles as settled and the coverage notes as a proposal.
 *
 *   node scripts/seed-course-bim-mep-25.mjs            # dry run
 *   node scripts/seed-course-bim-mep-25.mjs --apply    # writes to the DB
 *
 * Re-running is safe: modules merge by `code` and keep any videoUrl already
 * attached in /admin/courses.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";

const SKU = "BIM-MEP-25";
const APPLY = process.argv.includes("--apply");

// The previous blurb, kept here so it isn't lost with the overwrite:
//   "Master how to integrate BIM, AI, and Data Analytics for MEP/HVAC cost
//    management — from 3D Revit modelling to 4D sequencing in Navisworks + MS
//    Project, 5D quantification and rate build-up with ADLM tools, and Power BI
//    dashboards for real-time insights. 100% online on Google Classroom,
//    self-paced, and portfolio-driven."
// At 319 chars the sales agent was clipping it mid-sentence at 220. This one
// survives intact; the detail it carried now lives in the description.
const blurb =
  "BIM, AI and Data Analytics for MEP and HVAC cost management — 3D services modelling and load checks in Revit, 4D in Navisworks and MS Project, 5D takeoff and rate build-up with the ADLM MEP plugin, Power BI dashboards.";

const description = `The services counterpart to our building works programme: six weeks taking one
MEP and HVAC scheme you choose yourself from design intent through to a priced,
coordinated, handover-ready model.

What you work with:
• Autodesk Revit (mechanical, electrical, plumbing and HVAC systems modelling)
• Revit's analysis tools (heating and cooling loads, duct and pipe pressure loss, panel schedules)
• Autodesk Navisworks (services vs structure clash detection, 4D simulation)
• Microsoft Project (services installation programme, resources, tracking)
• ADLM MEP plugin for Revit — takeoff across all nine services disciplines
• ADLM RateGen (material and labour rates, rate build-up, budget summary)
• Power BI (cost and progress dashboards)
• ChatGPT and Gemini (design checks, schedule optimisation, reporting)

How it runs:
• 6 weeks of guided content, 100% online on Google Classroom
• Self-paced — every session is recorded, so you work to your own timetable
• Portfolio-driven: a weekly assignment builds one continuous services project
• Google Drive set up as a working common data environment (CDE) to ISO 19650
  naming, with the services folder coordinated against architecture and structure

Week 1 — BIM for building services: dimensions, documentation and the CDE
Week 2 — 3D services modelling in Revit
Week 3 — System analysis and design validation
Week 4 — 4D: programming the services installation
Week 5 — 5D: MEP quantification, rate build-up and budget
Week 6 — Coordination, clash detection, dashboards and handover

You need a Windows PC able to run Revit 2024 (or newer), a Google account, and a
reliable internet connection. The ADLM MEP plugin is licensed separately from the
course — installation support is available Monday to Friday.`;

const DRAFT = "DRAFT — proposed coverage, not yet transcribed from a recording. ";

const modules = [
  // ── Week 1 — foundations ────────────────────────────────────────────────
  {
    code: "W1P1",
    title: "Week 1 · Part 1 — BIM for building services: what changes when you model systems",
    instructions:
      DRAFT +
      "BIM as a process rather than a software, the BIM dimensions, and maturity levels 0 to 3 — framed for services rather than architecture. Why an MEP model that is only geometry is worthless downstream, and where the services engineer sits in the design team.",
  },
  {
    code: "W1P2",
    title:
      "Week 1 · Part 2 — Services documentation: EIR, BEP, LOD schedule and the coordination requirements",
    instructions:
      DRAFT +
      "The Employer's Information Requirements and BIM Execution Plan from the services side. Building an LOD schedule for systems — what LOD 300 means for a duct run versus a chiller. Classification coding for services elements, and the coordination and clash tolerances the BEP has to state up front.",
  },
  {
    code: "W1P3",
    title: "Week 1 · Part 3 — Setting up the CDE and your services folder",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "Standing up a common data environment on Google Drive to ISO 19650: Work in Progress / Approved / Archive, with access control so the services team owns its folder and receives architecture and structure as links only. File naming, and the discipline of never importing what you can link.",
    assignmentPrompt: `Choose a realistic building services scheme to carry for the whole programme — an office floor, a hospital wing, a residential block, whatever suits your practice.

Submit:
1. Your Employer's Information Requirements (EIR) for the services scope.
2. Your BIM Execution Plan (BEP), stating your CDE, your coordination tolerances and your clash-detection process.
3. Your LOD schedule for the services elements.
4. A screenshot of your CDE folder structure with the access rights set.`,
  },

  // ── Week 2 — 3D services modelling ──────────────────────────────────────
  {
    code: "W2P1",
    title: "Week 2 · Part 1 — The Revit Systems environment and project setup",
    instructions:
      DRAFT +
      "The Systems tab end to end — HVAC, fabrication, MEP detailing, piping, mechanical, plumbing, electrical and lighting — plus the Analyse tab you will use in week 3. Setting up a services project: linking the architectural and structural models, copy/monitor for levels and grids, and defining spaces and zones so the model can be analysed later.",
  },
  {
    code: "W2P2",
    title: "Week 2 · Part 2 — Mechanical and HVAC: ductwork, pipework and air terminals",
    instructions:
      DRAFT +
      "Modelling supply, return and exhaust ductwork by system and level, with fittings. Mechanical and HVAC pipework runs and connections. Air terminals — diffusers, grilles and terminal units — grouped by system. System types, naming and colour fill so the model reads at a glance.",
  },
  {
    code: "W2P3",
    title: "Week 2 · Part 3 — Plumbing, electrical and lighting, and making the model information-rich",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "Plumbing fixtures and sanitary runs; electrical devices, panels, cable tray and conduit; lighting fixtures with wattage. Then the data layer: type parameters, manufacturer and model, cost, keynotes and classification codes — including manufacturer-supplied families (an LG or Panasonic unit carrying its real electrical and performance data), so specification falls out of the model instead of being typed twice.",
    assignmentPrompt: `Model your services scheme in Revit, linked to an architectural model.

Submit:
1. The Revit model with mechanical/HVAC, plumbing, electrical and lighting systems modelled and correctly named by system.
2. Spaces and zones defined.
3. Type parameters filled in (manufacturer, model, cost, description, classification code) for at least your main equipment, terminals and fixtures.
4. The model filed in the services folder of your CDE using the naming standard.`,
  },

  // ── Week 3 — analysis ───────────────────────────────────────────────────
  {
    code: "W3P1",
    title: "Week 3 · Part 1 — Heating and cooling loads, and sizing the plant",
    instructions:
      DRAFT +
      "Running the energy and load analysis off the spaces and zones you defined. Reading the results to size air conditioning plant for a given space instead of relying on a rule of thumb — the calculation that used to be done by hand, now driven by the model.",
  },
  {
    code: "W3P2",
    title: "Week 3 · Part 2 — Duct and pipe pressure loss, and validating the distribution",
    instructions:
      DRAFT +
      "Duct and pipe pressure loss reports: tracing flow from the air handling unit through to the point of consumption and checking whether the distribution is adequate or needs upsizing. Electrical: panel schedules and circuiting checks. Using Revit's own warnings as design review rather than noise.",
  },
  {
    code: "W3P3",
    title: "Week 3 · Part 3 — AI as a second pair of eyes on the design",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "Prompt-chaining rather than one-line prompting: feeding a system brief and the analysis output to ChatGPT or Gemini to sanity-check sizing, generate a specification narrative, and draft the design report. Where these tools help and where they will confidently mislead you.",
    assignmentPrompt: `Validate the scheme you modelled in week 2.

Submit:
1. Your heating and cooling load analysis, and the plant sizing you derived from it.
2. A duct or pipe pressure loss report for one distribution run, with your conclusion on whether it is adequate.
3. Your electrical panel schedule.
4. A short design report — you may draft it with AI, but state what you changed and why.`,
  },

  // ── Week 4 — 4D ─────────────────────────────────────────────────────────
  {
    code: "W4P1",
    title: "Week 4 · Part 1 — Programming the services installation in MS Project",
    instructions:
      DRAFT +
      "MS Project set up properly before the first task is typed: auto-scheduling, currency, effort-driven, and a project calendar. Building the services work breakdown — first fix, second fix, plant installation, testing and commissioning — and why the finish date is an output of durations, predecessors and resources, never an input.",
  },
  {
    code: "W4P2",
    title: "Week 4 · Part 2 — Resources, sequencing and the services/builder's work interface",
    instructions:
      DRAFT +
      "Deriving durations from your own quantities and gang outputs. Resource sheets, assignment and levelling. Sequencing services against the main contractor's programme — builder's work in connection, when a duct route has to be in before the ceiling closes, and the cost of compressing any of it.",
  },
  {
    code: "W4P3",
    title: "Week 4 · Part 3 — 4D simulation in Navisworks and tracking the installation",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "Exporting the services model to Navisworks, importing the MS Project schedule, attaching tasks to systems and playing the installation sequence back as an animation. Then tracking: baselines, status date, and reporting percentage planned against percentage complete.",
    assignmentPrompt: `Programme the installation of your scheme.

Submit:
1. A full services programme in MS Project with durations, predecessors and a project calendar.
2. Resources assigned and levelled.
3. A baseline set, with planned versus complete reporting configured.
4. The 4D sequence produced in Navisworks from your model and programme.`,
  },

  // ── Week 5 — 5D ─────────────────────────────────────────────────────────
  {
    code: "W5P1",
    title: "Week 5 · Part 1 — MEP quantification with the ADLM MEP plugin",
    instructions:
      DRAFT +
      "Takeoff across all nine services disciplines from the live model: ductwork and duct fittings, pipework, plumbing fixtures, lighting, power, cable tray and conduit, and air terminals — filtered by level, type and system. Highlight-in-model to check what a row actually measured, and export to Excel per discipline.",
  },
  {
    code: "W5P2",
    title: "Week 5 · Part 2 — Rate build-up with RateGen and the priced budget",
    instructions:
      DRAFT +
      "Turning quantities into money inside Revit: resolving material and labour rates from your RateGen library, adding connectors and discrete fittings, and setting overhead and profit per item. Manual rate editing with provenance — knowing whether a figure came from RateGen, was typed, or carried from a previous save. The live bill total and margin view per discipline.",
  },
  {
    code: "W5P3",
    title: "Week 5 · Part 3 — Bill of quantities, budget summary and cash flow",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "The formula-linked Budget Summary export: per-discipline sheets rolling into a master summary. Building the services bill of quantities from it, and preparing the cash-flow forecast off the priced bill and your week 4 programme.",
    assignmentPrompt: `Price your scheme.

Submit:
1. Takeoff across every discipline present in your model.
2. A complete services bill of quantities with rates and amounts, showing your build-up.
3. The Budget Summary export.
4. A cash-flow forecast from the priced bill and your week 4 programme, filed under Cost Management in your CDE.`,
  },

  // ── Week 6 — coordination and handover ──────────────────────────────────
  {
    code: "W6P1",
    title: "Week 6 · Part 1 — Federating services with architecture and structure",
    instructions:
      DRAFT +
      "Bringing the three discipline models together as one federated model. Why linking rather than importing is what keeps the federation live, and how the services model has to move once the structural model lands — beam levels, slab thicknesses and the ceiling void you actually have.",
  },
  {
    code: "W6P2",
    title: "Week 6 · Part 2 — Clash detection and the coordination workflow",
    instructions:
      DRAFT +
      "Running clash detection in Navisworks between services and structure, and services against each other. Setting tolerances, filtering the noise, issuing clashes back to the responsible discipline, and tracking them to closure — then making the model edits that follow.",
  },
  {
    code: "W6P3",
    title: "Week 6 · Part 3 — Power BI dashboards, COBie handover and wrap-up",
    requiresSubmission: true,
    instructions:
      DRAFT +
      "Getting cost and progress data into a shape Power BI can read, then building the dashboard: schedule and cost KPIs, SPI and CPI, and an executive view. Asset data for handover — the COBie deliverable for services equipment, which is what the facility manager inherits. Final portfolio review and certification.",
    assignmentPrompt: `Final submission — your complete portfolio.

1. The federated model, your clash detection report and the actions taken to resolve each clash.
2. A Power BI dashboard covering cost and schedule performance for your scheme.
3. Your COBie handover sheet for the services equipment.
4. Your BEP, updated to reflect how the project actually ran.`,
  },
];

function mergeModules(existing = [], incoming) {
  const byCode = new Map(existing.map((m) => [m.code, m]));
  return incoming.map((m) => {
    const prev = byCode.get(m.code) || {};
    return {
      code: m.code,
      title: m.title,
      requiresSubmission: Boolean(m.requiresSubmission),
      instructions: m.instructions || "",
      assignmentPrompt: m.assignmentPrompt || "",
      ...(prev.videoUrl ? { videoUrl: prev.videoUrl } : {}),
      ...(prev.durationSec ? { durationSec: prev.durationSec } : {}),
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

console.log(`course: ${course.title} (${SKU})`);
console.log(`blurb:   ${course.blurb?.length || 0} chars -> ${blurb.length} chars`);
console.log(`description: ${course.description?.length || 0} chars -> ${description.length} chars`);
console.log(`modules: ${course.modules?.length || 0} -> ${nextModules.length}`);
for (const m of nextModules) {
  console.log(`  [${m.code}] ${m.requiresSubmission ? "A" : " "} ${m.title}`);
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
