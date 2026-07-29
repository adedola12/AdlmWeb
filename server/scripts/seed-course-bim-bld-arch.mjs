/**
 * Fills in the course details for `bim-bld-arch` ("BIM Course on Building
 * Works") from the transcripts of the live 2025 cohort — the six-week
 * "Integrating BIM, AI and Data Analysis" programme.
 *
 * The course record currently has a one-line blurb, no description and no
 * modules, so enrolled students see "No modules yet." on /courses/bim-bld-arch.
 *
 * Weeks 2, 3 and 4 below are taken straight from the class recordings.
 * Weeks 1, 5 and 6 are marked PROVISIONAL: they are reconstructed from what
 * was recapped or announced in the recorded sessions, not from the sessions
 * themselves. Review those before publishing.
 *
 *   node scripts/seed-course-bim-bld-arch.mjs            # dry run, prints diff
 *   node scripts/seed-course-bim-bld-arch.mjs --apply    # writes to the DB
 *
 * Re-running is safe: modules are matched by `code`, and any videoUrl /
 * durationSec already set on a module is kept.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";

const SKU = "bim-bld-arch";
const APPLY = process.argv.includes("--apply");

// Ada (the sales agent) clips course blurbs at 220 chars, so keep this short
// enough to survive intact in the catalog prompt.
const blurb =
  "Integrating BIM, AI and Data Analysis for architectural and structural works — EIR/BEP/LOD and a working CDE, 3D + COBie in Revit, 4D in MS Project and Navisworks, 5D takeoff and BoQ, and Power BI dashboards.";

const description = `A six-week, project-based programme that takes one building you propose yourself
all the way through the BIM dimensions — the same brief carries from your EIR in
week one to your clash-detected federated model in week six.

What you work with:
• Autodesk Revit 2024 (architectural and structural modelling, schedules, worksharing)
• Autodesk Navisworks (4D simulation, clash detection)
• Microsoft Project (programme, resources, baselines, tracking dashboards)
• PlanSwift and CostX (2D quantity takeoff)
• Power BI (project dashboards and reporting)
• ChatGPT and Gemini (concept layouts, 3D visuals, schedule optimisation)
• ADLM plugins — COBie Exporter, Revit Quantity Calculator, PlanSwift takeoff, RateGen

How it runs:
• 6 weeks, three evening sessions per week, delivered live and recorded
• 100% online on Google Classroom — every recording, resource and assignment lives there
• A weekly assignment builds one continuous portfolio project, graded with feedback
• Google Drive is set up as a working common data environment (CDE) to ISO 19650
  folder and file-naming conventions, so you practise the process, not just the software

Week 1 — BIM foundations and project documentation
Week 2 — 3D BIM: modelling, the CDE, information-rich models and COBie
Week 3 — 4D BIM: programming, resources, tracking and reporting
Week 4 — 5D BIM: quantification, bills of quantities and cash flow
Week 5 — Data analysis and Power BI dashboards
Week 6 — Federated models, clash detection and 6D handover data

You need a Windows PC able to run Revit 2024 (or newer), a Google account, and a
reliable internet connection — installation support is available Monday to Friday.`;

const modules = [
  // ── Week 1 ──────────────────────────────────────────────── PROVISIONAL ──
  {
    code: "W1D1",
    title: "Week 1 · Day 1 — What BIM really is: dimensions 3D to 7D and maturity levels 0–3",
    instructions:
      "PROVISIONAL — reconstructed from the week 2 recap, not from the week 1 recording. Covers BIM as a process rather than a software, the BIM dimensions, maturity levels 0 to 3, and where the Nigerian industry currently sits.",
  },
  {
    code: "W1D2",
    title:
      "Week 1 · Day 2 — Project documents: EIR, BIM Execution Plan, LOD schedule and classification codes",
    instructions:
      "PROVISIONAL — reconstructed from the week 2 recap and the assignment brief. Covers the Employer's Information Requirements, the BIM Execution Plan, the LOD schedule, Uniformat and OmniClass coding, and the common data environment defined by ISO 19650.",
  },
  {
    code: "W1D3",
    title: "Week 1 · Day 3 — Data analysis for construction professionals",
    requiresSubmission: true,
    instructions:
      "PROVISIONAL — delivered by the data analytics lead. Why the absence of construction data forces estimators into assumption, and what a usable project dataset looks like.",
    assignmentPrompt: `Two parts, both submitted in Google Classroom.

1. Post a reflective summary of the week 1 lectures on LinkedIn, tag ADLM Studio, and attach the link to your submission (use "Add → Link").

2. Propose a realistic project of your choice — residential, mixed-use, commercial, whatever you want to carry for the rest of the programme. Sketch the concept, then prepare and attach:
   • your Employer's Information Requirements (EIR)
   • your BIM Execution Plan (BEP)
   • your LOD schedule, with the Uniformat and OmniClass codes filled in

Build these from scratch using the sample documents in Classroom as a guide — do not template them. Where the sample only lists precast concrete, rename it to suit local practice (cast in-place); anything the list does not cover goes under the supplementary components row.`,
  },

  // ── Week 2 — 3D BIM ─────────────────────────────────────────────────────
  {
    code: "W2D1",
    title: "Week 2 · Day 1 — 3D BIM and the Revit environment",
    instructions: `What 3D BIM is: a model carrying the physical AND functional characteristics of the building, not just geometry. Why a clean 3D model is the prerequisite for early clash detection, better coordination and a data-rich life cycle.

Revit vs traditional CAD — intelligent families instead of lines, and one change updating every view.

Full tour of the Revit 2024 interface: quick access toolbar, tabs, ribbon, properties palette and project browser (docked side by side, not stacked). Discipline tabs — Architecture, Structure, Steel, Precast, Systems, Insert, Annotate, Analyse, Collaborate, View, Manage, Add-Ins, Modify — and how to hide the ones you don't need from File → Options → User Interface (including dark mode).

Metric vs imperial templates; RVT (models) vs RFA/RTE (families and templates). Foundation tools mapped to local practice: Isolated = pad and pile, Wall = strip, Slab = raft. Reinforcement, couplers and cover tools.

Link vs Import — always link, so a change at source updates downstream. IFC as the ISO-mandated interoperability format between Revit, ArchiCAD, SketchUp and structural packages.

Also covered: how to submit assignments in Google Classroom.`,
  },
  {
    code: "W2D2",
    title: "Week 2 · Day 2 — Building the CDE on Google Drive, and modelling the building",
    instructions: `Standing up a working common data environment on Google Drive when Autodesk Construction Cloud is out of budget: install Drive for Desktop, create the CDE folder, then the ISO 19650 structure — Work in Progress / Approved (Shared) / Archive, with Architectural, Structural and Services folders under each, plus Cost Management and Project Management.

Access control as the security layer: editor vs viewer, per-discipline access so the structural engineer never sees inside the architect's WIP folder, and a reviewer with view-only rights over everything. What you gain and lose against ACC (ACC previews Revit and CAD files in the browser; Drive does not).

File naming in practice — ARC_LAG_SMB_01 — and saving the model straight into the CDE.

Modelling: levels in elevation (architectural vs structural floor level, and why the difference prevents a clash), copying levels with an offset for multi-storey, project units. Walls — duplicating a type and editing its structure to make a 150 mm block wall. Aligned dimensions used to drive the layout to real room sizes. Floors, doors and windows (duplicating types to 900×2100 and 750×2100), ceilings (automatic and sketched), railings, and a roof by picked lines with a 600 mm overhang and an adjustable pitch. Tiled 2D + 3D views, camera and walkthrough views, visual styles up to Realistic.`,
  },
  {
    code: "W2D3",
    title: "Week 2 · Day 3 — Information-rich models: parameters, AI, worksharing and COBie",
    requiresSubmission: true,
    instructions: `Embedding data: type parameters on windows, doors and walls — keynote, manufacturer, model, cost, URL, description, type image, assembly code and the OmniClass number Revit already carries. Editing one instance updates every element of that type. Material identity data. Analytical properties and where the sustainability engineer takes over.

AI in the workflow: creating a ChatGPT account, then prompt-chaining rather than one-line prompting — establish what the tool can do, feed it the building dimensions and room brief, answer its follow-up questions, and let it produce a 2D floor layout; then convert that layout to a 3D rendered view by supplying ceiling height, finishes and roof type. Gemini run side by side, and its limitation: it will not produce a technical CAD-grade layout.

Collaboration: enabling Worksharing turns the file into a central model. Worksets — Shared Levels and Grids plus your own for walls, floors, ceilings, roof and doors — set editable or not so the QS can take off but cannot move a grid line. Local copies vs "detach from central", Synchronize with Central with a comment, Show History exported to CSV, the Worksharing Monitor, and restoring a backup. Moving the central model from Work in Progress to Approved and re-pointing the local copies.

COBie: the ADLM COBie Exporter plugin (installer in Classroom) — select elements in Revit, auto-fill serial numbers, manufacturer, model and installation date, generate a barcode per element, write the values back into the Revit parameters, and export the COBie CSV into the CDE.`,
    assignmentPrompt: `Continue with the project you proposed in week 1.

1. Model your building in Revit 2024 — levels, walls, floors, doors, windows, ceilings, roof and railings — working from a 2D sketch of your own brief.
2. Make it information-rich: fill in the type parameters (manufacturer, model, cost, description, keynote, assembly code) for at least your walls, doors and windows, and run the ADLM COBie Exporter over the model.
3. Set up your CDE on Google Drive with the WIP / Approved / Archive structure and per-discipline access, save the model there using the file-naming standard, and enable worksharing.
4. Use ChatGPT (or Gemini) to generate a floor layout and a 3D view from your brief. Share the chat and attach the link.
5. Update your BIM Execution Plan to state that Google Drive is your CDE for this project.

Submit: the chat share link, your Revit model, your COBie export, and the updated BEP.`,
  },

  // ── Week 3 — 4D BIM ─────────────────────────────────────────────────────
  {
    code: "W3D1",
    title: "Week 3 · Day 1 — 4D fundamentals and setting up Microsoft Project",
    instructions: `What 4D adds: time against the model — construction sequencing, site logistics, delay analysis and stakeholder communication.

Microsoft Project from the ground up. Views: Gantt, Calendar, Network Diagram, Resource Sheet / Usage / Graph / Form, Task Usage / Form, Team Planner, Tracking Gantt. File → Options: set new tasks to Auto Scheduled, currency to NGN, effort-driven and auto-link on — before you type a single task.

Project Information: only the start date is yours to set. The finish date is calculated from three things — resources, durations and predecessors — and compressing it costs money, because your rates were built on normal working hours and the difference is overtime. Say so in writing when you submit a BoQ.

Calendars: Standard, Night Shift and 24 Hours, then building a custom project calendar (working Saturdays 7am–6pm with an hour's break) so two estimators with identical work breakdowns can legitimately produce different durations. Public holidays go in as exceptions.

WBS code mask, then building the breakdown itself — pre-contract, tendering and procurement, substructure, superstructure, finishes, external works, handover — and using indent/outdent to create summary tasks. A real programme runs to 200+ line items; ten mediocre ones will not federate with a model.`,
  },
  {
    code: "W3D2",
    title: "Week 3 · Day 2 — Durations, predecessors, resources and the Navisworks link",
    instructions: `Task durations and dependencies — start-to-start, start-to-finish and the rest of the predecessor logic — and computing durations from your bill of quantities: quantity ÷ gang output = duration, using your own observed gang sizes.

Resources: building the resource sheet, assigning resources to tasks, resource levelling and splitting tasks so the same foreman is not committed to two concurrent activities. Resource usage as a staffing schedule.

AI in scheduling: detecting overloads, proposing activity sequences, generating alternative programmes and flagging likely delays.

Linking to the model: export the Revit model to Navisworks, import the MS Project schedule, attach each task to its model elements, and play the construction sequence back as an animation instead of a static Gantt PDF.`,
  },
  {
    code: "W3D3",
    title: "Week 3 · Day 3 — Tracking and reporting: baselines, % planned vs % complete, dashboards",
    requiresSubmission: true,
    instructions: `MS Project will tell you what percentage complete you are. It will not tell you what percentage you were supposed to be — you have to build that.

Custom fields with formulas (Project → Custom Fields): Duration in Days, Elapsed Days, To-date Planned %, Baseline Duration Total, Baseline Days Completed, % Planned as a number, and % Planned again as text so it renders with the percent sign. Formulas on the number fields, roll-up (Sum) on the baseline fields. All formulas are supplied in the week's materials — copy them, keep the field names identical, and keep a blank file with the formulas already in it as your template, because custom fields do not travel between files.

Why a straight average of task percentages is wrong: a 4-day task at 70% and a 20-day task at 30% do not average to 50% — every percentage has to be weighted by its duration. That weighting is what the formulas are doing.

Then Set Baseline, set the Status Date to your reporting date, and the planned vs actual columns populate live.

Reporting: the Reports tab — building a dashboard from tables and charts, filters and outline levels to control how much detail management sees, late tasks, milestone status, the burndown chart (remaining vs actual tasks), resource allocation overview, and cost reports. Exporting into Word when you need narrative around the visuals. An introduction to earned value — planned value, earned value, actual cost, SPI and CPI — picked up again in week 5.`,
    assignmentPrompt: `Working on the same project:

1. Prepare a full programme of works in MS Project — from pre-contract through to handover — with durations, predecessors and a custom project calendar.
2. Build the resource sheet, assign resources to the tasks and level them.
3. Add the custom fields and formulas so the programme reports % Planned against % Complete. Set a baseline and a status date.
4. Link the programme to your Revit model through Navisworks and produce the construction sequence.
5. Build a dashboard, and submit the KPIs you believe you should be reporting on your current job (or the ones you would want to report) — these feed the week 5 Power BI class.
6. Update your BEP and file everything in the correct folder in your CDE.`,
  },

  // ── Week 4 — 5D BIM ─────────────────────────────────────────────────────
  {
    code: "W4D1",
    title: "Week 4 · Day 1 — 5D fundamentals: from Revit to a scaled drawing in PlanSwift",
    instructions:
      "Introduction to 5D BIM. Exporting 2D drawings out of the Revit model to PDF, loading them into PlanSwift, setting the scale, and a first area takeoff — building area, external and internal girth.",
  },
  {
    code: "W4D2",
    title: "Week 4 · Day 2 — Quantification across PlanSwift, Revit schedules, CostX and the ADLM plugins",
    instructions: `The same substructure taken off three ways, so you can pick the right tool rather than defend one.

PlanSwift with the stock tools: area, linear volume and wall area for site clearance, topsoil removal, trench excavation, concrete in foundation and block work in foundation. Page tools — rotate, batch rotate a whole PDF, and Crop as New Page (never measure two drawings at different scales on one sheet). The Pitch tool for roof slope. Zip / Unzip Swift Job for sending work to a reviewer who is not on your CDE. Estimating and report views, export to Excel, and what the PlanSwift plugin store sells.

Revit Schedules and Quantities: ceiling, door, floor, roof and wall takeoffs; adding a calculated parameter (door area = width × height × count); sorting, grouping, formatting and totals; and grouping by base constraint to get quantities floor by floor. On a clash-detected multi-storey model this produces the whole wall schedule in seconds.

CostX: new building, add drawings, calibrate the x-axis, dimension groups, workbooks, and dragging NRM/SMM descriptions straight into the bill. BCIS for cost data and the duration calculator — what a real construction database looks like, and why we cannot yet do this locally.

Then the ADLM plugins: the PlanSwift takeoff plugin and the Revit Quantity Calculator producing a full substructure bill AND a material schedule to Excel from a single selection — the difference between the manual route and the automated one, measured in minutes.

Also previewed: the clash-detected architectural, structural and MEP models in Classroom — walls stopping short of the beam, no floor slabs in the architectural file — and why that model looks "wrong" until you understand week 6.`,
  },
  {
    code: "W4D3",
    title: "Week 4 · Day 3 — Bill of quantities, material schedule and cash-flow forecast",
    requiresSubmission: true,
    instructions:
      "Turning the takeoff into money: completing the bill of quantities, building the material schedule, rate build-up, and preparing the cash-flow forecast off the priced bill and the week 3 programme.",
    assignmentPrompt: `Using your own model and drawings:

1. Take off your project — substructure through to finishes — using PlanSwift or CostX for the 2D work and Revit Schedules and Quantities for the model-based work.
2. Produce a complete bill of quantities with rates and amounts.
3. Produce the material schedule.
4. Prepare a cash-flow forecast from the priced bill and your week 3 programme.
5. File all of it under Cost Management in your CDE and update your BEP.`,
  },

  // ── Week 5 ──────────────────────────────────────────────── PROVISIONAL ──
  {
    code: "W5D1",
    title: "Week 5 · Day 1 — Structuring construction data for analysis",
    instructions:
      "PROVISIONAL — announced in class, content not yet transcribed. Cleaning and structuring project data: fields vs records, and getting cost and programme data into a shape a dashboard can read.",
  },
  {
    code: "W5D2",
    title: "Week 5 · Day 2 — Building the project dashboard in Power BI",
    instructions:
      "PROVISIONAL — announced in class. Moving beyond the MS Project report tab to Power BI: KPIs, slicers, and cost and schedule visuals, using the KPIs submitted in week 3.",
  },
  {
    code: "W5D3",
    title: "Week 5 · Day 3 — Earned value and reporting to stakeholders",
    requiresSubmission: true,
    instructions:
      "PROVISIONAL — announced in class. Earned value management in practice: planned value, earned value and actual cost; SPI and CPI, what values above and below 1 mean; executive-level reporting.",
    assignmentPrompt:
      "PROVISIONAL — confirm before publishing. Build a Power BI dashboard for your project covering schedule and cost performance, using the KPIs you proposed in week 3.",
  },

  // ── Week 6 ──────────────────────────────────────────────── PROVISIONAL ──
  {
    code: "W6D1",
    title: "Week 6 · Day 1 — Federating architectural, structural and MEP models",
    instructions:
      "PROVISIONAL — announced in class. Bringing the three discipline models together as one federated model, and why linking (never importing) is what makes it work.",
  },
  {
    code: "W6D2",
    title: "Week 6 · Day 2 — Clash detection and the coordination workflow",
    instructions:
      "PROVISIONAL — announced in class. Running clash detection, issuing and tracking the results back to the design team, and the model edits that follow (wall top offsets, floor thicknesses, beam levels).",
  },
  {
    code: "W6D3",
    title: "Week 6 · Day 3 — 6D: asset data, COBie handover and course wrap-up",
    requiresSubmission: true,
    instructions:
      "PROVISIONAL — announced in class. Energy and facility management data, the COBie handover deliverable, final portfolio review and certification.",
    assignmentPrompt:
      "PROVISIONAL — confirm before publishing. Submit your federated model, the clash detection report and the actions taken, and your completed COBie handover sheet.",
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
      // never clobber a video/duration an admin already attached
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
  const flag = m.instructions.startsWith("PROVISIONAL") ? " [PROVISIONAL]" : "";
  console.log(`  [${m.code}] ${m.requiresSubmission ? "A" : " "} ${m.title}${flag}`);
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
