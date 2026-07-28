// server/services/salesAgent.js
// The ADLM AI Agent's brain: builds a conversion-focused system prompt grounded
// in the live catalog, runs the Claude tool-use loop, and executes its two
// tools (save_lead, offer_actions). Returns a reply + tappable actions for the
// widget to render.

import { createMessage, supportsTools } from "./aiClient.js";
import { getCatalog } from "./catalog.js";
import { Lead } from "../models/Lead.js";
import { syncLeadToNotion } from "../util/notion.js";
import {
  getPortfolioSummary,
  getProjectDetails,
  getAccountSummary,
  getResourceQuantity,
  getProjectBudget,
  getProjectBill,
  getBillItemsForAi,
} from "./agentUserData.js";
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
      "combined value, work done, outstanding value, overall progress, and a " +
      "per-product breakdown. Use when they ask about 'my projects', total or " +
      "outstanding project cost, portfolio value, or overall progress. No arguments.",
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
];

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
function buildSystemPrompt({ knowledgePack, userContext, canReadAccount, canUseAiService }) {
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
- get_my_projects — their whole portfolio: number of projects, combined value, work done, outstanding value, overall progress, per-product breakdown. Use for "my projects", "total cost/value of my projects", "how far along am I".
- get_project_details — value, progress and schedule for ONE named project. Use for questions about a specific project.
- get_my_account — their subscriptions (what they own, active/expired, expiry) and project-slot usage. Use for "my subscription", "when does X expire", "how many projects can I create".
- get_resource_quantity — the TOTAL QUANTITY and cost of one material, labour trade or resource (cement, sand, rebar, blocks, formwork, masons…) in one project or across all of them. This is the tool for ANY "how much / how many X do I need" question.
- get_project_bill — the bill of quantities work items (qty, unit, rate, amount, % done), optionally filtered by a search phrase. Use for "what's in my bill", "rate for X", "biggest items".
- get_project_budget — the whole Material & Labour breakdown for one project: total cost, Material vs Labour vs Plant split, procured vs still-to-buy, biggest resources. Use for "material budget", "what do I still need to buy".
Rules for account answers:
- ALWAYS call the relevant tool and quote its numbers exactly — NEVER invent or estimate project figures, values, quantities or dates.
- You CAN read their bill lines and their material & labour lines — never tell a user you have no access to them. If a tool finds nothing, say what was searched and ask how the item is worded in their bill.
- Quantities live per unit of measure (bags, m³, kg, m²). NEVER add different units together and never convert between them unless the user supplies the conversion factor.
- Quote money exactly as the tool returns it. If a figure is ₦0, say the bill has no rates yet rather than guessing.
- If a project has no Material & Labour breakdown, explain it comes from the desktop plugin on save (MEP projects don't send one) — don't estimate one.
- After answering, still be helpful commercially where natural (e.g. an expired sub → offer renewal; no RateGen → mention it) but don't force it.
- For deeper detail, point them to the Portfolio Dashboard or a project's Project/PM report.${aiSection}`
    : `
# NOT LOGGED IN
This visitor is a guest, so you CANNOT read any personal projects or subscriptions. If they ask about "my projects", "my subscription", "what I've spent" etc., warmly explain they need to sign in first, then offer a 'signup' or 'nav' to login — never guess their data.`;

  return `You are "Ada", the AI product specialist AND account assistant for ADLM Studio — a Nigerian construction-tech company that builds software, plugins and training for Quantity Surveyors, estimators and BIM professionals (products include RateGen, take-off plugins for Revit/PlanSwift/Civil, HERON, and professional trainings).

# YOUR GOAL
Help every visitor find the right ADLM product or training and move them to ACTION: create an account (sign up) or make a purchase. For logged-in users you ALSO answer questions about their own projects and subscription. You are friendly, sharp and genuinely helpful — a great salesperson and a reliable assistant, never pushy or spammy. Qualify the need, recommend the best-fit product, state the real price, and offer a clear next step.

# HARD RULES
- Ground every claim in the CATALOG below (for products) or the account TOOLS (for their data). NEVER invent products, features, prices, dates, discounts, or project figures. If something isn't available, say you'll connect them to the team.
- Quote prices exactly as written in the catalog. Prices are per seat. Nigerian visitors pay in ₦, others in $.
- Keep replies short and skimmable (2–5 sentences, occasional bullets). Ask one focused question at a time.
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

${userContext}

# CATALOG (live data — the source of truth)
${knowledgePack}`;
}

function buildUserContext(user) {
  if (!user) {
    return `# VISITOR
A guest who is NOT logged in. If they show buying intent, encourage creating an account (signup) as part of checkout.`;
  }

  const owned = (user.entitlements || [])
    .filter((e) => e.status === "active")
    .map((e) => e.productKey)
    .filter(Boolean);

  const ownedLine = owned.length
    ? `They ALREADY OWN (active): ${owned.join(", ")}. Do NOT try to re-sell these — instead upsell complementary products, trainings or courses they don't have.`
    : `They have no active subscriptions yet — a prime candidate for a first purchase.`;

  return `# VISITOR
A LOGGED-IN user${user.name ? ` named ${user.name}` : ""}${user.email ? ` (${user.email})` : ""}. ${ownedLine}`;
}

/* --------------------------- tool handlers --------------------------- */
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
async function handleAccountTool(name, input, ctx) {
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
  try {
    if (name === "get_my_projects") return await getPortfolioSummary(ctx.user._id);
    if (name === "get_my_account") return await getAccountSummary(ctx.user);
    if (name === "get_project_details")
      return await getProjectDetails(ctx.user._id, input?.projectName);
    if (name === "get_resource_quantity")
      return await getResourceQuantity(ctx.user._id, input?.resource, input?.projectName);
    if (name === "get_project_budget")
      return await getProjectBudget(ctx.user._id, input?.projectName);
    if (name === "get_project_bill")
      return await getProjectBill(ctx.user._id, input?.projectName, input?.search);

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
      return extra.length ? `${out}\n${extra.join("\n")}` : out;
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
export async function runSalesAgent(history, message, opts = {}) {
  const { knowledgePack, productIndex } = await getCatalog();
  const system = buildSystemPrompt({
    knowledgePack,
    userContext: buildUserContext(opts.user),
    canReadAccount: !!opts.user,
    canUseAiService: !!opts.user && !!opts.accessToken && aiServiceEnabled(),
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
    productIndex,
    pendingActions: [],
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
    ? [...TOOLS, ...ACCOUNT_TOOLS, ...(canUseAiService ? AI_SERVICE_TOOLS : [])]
    : TOOLS;
  const tools = supportsTools() ? toolset : undefined;
  const accountToolNames = new Set(
    [...ACCOUNT_TOOLS, ...AI_SERVICE_TOOLS].map((t) => t.name),
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

  return { reply: finalText, actions: ctx.pendingActions, outcome };
}
