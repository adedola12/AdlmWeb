// server/services/salesAgent.js
// The ADLM AI Agent's brain: builds a conversion-focused system prompt grounded
// in the live catalog, runs the Claude tool-use loop, and executes its two
// tools (save_lead, offer_actions). Returns a reply + tappable actions for the
// widget to render.

import { createMessage, supportsTools } from "./aiClient.js";
import { referralSummary } from "./referrals.js";
import { getCatalog } from "./catalog.js";
import { Lead } from "../models/Lead.js";
import { syncLeadToNotion } from "../util/notion.js";
import {
  getPortfolioSummary,
  getProjectDetails,
  getAccountSummary,
  getResourceQuantity,
  getProcurementSchedule,
  getProjectBudget,
  getProjectBill,
  getBillItemsForAi,
  getPricingProposal,
  getAreaPricingProposal,
  getSetRatesProposal,
  getProjectPeriodReport,
  getProjectTipsForAgent,
} from "./agentUserData.js";
import { getRoomFinishes } from "./agentRoomFinishes.js";
import { watToday } from "./reportPeriod.js";
import mongoose from "mongoose";
import { TakeoffProject } from "../models/TakeoffProject.js";
import {
  sampleProposalRefusal,
  samplePeriodReportRefusal,
  SAMPLE_LABEL,
  SAMPLE_REPORT_TITLE,
  isSampleAnswer,
  labelSampleReply,
  mentionsSample,
  rateTypedByUser,
  SAMPLE_RATE_NOT_TYPED,
} from "../util/agentSampleGuard.js";
import {
  aiServiceEnabled,
  checkRatesAgainstMarket,
  scanProjectForErrors,
  buildUpRate,
} from "./adlmAiService.js";

const MAX_TOOL_ITERATIONS = 4;
const WHATSAPP_NUMBER = process.env.SUPPORT_WHATSAPP || "2348106503524";

/* ----------------------------- tools ----------------------------- */
const TOOLS = [
  {
    name: "save_lead",
    description:
      "Save a prospect's contact details for human follow-up. Call this ONLY " +
      "after the visitor has willingly shared an email (and ideally their name " +
      "and what they're interested in) and is not ready to sign up or buy right " +
      "now. Never invent contact details. After saving, warmly confirm follow-up.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name if given." },
        email: { type: "string", description: "Email address (required)." },
        phone: { type: "string", description: "Phone / WhatsApp if given." },
        interest: {
          type: "string",
          description: "One line on what they want (e.g. 'RateGen for a QS firm').",
        },
        productKeys: {
          type: "array",
          items: { type: "string" },
          description: "Matching product keys from the catalog, if any.",
        },
        note: { type: "string", description: "Budget, timeline, role, objections." },
      },
      required: ["email"],
    },
  },
  {
    name: "offer_actions",
    description:
      "Render tappable buttons under your message to move the visitor toward " +
      "converting. Prefer a single clear next step. Use 'buy' for a purchasable " +
      "product (deep-links the visitor into checkout with it pre-loaded), " +
      "'signup' to create an account, 'nav' to open a page, 'whatsapp' only as a " +
      "human-handoff escape hatch. Only use productKeys that exist in the catalog.",
    input_schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["buy", "signup", "nav", "whatsapp"] },
              label: { type: "string", description: "Button text (<= 30 chars)." },
              productKey: {
                type: "string",
                description: "Required for type 'buy'. Must exist in the catalog.",
              },
              months: {
                type: "number",
                description: "Optional subscription months to pre-load for 'buy' (default 1).",
              },
              to: {
                type: "string",
                description: "Path for type 'nav' (e.g. /products, /learn, /trainings).",
              },
            },
            required: ["type", "label"],
          },
        },
      },
      required: ["actions"],
    },
  },
];

/* ---- account tools (only offered to a logged-in user; read-only) ---- */
// These read the CURRENT user's own data. The model never passes a user id —
// the handlers use the authenticated ctx.user resolved from the Bearer token,
// so Ada can only ever read the signed-in visitor's own projects/account.
const ACCOUNT_TOOLS = [
  {
    name: "get_my_projects",
    description:
      "Get a summary of the LOGGED-IN user's own takeoff projects: total count, " +
      "combined value, work done, outstanding value, overall progress, a " +
      "per-product breakdown, which projects have a 3D model attached, and a " +
      "list of every project (product, lines, value, % done). Use when they ask " +
      "about 'my projects', total or outstanding project cost, portfolio value, " +
      "overall progress, which projects have a 3D/BIM model, or to find/list " +
      "projects. No arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_project_details",
    description:
      "Get value, progress and schedule for ONE of the logged-in user's projects, " +
      "found by name. Use when they ask about a specific project (e.g. 'how far is " +
      "Dutum Demo', 'value of my Multi Storey Bill').",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name (or closest phrase) the user mentioned.",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "get_my_account",
    description:
      "Get the LOGGED-IN user's subscriptions/entitlements (which products they " +
      "own, active vs expired, license type, expiry) and their per-product project " +
      "usage. Use for 'my subscription', 'what do I own', 'when does X expire', " +
      "'how many projects can I still create'. No arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_resource_quantity",
    description:
      "Get the TOTAL QUANTITY (and cost) of a specific material, labour trade or " +
      "resource in the logged-in user's project(s) — read from the project's " +
      "Material & Labour breakdown, falling back to its bill lines. This is THE " +
      "tool for 'how many bags of cement do I need', 'total quantity of rebar', " +
      "'how much sand / granite / blocks / concrete', 'how many masons', 'how much " +
      "have I budgeted for formwork'. Totals are returned per unit of measure. " +
      "Omit projectName to total the resource across ALL their projects.",
    input_schema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description:
            "The material/labour/resource to total, as the user said it (e.g. 'cement', '12mm rebar', 'mason').",
        },
        projectName: {
          type: "string",
          description:
            "Optional. The project to limit the search to. Omit to search every project the user owns.",
        },
      },
      required: ["resource"],
    },
  },
  {
    name: "get_my_referral_link",
    description:
      "Get the LOGGED-IN user's own referral/invite link, and how many people " +
      "have signed up and subscribed through it. Use for 'can I get an invite " +
      "link', 'refer a friend', 'my referral link', 'how many people have I " +
      "referred'. ALWAYS print the link as a plain URL on its own line — never " +
      "inside markdown brackets — so they can read and copy it. No arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_procurement_schedule",
    description:
      "What the user still has to BUY on a project, and WHEN each thing must be " +
      "ordered — soonest first, with anything already overdue called out. This is " +
      "THE tool for 'what do I buy next', 'what should I be ordering this week', " +
      "'my procurement list', 'what is late to order', 'next spend'. Order dates " +
      "come from the programme: the earliest task that needs a material, less the " +
      "lead time. Say which project, or omit it to use the one they are looking at.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "Project name. Omit to use the project the user is viewing.",
        },
        leadDays: {
          type: "number",
          description: "Supplier lead time in days. Defaults to 14.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_project_budget",
    description:
      "Get the full Material & Labour (Budget) breakdown for ONE of the logged-in " +
      "user's projects: total budgeted cost, Material vs Labour vs Plant split, how " +
      "much has been procured/purchased vs still to buy, and the biggest resources " +
      "by cost with their quantities. Use for 'what's my material budget', 'material " +
      "vs labour cost', 'what do I still need to buy', 'procurement status'.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name (or closest phrase) the user mentioned.",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "get_project_bill",
    description:
      "Get the BILL OF QUANTITIES work items for ONE of the logged-in user's " +
      "projects — each line's quantity, unit, rate, amount and % complete, plus " +
      "measured quantity totals per unit. Pass `search` to filter to matching lines " +
      "(e.g. 'concrete', 'blockwork', 'excavation'). Use for 'what's in my bill', " +
      "'how much concrete is measured', 'what are my biggest bill items', 'rate for X'.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name (or closest phrase) the user mentioned.",
        },
        search: {
          type: "string",
          description:
            "Optional phrase to filter bill lines by (matches description, category or trade). Omit for the whole bill.",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "get_room_finishes",
    description:
      "Get the PER-ROOM finishes QUIV measured from the Revit rooms of ONE of the " +
      "logged-in user's projects (their own or shared with them): each room's " +
      "number, name, level, floor finish, floor area (m2) and skirting length (m), " +
      "plus totals and a room count. Use for any room or location question: " +
      "'floor area and skirting for the toilets', 'tiles in the bathrooms', " +
      "'how much skirting on the ground floor', 'area of room G01'. Omit `project` " +
      "when the user is asking about the project they have open.",
    input_schema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "The project name (or closest phrase) or id. Omit to use the project the user has open.",
        },
        room: {
          type: "string",
          description:
            "Optional room filter matched against room name or number, e.g. 'toilet', 'bathrooms', 'G01', 'toilets and stores'. Omit for every room.",
        },
        level: {
          type: "string",
          description: "Optional level filter, e.g. 'Ground Floor', 'Level 1'. Omit for every level.",
        },
      },
      additionalProperties: false,
    },
  },
];

/* ---- estimator & project-manager tools (logged-in, read-only) ---- */
// Ada as the QS's estimator and PM, not only a reader of figures. All three
// READ; none writes. propose_project_pricing builds a list the user confirms
// on a card in the chat — the card, not Ada, calls the pricing endpoint, and
// only after the user ticks the lines and presses Apply. project_report reads
// what moved between two dates. project_tips runs the same rules as the tip
// strip on the project's own tabs (util/projectTips.js).
const ESTIMATOR_TOOLS = [
  {
    name: "propose_project_pricing",
    description:
      "PROPOSE a rate for every UNPRICED bill line on ONE of the logged-in user's " +
      "projects, from their own RateGen library (master rates plus their overrides " +
      "and custom rates), matched by description with the unit as a hard rule. " +
      "Shows the user a confirm card with a tick box per line and an Apply button. " +
      "It NEVER writes a price: nothing changes until the user presses Apply on the " +
      "card. Use for 'price my bill', 'fill in the missing rates', 'which lines have " +
      "no rate', 'suggest rates for this project'. Omit projectName to use the " +
      "project the user is looking at.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name. Omit to use the project the user is viewing.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "propose_price_by_area",
    description:
      "The user STATED a cost per square metre for windows or doors (\"the cost of " +
      "windows per sqm is 88,000\", \"doors are 65k a square metre\"). PROPOSE a rate " +
      "for every window (or door) line on the project from its own size in the " +
      "description, e.g. \"Window W1 (1200×1500)\" = 1.8 m² → 1.8 × the rate, split " +
      "60% material, 20% labour, 20% overhead and profit unless the user says " +
      "otherwise. Shows a confirm card grouped by size; it NEVER writes. Nothing " +
      "changes until the user presses Apply. Omit projectName to use the project " +
      "the user is looking at.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name. Omit to use the project the user is viewing.",
        },
        category: { type: "string", enum: ["windows", "doors"] },
        ratePerM2: {
          type: "number",
          description: "The naira per m² the user stated, as a plain number (88000 for 88,000 or 88k).",
        },
        split: {
          type: "object",
          description:
            "Only when the user gives one: percentages of the rate for material, labour and " +
            "overhead/profit. Omit for the default 60 / 20 / 20. If they give material and " +
            "labour only, the rest is overhead and profit.",
          properties: {
            material: { type: "number" },
            labour: { type: "number" },
            overheadProfit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
      required: ["category", "ratePerM2"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_set_rates",
    description:
      "The user STATED a rate for some bill lines (\"set blockwork to 9,500 per m2\", " +
      "\"rate line 14 at 2,000\", \"put 45,000 on B2.3\"). PROPOSE that rate on the " +
      "lines they named: by description words, bill code or line number. A line in " +
      "another unit than the one they said is left off, never converted. The rate is " +
      "split 60% material, 20% labour, 20% overhead and profit unless the user says " +
      "otherwise. Shows a confirm card; it NEVER writes. Nothing changes until the " +
      "user presses Apply. Omit projectName to use the project the user is looking at.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name. Omit to use the project the user is viewing.",
        },
        match: {
          type: "object",
          description:
            "Which lines. Give what the user said: text (words from the description, e.g. " +
            "\"blockwork 225\"), code (bill codes), or sn (line numbers, e.g. [14]).",
          properties: {
            text: { type: "string" },
            code: { type: "array", items: { type: "string" } },
            sn: { type: "array", items: { type: "number" } },
          },
          additionalProperties: false,
        },
        rate: {
          type: "number",
          description: "The naira rate the user stated, as a plain number (9500 for 9,500).",
        },
        unit: {
          type: "string",
          description: "The unit the user said the rate is per (m2, m3, nr, m...). Omit if they did not say.",
        },
        split: {
          type: "object",
          description:
            "Only when the user gives one: percentages of the rate for material, labour and " +
            "overhead/profit. Omit for the default 60 / 20 / 20. If they give material and " +
            "labour only, the rest is overhead and profit.",
          properties: {
            material: { type: "number" },
            labour: { type: "number" },
            overheadProfit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
      required: ["match", "rate"],
      additionalProperties: false,
    },
  },
  {
    name: "project_report",
    description:
      "What happened on ONE of the logged-in user's projects between two dates: work " +
      "valued, lines completed, actual cost against planned, certificates issued, " +
      "variations raised and decided, materials bought, tasks finished or late, risks " +
      "and issues, and the activity log. Also shows a card that opens the full Project " +
      "report PDF for that range. Use for 'report for last month', 'what happened in " +
      "September', 'progress this week', 'monthly report'. YOU must turn the user's " +
      "words into dates using TODAY from the visitor section (Lagos, WAT). 'Last " +
      "month' is the whole previous calendar month; 'this month' is the 1st to today; " +
      "'1 to 30 September' is the 1st to the 30th of September of the current year " +
      "unless they say otherwise.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name. Omit to use the project the user is viewing.",
        },
        from: { type: "string", description: "First day of the range, YYYY-MM-DD (Lagos)." },
        to: {
          type: "string",
          description: "Last day of the range, YYYY-MM-DD (Lagos). Omit for today.",
        },
      },
      required: ["from"],
      additionalProperties: false,
    },
  },
  {
    name: "project_tips",
    description:
      "What the user should do NEXT on ONE of their projects, most urgent first: " +
      "unpriced lines, contract not locked, no progress recorded lately, overdue " +
      "tasks, lines over budget, budget rows with no price, no programme. Use for " +
      "'what should I do next', 'anything wrong with this job', 'what needs my " +
      "attention', and proactively when the user starts talking about one project. " +
      "Omit projectName to use the project the user is viewing.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name. Omit to use the project the user is viewing.",
        },
      },
      additionalProperties: false,
    },
  },
];

/* ---- what the chat says it can show ---- */
// A chat declares the cards it renders in `capabilities` (strings) on
// /agent/chat, next to `cards: true`. The API ships before the screens, so a
// tool whose card an older chat cannot draw is only offered to a chat that
// names it; otherwise Ada would show an Apply button that does nothing.
//
// "ada-user-rate-card": the confirm card for a rate the USER stated
// (propose_price_by_area, propose_set_rates, 3 Oct 2026).
export const CAP_USER_RATE_CARD = "ada-user-rate-card";
const USER_RATE_TOOL_NAMES = new Set(["propose_price_by_area", "propose_set_rates"]);

/** The declared capabilities, cleaned: short lowercase strings, at most 20. */
export function agentCapabilities(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const c of raw) {
    if (typeof c !== "string") continue;
    const s = c.trim().toLowerCase().slice(0, 40);
    if (s) out.add(s);
    if (out.size >= 20) break;
  }
  return [...out];
}

/** Whether this chat can show the stated-rate card (and so get its tools). */
export function canUseUserRateCard(opts = {}) {
  return (
    !!opts.user &&
    opts.cards === true &&
    agentCapabilities(opts.capabilities).includes(CAP_USER_RATE_CARD)
  );
}

/** The estimator tools a chat may be offered, given what it can show. */
export function estimatorToolsFor(opts = {}) {
  if (opts.cards !== true) return [];
  const userRates = agentCapabilities(opts.capabilities).includes(CAP_USER_RATE_CARD);
  return ESTIMATOR_TOOLS.filter((t) => userRates || !USER_RATE_TOOL_NAMES.has(t.name));
}

/* ---- cost-intelligence tools (ADLM AI Service on AWS) ---- */
// These call the separate serverless AI API (repo: adlm-ai-service), which is
// grounded in the RateGen rate library and BESMM 4R. Ada supplies the user's
// REAL bill lines — the model never retypes quantities or rates. Only offered
// when ADLM_AI_URL is configured AND the visitor is authenticated (the call is
// made with their own token and metered to their account).
const AI_SERVICE_TOOLS = [
  {
    name: "check_my_rates",
    description:
      "Check the rates in ONE of the logged-in user's projects against ADLM's " +
      "RateGen market benchmarks. Returns a per-line verdict (above market / " +
      "below market / in range / unit mismatch) with the deviation %, the " +
      "benchmark it was compared to and a reason. Use for 'are my rates " +
      "right', 'am I overpriced', 'check my BoQ against the market', 'is this " +
      "rate too high', 'benchmark my bill'. Pass `search` to check only part " +
      "of a large bill (e.g. 'concrete').",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name (or closest phrase) the user mentioned.",
        },
        search: {
          type: "string",
          description: "Optional phrase to check only matching bill lines. Omit for the whole bill.",
        },
        zone: {
          type: "string",
          enum: [
            "north_west",
            "north_east",
            "north_central",
            "south_west",
            "south_east",
            "south_south",
          ],
          description:
            "Optional Nigerian zone to benchmark against. Only pass it if the user names their location/region — never guess.",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "find_project_errors",
    description:
      "Scan ONE of the logged-in user's projects for mistakes: duplicated " +
      "items, wrong units for the work type (BESMM 4R), implausible " +
      "quantities, rate outliers, and descriptions that contradict their unit " +
      "or rate. Every flag comes with a reason. Use for 'check my BoQ for " +
      "errors', 'did I make a mistake', 'review my takeoff', 'anything wrong " +
      "with my bill', 'find duplicates'.",
    input_schema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name (or closest phrase) the user mentioned.",
        },
        search: {
          type: "string",
          description: "Optional phrase to scan only matching bill lines. Omit for the whole bill.",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "suggest_rate",
    description:
      "Build up a unit rate for a described work item from ADLM's RateGen " +
      "library — component by component (material, labour, plant), each marked " +
      "as looked-up or inferred. Use for 'what should I charge for X', 'build " +
      "me a rate for 150mm blockwork', 'what does concrete cost per m3', 'how " +
      "is this rate made up'. This does NOT need one of their projects — it " +
      "works for any described work item.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The work item to price, as the user described it.",
        },
        unit: {
          type: "string",
          description: "Optional unit of measure (m2, m3, m, nr, kg) if the user gave one.",
        },
        zone: {
          type: "string",
          enum: [
            "north_west",
            "north_east",
            "north_central",
            "south_west",
            "south_east",
            "south_south",
          ],
          description:
            "Optional Nigerian zone to price for. Only pass it if the user names their location/region — never guess.",
        },
      },
      required: ["description"],
    },
  },
];

/* --------------------------- system prompt --------------------------- */
function buildSystemPrompt({
  knowledgePack,
  userContext,
  canReadAccount,
  canUseAiService,
  canUseCards = false,
  canUseUserRates = false,
  markdown = false,
}) {
  // Appended inside the logged-in account section: the ADLM AI Service (AWS)
  // features, offered only when the endpoint is configured and we hold a
  // forwardable token for this user.
  const aiSection = canUseAiService
    ? `

# COST INTELLIGENCE (ADLM AI Service — grounded in the RateGen library + BESMM 4R)
- check_my_rates — benchmarks the rates in their bill against the market: per line, above/below market or in range, with the deviation %, the benchmark it was compared to, and a reason. Use for "are my rates right", "am I overpriced", "benchmark my bill", "is this rate too high".
- find_project_errors — scans their bill for duplicates, wrong units for the work type, implausible quantities, rate outliers and descriptions that contradict their unit or rate. Use for "check my BoQ for errors", "review my takeoff", "did I make a mistake".
- suggest_rate — builds a unit rate up component by component from the RateGen library, each component marked as looked-up or inferred. Works for ANY described work item, not only their own projects.
Rules for cost intelligence:
- These run on the user's ACTUAL bill lines — you never retype quantities or rates into them, you just name the project.
- Every verdict is ADVISORY for the QS to review. Report it as returned, with its reason. Never restate a flagged rate as "correct", and never present a suggestion as a change you have made.
- Use the verdict label EXACTLY as the tool returns it — "above market", "below market", "in range", "unit mismatch". Never relabel one as another; "unit mismatch" specifically means the unit disagrees with the benchmark, nothing else.
- Say which figures came from the RateGen library versus the model — the tool marks this, and it is the difference between a benchmark and an estimate.
- Only pass a \`zone\` if the user names their region or location. Never guess it.
- If a check reports the AI add-on isn't active on their account, explain what it does and offer it as a genuine next step.`
    : "";

  const accountSection = canReadAccount
    ? `
# ANSWERING ABOUT THEIR OWN ACCOUNT & PROJECTS
This visitor is LOGGED IN, so you can also act as their account assistant using these read-only tools (they only ever read THIS user's own data):
- get_my_projects — their whole portfolio: number of projects, combined value, work done, outstanding value, overall progress, per-product breakdown, WHICH PROJECTS HAVE A 3D MODEL ATTACHED, and a list of every project. Use for "my projects", "total cost/value of my projects", "how far along am I", "which projects have a 3D model", "list my projects".
- A project has a 3D model only if get_my_projects lists one as attached. Never infer it from the product (a QUIV project without an attached model has no model on the web).
- get_project_details — value, progress and schedule for ONE named project. Use for questions about a specific project.
- get_my_account — their subscriptions (what they own, active/expired, expiry) and project-slot usage. Use for "my subscription", "when does X expire", "how many projects can I create".
- get_resource_quantity — the TOTAL QUANTITY and cost of one material, labour trade or resource (cement, sand, rebar, blocks, formwork, masons…) in one project or across all of them. This is the tool for ANY "how much / how many X do I need" question.
- get_project_bill — the bill of quantities work items (qty, unit, rate, amount, % done), optionally filtered by a search phrase. Use for "what's in my bill", "rate for X", "biggest items".
- get_project_budget — the whole Material & Labour breakdown for one project: total cost, Material vs Labour vs Plant split, procured vs still-to-buy, biggest resources. Use for "material budget", "what do I still need to buy".
- get_room_finishes — per-room floor finish, floor area (m2) and skirting (m) measured from the Revit rooms in QUIV, with totals, filtered by room name/number and level. Use for ANY question about a room or location ("floor area and skirting for the toilets", "tiles in the bathrooms", "skirting on the ground floor"), NOT get_project_bill. Answer per room, then the totals. If it says the project has no room data, relay that it must be re-saved from QUIV 4.0.2 or later; never estimate room figures.
Rules for account answers:
- ALWAYS call the relevant tool and quote its numbers exactly — NEVER invent or estimate project figures, values, quantities or dates.
- You CAN read their bill lines and their material & labour lines — never tell a user you have no access to them. If a tool finds nothing, say what was searched and ask how the item is worded in their bill.
- Quantities live per unit of measure (bags, m³, kg, m²). NEVER add different units together and never convert between them unless the user supplies the conversion factor.
- Quote money exactly as the tool returns it. If a figure is ₦0, say the bill has no rates yet rather than guessing.
- If a project has no Material & Labour breakdown, explain it comes from the desktop plugin on save (MEP projects don't send one) — don't estimate one.
- After answering, still be helpful commercially where natural (e.g. an expired sub → offer renewal; no RateGen → mention it) but don't force it.
- For deeper detail, point them to the Portfolio Dashboard or a project's Project/PM report.
# SAMPLE PROJECTS (read-only learning material)
Every subscriber can open a product's sample projects (names start "Sample:"). They belong to no client and their figures are illustrative.
- Answer about a sample ONLY when the user names one or is on its page. To read a named sample, pass its name to the project tool WITH the word "sample" in it (e.g. "5-Bedroom Duplex sample").
- Start every answer about a sample with exactly: "${SAMPLE_LABEL}"
- A sample is NEVER one of "my projects": never count it in a portfolio, a total, a comparison, a multi-project report or slot usage.
- project_report may run for ONE sample the user opened or named with "sample". Its answer starts with the label above, says "${SAMPLE_REPORT_TITLE}", and covers that sample only; never mix it with the user's own projects.
- NEVER use a sample's rates, quantities or totals in an estimate, budget, valuation or rate for the user's own projects, and never copy them across. Rates cannot be proposed or applied on a sample.
${canUseUserRates ? "" : `- When the user STATES a cost or a rate for their own lines ("windows are 88,000 per sqm", "set blockwork to 9,500 per m2"): this chat cannot set rates from a message yet. Say plainly, in text, that pricing by message is coming soon, and that for now they can type the rate on the line in the project's Bill tab. Do not offer to do it, and NEVER say a rate was applied, set or saved.
`}${canUseCards ? `
# YOU ARE ALSO THEIR ESTIMATOR AND PROJECT MANAGER
Act like a sharp senior QS and site PM working beside them, not a search box.
- project_tips — what to do next on a project, most urgent first. When the user is on a project page or asks "what now", start here and lead with the top one or two.
- propose_project_pricing — proposes a rate for every unpriced line from THEIR OWN RateGen library and shows a confirm card. You NEVER price anything yourself and NEVER say rates were applied: the user ticks the lines and presses Apply on the card. Explain the strong and weak matches, and that a match is by description and unit.
${canUseUserRates ? `- propose_price_by_area — when the user STATES a cost per m² for windows or doors ("windows are 88,000 per sqm"), propose every window (or door) priced from its own size. propose_set_rates — when the user STATES a rate for lines ("set blockwork to 9,500 per m2", "rate line 14 at 2,000"). Whenever the user states a cost or a rate, call one of these straight away to PROPOSE it; do not just acknowledge it. Pass their figure exactly as a plain number (88k = 88000) and the unit they said. The split is 60% material, 20% labour, 20% overhead and profit unless they give another; pass theirs when they do. Never invent a rate they did not state, never convert units, and NEVER say a rate is applied, set or saved: the card applies it only when they press Apply.
` : ""}- project_report — what moved between two dates (value done, certified, actual vs planned, variations, purchases, late tasks, activity), with a card that opens the PDF. Work out the dates from TODAY in the visitor section (Lagos time) before calling it. If the range is unclear, ask once.
How to work:
- Explain a rate when asked: what makes it up (material, labour, plant, overhead and profit) and what to check. Real build-ups come from suggest_rate when that tool is available; otherwise describe what a build-up for that item normally contains, clearly as general guidance, never as their figure.
- Flag risks plainly when the data shows them: unpriced lines, lines over budget, no progress for weeks, overdue tasks, an unlocked contract on a job already on site.
- End with one concrete next step, and offer the tool that does it.` : ""}${aiSection}`
    : `
# NOT LOGGED IN
This visitor is a guest, so you CANNOT read any personal projects or subscriptions. If they ask about "my projects", "my subscription", "what I've spent" etc., warmly explain they need to sign in first, then offer a 'signup' or 'nav' to login — never guess their data.`;

  // Returned in two parts so the transport can cache the first one.
  // EVERYTHING here must be identical for every visitor sharing the same
  // (canReadAccount, canUseAiService) combination — that is what makes it a
  // stable cache prefix. Per-visitor text goes in the `dynamic` half below.
  // The catalogue is the bulk of the tokens, so it must sit inside this half;
  // it used to come AFTER the per-user context, which made the expensive part
  // uncacheable.
  const cacheable = `You are "Ada", the AI product specialist AND account assistant for ADLM Studio — a Nigerian construction-tech company that builds software, plugins and training for Quantity Surveyors, estimators and BIM professionals (products include RateGen, take-off plugins for Revit/PlanSwift/Civil, HERON, and professional trainings).

# YOUR GOAL
Help every visitor find the right ADLM product or training and move them to ACTION: create an account (sign up) or make a purchase. For logged-in users you ALSO answer questions about their own projects and subscription. You are friendly, sharp and genuinely helpful — a great salesperson and a reliable assistant, never pushy or spammy. Qualify the need, recommend the best-fit product, state the real price, and offer a clear next step.

# HARD RULES
- Ground every claim in the CATALOG below (for products) or the account TOOLS (for their data). NEVER invent products, features, prices, dates, discounts, or project figures. If something isn't available, say you'll connect them to the team.
- Quote prices exactly as written in the catalog. Prices are per seat. Nigerian visitors pay in ₦, others in $.
- Keep replies short and skimmable (2–5 sentences, occasional bullets). Ask one focused question at a time.
${markdown ? MARKDOWN_RULE : PLAIN_RULE}
- Do not claim an action happened unless a tool actually ran.
- Never ask for or accept passwords or card details in chat — checkout is handled securely on the site.
- Items marked [COMING SOON] are NOT purchasable — collect a lead instead of pushing checkout.
${accountSection}

# HOW TO CONVERT
- When you recommend a product the visitor can buy, call offer_actions with a 'buy' button (pre-loads checkout) — and a 'signup' button if they don't have an account yet.
- For trainings/courses/free content, use 'nav' buttons to the right page.
- If they're interested but hesitant or not ready, get their email and call save_lead so the team can follow up. Offer this naturally; don't demand it.
- Use the 'whatsapp' handoff only when they explicitly want a human or you truly can't help.
- Always end with a next step.

# CATALOG (live data — the source of truth)
${knowledgePack}`;

  // Per-visitor, so it can never be cached. Kept last, which also puts "who am
  // I talking to" closest to the conversation itself.
  return { cacheable, dynamic: userContext };
}

export function buildUserContext(user, now = new Date(), page = {}) {
  // Today in Lagos. In the per-visitor half so the cached prefix never changes
  // at midnight; Ada needs it to turn "last month" into dates.
  const today = `TODAY: ${watToday(now)} (Lagos, WAT, UTC+1). Use this for any date the user describes in words.`;
  if (!user) {
    return `# VISITOR
${today}
A guest who is NOT logged in. If they show buying intent, encourage creating an account (signup) as part of checkout.`;
  }

  const owned = (user.entitlements || [])
    .filter((e) => e.status === "active")
    .map((e) => e.productKey)
    .filter(Boolean);

  const ownedLine = owned.length
    ? `They ALREADY OWN (active): ${owned.join(", ")}. Do NOT try to re-sell these — instead upsell complementary products, trainings or courses they don't have.`
    : `They have no active subscriptions yet — a prime candidate for a first purchase.`;

  // WHERE THEY ARE STANDING. The page reached the tools already, but nothing
  // told the model, so on Project Aurora's own bill "price this project" was
  // answered with "which project?". The reference is only ever a hint: every
  // tool resolves it against the caller's OWN projects.
  const ref = String(page?.projectRef || "").trim();
  const onPage = ref
    ? `
ON A PROJECT PAGE: they are looking at a project right now, one of their own or a read-only sample (product: ${String(page?.productKey || "unknown")}, reference: ${ref}). When they say "this project", "this bill", "here", or name no project, it is THIS one: leave the project name out where a tool allows it (it then uses the page's project), and where a tool requires one, pass the reference above as the name. Do not ask which project.`
    : "";

  return `# VISITOR
${today}
A LOGGED-IN user${user.name ? ` named ${user.name}` : ""}${user.email ? ` (${user.email})` : ""}. ${ownedLine}${onPage}`;
}

/* --------------------------- tool handlers --------------------------- */

// The estimator tools return { text, card }. The text answers the model; the
// card is queued for the chat to render under the reply. One card of each kind
// per turn: if the model calls a tool twice, the later card replaces the
// earlier, so the user never sees two Apply buttons for the same bill.
export function withCard(out, ctx) {
  if (!out || typeof out !== "object") return out;
  if (out.card) {
    // One card per kind per reply; a card with its own key (windows and doors
    // proposed in one reply) keeps its siblings.
    const key = (c) => c?.cardKey || c?.type;
    ctx.pendingActions = ctx.pendingActions.filter((a) => key(a) !== key(out.card));
    ctx.pendingActions.push(out.card);
  }
  return out.text || "";
}
// THE LAST LOCK BEFORE A CARD REACHES THE CHAT.
//
// The tools already refuse a sample (util/agentSampleGuard.js). This asks the
// database again, by the card's own project id, so the Proposed rates card can
// never be drawn for a sample even if a resolver changes. A report card for a
// sample passes only when the period-report tool built it as a labelled sample
// report (card.sample and the sample title, owner's decision 8 Oct 2026); any
// other report card for a sample is refused.
// A lookup that fails drops the card: a missing Apply button is a retry, a
// sample's rates on a client's bill is not.
export async function refuseSampleCard(out) {
  if (!out || typeof out !== "object" || !out.card) return out;
  const id = String(out.card?.project?.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) return out;
  let sample = null;
  try {
    sample = await TakeoffProject.findOne({ _id: id, isSample: true }, { _id: 1, name: 1 }).lean();
  } catch (e) {
    console.error("[salesAgent] sample check failed:", e?.message || e);
    return "That could not be checked just now. Apologise briefly and ask the user to try again; do NOT say anything was proposed.";
  }
  if (!sample) return out;
  if (out.card.type === "project-report") {
    const labelled =
      out.card.sample === true && out.card.title === SAMPLE_REPORT_TITLE && isSampleAnswer(out.text);
    return labelled ? out : samplePeriodReportRefusal(sample);
  }
  return sampleProposalRefusal(sample);
}

async function handleSaveLead(input, ctx, outcome) {
  const email = String(input?.email || "").trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return "A valid email is required to save the lead — ask the visitor for it.";
  }

  const productKeys = Array.isArray(input?.productKeys)
    ? input.productKeys.map(String).filter(Boolean).slice(0, 10)
    : [];

  try {
    const lead = await Lead.create({
      name: String(input?.name || "").trim(),
      email,
      phone: String(input?.phone || "").trim(),
      interest: String(input?.interest || "").trim().slice(0, 500),
      productKeys,
      note: String(input?.note || "").trim().slice(0, 1000),
      source: "ai-agent",
      userId: ctx.user?._id || null,
      sessionId: ctx.sessionId || "",
      ip: ctx.ip || "",
    });

    // Best-effort CRM sync — never blocks the reply.
    try {
      const notion = await syncLeadToNotion(lead);
      lead.notion = notion;
      await lead.save();
    } catch {}

    outcome.capturedLead = true;
    return `Lead saved for ${email}. The team will follow up. Confirm this to the visitor warmly.`;
  } catch (e) {
    console.error("[salesAgent] save_lead failed:", e?.message || e);
    return "Could not save the lead due to a server error — apologise briefly and offer WhatsApp.";
  }
}

function handleOfferActions(input, ctx, outcome) {
  const raw = Array.isArray(input?.actions) ? input.actions : [];
  const clean = [];

  for (const a of raw.slice(0, 5)) {
    const type = String(a?.type || "").toLowerCase();
    const label = String(a?.label || "").trim().slice(0, 40);
    if (!label) continue;

    if (type === "buy") {
      const key = String(a?.productKey || "").toLowerCase();
      const info = ctx.productIndex.get(key);
      if (!info || info.comingSoon) continue; // reject unknown / not purchasable
      const months = Math.min(Math.max(parseInt(a?.months || 1, 10) || 1, 1), 24);
      clean.push({ type: "buy", label, productKey: info.key, months });
      outcome.offeredCheckout = true;
      outcome.productKeysOffered.push(info.key);
    } else if (type === "signup") {
      clean.push({ type: "signup", label });
      outcome.offeredSignup = true;
    } else if (type === "nav") {
      const to = String(a?.to || "").trim();
      if (!to.startsWith("/")) continue;
      clean.push({ type: "nav", label, to });
    } else if (type === "whatsapp") {
      clean.push({ type: "whatsapp", label, number: WHATSAPP_NUMBER });
    }
  }

  ctx.pendingActions.push(...clean);
  return clean.length
    ? `Rendered ${clean.length} button(s) to the visitor.`
    : "None of the actions were valid (check productKeys exist and aren't coming soon).";
}

// Identifies the caller to the AI-service client so its AWS spend lands on the
// right user in the admin AI-usage dashboard (and so per-user allocations can
// be enforced before the request is even sent).
function aiServiceMeta(ctx) {
  return { user: ctx.user, sessionId: ctx.sessionId, ip: ctx.ip };
}

// Account tools require an authenticated user. The guard is here (not just the
// tool availability) so a guest can never reach the data even if the model
// somehow emits the call.
export async function handleAccountTool(name, input, ctx) {
  if (!ctx.user?._id) {
    // A guest reaching for these is showing real intent — they want something
    // done with THEIR bill. Treat it as the strongest buying signal in the
    // conversation, not an error to apologise for.
    return (
      "The visitor is NOT logged in, so their account/projects can't be read. " +
      "This is a BUYING SIGNAL: they want ADLM working on their own data. " +
      "Warmly explain what they'd get once signed in — their projects, budgets " +
      "and subscription answered directly, plus rate benchmarking and BoQ error " +
      "checking against ADLM's market library — then call offer_actions with a " +
      "'signup' button. Frame it as the next step, never as a refusal."
    );
  }
  // The page the user is on, plus who may open samples (util/agentSampleGuard.js):
  // project tools may answer about ONE sample the user names or opens.
  const here = ctx.lookup || ctx.page;
  try {
    if (name === "get_my_projects") return await getPortfolioSummary(ctx.user._id);
    if (name === "get_my_account") return await getAccountSummary(ctx.user);
    // ctx.page is the address the user is standing on. It is used only when
    // they did not name a project — see resolveProject.
    if (name === "get_project_details")
      return await getProjectDetails(ctx.user._id, input?.projectName, here);
    if (name === "get_resource_quantity")
      return await getResourceQuantity(ctx.user._id, input?.resource, input?.projectName, here);
    if (name === "get_project_budget")
      return await getProjectBudget(ctx.user._id, input?.projectName, here);
    if (name === "get_my_referral_link") {
      const r = await referralSummary(ctx.user._id);
      if (!r) return "Their referral link could not be made just now.";
      // The bare URL on its own line: chatMarkdown renders a naked https link
      // as a real anchor, while [text](url) would hide the code from the person
      // who has to read it out or paste it somewhere else.
      return [
        `Referral link: ${r.link}`,
        `Code: ${r.code}`,
        `Signed up through it: ${r.signups}`,
        `Of those, subscribed: ${r.converted}`,
        "Print the link exactly as written above, on its own line, not as a markdown link.",
      ].join("\n");
    }
    if (name === "get_procurement_schedule")
      return await getProcurementSchedule(ctx.user._id, input?.projectName, here, {
        leadDays: input?.leadDays,
      });
    if (name === "get_project_bill")
      return await getProjectBill(ctx.user._id, input?.projectName, input?.search, here);
    if (name === "get_room_finishes")
      return await getRoomFinishes(ctx.user._id, input, ctx.page);

    // ── Estimator & PM ──
    if (name === "propose_project_pricing")
      return withCard(
        await refuseSampleCard(await getPricingProposal(ctx.user._id, input?.projectName, here)),
        ctx,
      );
    // Only offered to a chat that draws their card; refused again here so a
    // tool call the model makes up anyway never reaches an older chat.
    if ((name === "propose_price_by_area" || name === "propose_set_rates") && !ctx.userRates)
      return "Pricing by message is not available in this chat yet. Tell the user it is coming soon and that for now they can type the rate on the line in the project's Bill tab. Do not say any rate was set.";
    // After a sample's figures were shown, a stated rate must be one the user
    // typed in this message: Ada never carries a sample's rate across.
    if (
      (name === "propose_price_by_area" || name === "propose_set_rates") &&
      ctx.sampleInConversation &&
      !rateTypedByUser(name === "propose_price_by_area" ? input?.ratePerM2 : input?.rate, ctx.message)
    )
      return SAMPLE_RATE_NOT_TYPED;
    if (name === "propose_price_by_area")
      return withCard(
        await refuseSampleCard(
          await getAreaPricingProposal(
            ctx.user._id,
            input?.projectName,
            { category: input?.category, ratePerM2: input?.ratePerM2, split: input?.split },
            here,
          ),
        ),
        ctx,
      );
    if (name === "propose_set_rates")
      return withCard(
        await refuseSampleCard(
          await getSetRatesProposal(
            ctx.user._id,
            input?.projectName,
            { match: input?.match, rate: input?.rate, unit: input?.unit, split: input?.split },
            here,
          ),
        ),
        ctx,
      );
    if (name === "project_report")
      return withCard(
        await refuseSampleCard(
          await getProjectPeriodReport(ctx.user._id, input?.projectName, input?.from, input?.to, here),
        ),
        ctx,
      );
    if (name === "project_tips")
      return await getProjectTipsForAgent(ctx.user._id, input?.projectName, here);

    // ── ADLM AI Service (AWS) — always fed the user's REAL bill lines ──
    if (name === "check_my_rates" || name === "find_project_errors") {
      const picked = await getBillItemsForAi(
        ctx.user._id,
        input?.projectName,
        input?.search,
        name === "check_my_rates" ? 150 : 300,
        // A ₦0 line can't be benchmarked (it just returns "100% below
        // market"), but IS worth flagging in an error scan.
        { requireRate: name === "check_my_rates" },
        here,
      );
      if (picked.error) return picked.error;

      const out =
        name === "check_my_rates"
          ? await checkRatesAgainstMarket({
              items: picked.items,
              zone: input?.zone,
              accessToken: ctx.accessToken,
              projectName: picked.project.name,
              meta: aiServiceMeta(ctx),
            })
          : await scanProjectForErrors({
              items: picked.items,
              accessToken: ctx.accessToken,
              projectName: picked.project.name,
              meta: aiServiceMeta(ctx),
            });

      const extra = [];
      if (picked.truncated) {
        extra.push(
          `Only the ${picked.items.length} highest-value lines were checked; ${picked.truncated} smaller line(s) were not. Say so, and offer to check a specific section by name.`,
        );
      }
      if (picked.unpriced) {
        extra.push(
          `${picked.unpriced} line(s) were SKIPPED because they have no rate yet (₦0) — they can't be benchmarked. Mention this and offer to build a rate up for them with suggest_rate.`,
        );
      }
      if (picked.note) extra.push(picked.note);
      // A sample's bill can be checked; the answer is labelled as one.
      const body = extra.length ? `${out}\n${extra.join("\n")}` : out;
      return picked.sample ? `${picked.banner}${body}` : body;
    }

    if (name === "suggest_rate") {
      return await buildUpRate({
        description: input?.description,
        unit: input?.unit,
        zone: input?.zone,
        accessToken: ctx.accessToken,
        meta: aiServiceMeta(ctx),
      });
    }

    return "Unknown account tool.";
  } catch (e) {
    console.error(`[salesAgent] ${name} failed:`, e?.message || e);
    return "Couldn't read that account data due to a server error — apologise briefly and offer WhatsApp.";
  }
}

/* ------------------------------ main ------------------------------ */
/**
 * Run one agent turn.
 * @param {Array<{role:'user'|'assistant', text:string}>} history  prior turns
 * @param {string} message  the new user message
 * @param {object} opts { user, sessionId, ip }
 * @returns {Promise<{reply:string, actions:Array, outcome:object}>}
 */
// R17: Markdown only for a chat that renders it (lib/chatMarkdown.jsx), which
// says so with format: "markdown". Any other caller, such as a classic build
// that predates the renderer, keeps plain text (review, 2026-09-22).
const MARKDOWN_RULE =
  '- Light Markdown only: **bold** for a product name or a price, *italics* sparingly, "- " bullets or "1. " numbered steps, a small table (| a | b |) when comparing two or three products, and [links](/pricing) to pages of the site. No # headings, no code blocks or backticks.';
const PLAIN_RULE =
  '- Write PLAIN TEXT. The chat does not render Markdown: never use asterisks (* or **), underscores for emphasis, # headings or backticks. For a list, start each line with "• ".';

export async function runSalesAgent(history, message, opts = {}) {
  const { knowledgePack, productIndex } = await getCatalog();
  const system = buildSystemPrompt({
    knowledgePack,
    userContext: buildUserContext(opts.user, opts.now || new Date(), opts.page),
    canReadAccount: !!opts.user,
    canUseAiService: !!opts.user && !!opts.accessToken && aiServiceEnabled(),
    canUseCards: !!opts.user && opts.cards === true,
    canUseUserRates: canUseUserRateCard(opts),
    markdown: opts.format === "markdown",
  });

  const outcome = {
    capturedLead: false,
    offeredCheckout: false,
    offeredSignup: false,
    productKeysOffered: [],
  };
  const ctx = {
    user: opts.user || null,
    // Forwarded to the ADLM AI Service so its calls are made, metered and
    // entitlement-checked as THIS user. Never logged, never persisted.
    accessToken: opts.accessToken || "",
    sessionId: opts.sessionId || "",
    ip: opts.ip || "",
    // WHERE THE USER IS STANDING.
    //
    // The widget is mounted on every route and used to send nothing about the
    // page, so a user on their own project page asking "what is left to buy on
    // this job" was asked which project they meant. The client now sends the
    // reference its own address carries — an ObjectId on the classic workspace,
    // a slug on the new one — and the tools fall back to it only when no
    // project was named.
    page: {
      projectRef: String(opts.page?.projectRef || "").trim().slice(0, 120),
      productKey: String(opts.page?.productKey || "").trim().toLowerCase().slice(0, 40),
    },
    // The page plus who may open samples: the project tools answer about ONE
    // sample only when the user names it or is on its page, read-only.
    lookup: {
      projectRef: String(opts.page?.projectRef || "").trim().slice(0, 120),
      productKey: String(opts.page?.productKey || "").trim().toLowerCase().slice(0, 40),
      sampleViewer: opts.user || null,
    },
    // This turn's own words, so a stated rate can be checked against them.
    message: String(message || "").slice(0, 2000),
    // A tool answered about a sample this turn: the reply carries the label.
    sampleAnswered: false,
    // A sample's figures are in this conversation (now or earlier).
    sampleInConversation:
      mentionsSample(message) ||
      (Array.isArray(history) ? history : []).some(
        (m) => m && m.role === "assistant" && String(m.text || "").includes(SAMPLE_LABEL),
      ),
    productIndex,
    pendingActions: [],
    // The chat can show the stated-rate card (see CAP_USER_RATE_CARD).
    userRates: canUseUserRateCard(opts),
  };

  // Seed messages from prior history (text only), then the new user turn.
  const messages = history
    .filter((m) => m && m.text)
    .slice(-12)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m.text).slice(0, 2000) }],
    }));
  // Anthropic requires the conversation to open with a user turn — drop any
  // leading assistant turns (e.g. the widget's canned greeting).
  while (messages.length && messages[0].role === "assistant") messages.shift();
  messages.push({
    role: "user",
    content: [{ type: "text", text: String(message).slice(0, 2000) }],
  });

  let finalText = "";
  // Account tools are only exposed when a user is authenticated — a guest
  // never even sees them, and the handler double-checks anyway.
  // The AI-service tools additionally need a forwardable token and a
  // configured endpoint; without either they're never offered.
  const canUseAiService = !!opts.user && !!opts.accessToken && aiServiceEnabled();
  const toolset = opts.user
    ? [
        ...TOOLS,
        ...ACCOUNT_TOOLS,
        ...estimatorToolsFor(opts),
        ...(canUseAiService ? AI_SERVICE_TOOLS : []),
      ]
    : TOOLS;
  const tools = supportsTools() ? toolset : undefined;
  const accountToolNames = new Set(
    [...ACCOUNT_TOOLS, ...ESTIMATOR_TOOLS, ...AI_SERVICE_TOOLS].map((t) => t.name),
  );

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await createMessage({
      system,
      messages,
      tools,
      maxTokens: 700,
      // Meters this round-trip on the admin AI-usage dashboard. Note that one
      // user message can produce up to MAX_TOOL_ITERATIONS of these.
      meta: {
        feature: "ada-chat",
        user: ctx.user,
        sessionId: ctx.sessionId,
        ip: ctx.ip,
      },
    });

    if (res.text) finalText = res.text;

    if (!res.toolUses?.length) break; // model is done

    // Echo the assistant turn (with tool_use blocks) back verbatim…
    messages.push({ role: "assistant", content: res.assistantContent });

    // …then answer each tool_use with a tool_result.
    const toolResults = [];
    for (const tu of res.toolUses) {
      let out = "Unknown tool.";
      if (tu.name === "save_lead") out = await handleSaveLead(tu.input, ctx, outcome);
      else if (tu.name === "offer_actions") out = handleOfferActions(tu.input, ctx, outcome);
      else if (accountToolNames.has(tu.name)) out = await handleAccountTool(tu.name, tu.input, ctx);
      if (isSampleAnswer(out)) {
        ctx.sampleAnswered = true;
        ctx.sampleInConversation = true;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: out,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText =
      "I want to make sure I point you to the right thing — could you tell me a bit more about what you're trying to do?";
  }

  // Every answer about a sample is labelled, whatever the model wrote.
  finalText = labelSampleReply(finalText, ctx.sampleAnswered);

  return { reply: finalText, actions: ctx.pendingActions, outcome };
}
