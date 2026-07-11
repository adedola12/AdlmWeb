// server/services/salesAgent.js
// The ADLM AI Agent's brain: builds a conversion-focused system prompt grounded
// in the live catalog, runs the Claude tool-use loop, and executes its two
// tools (save_lead, offer_actions). Returns a reply + tappable actions for the
// widget to render.

import { createMessage, supportsTools } from "./aiClient.js";
import { getCatalog } from "./catalog.js";
import { Lead } from "../models/Lead.js";
import { syncLeadToNotion } from "../util/notion.js";

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

/* --------------------------- system prompt --------------------------- */
function buildSystemPrompt({ knowledgePack, userContext }) {
  return `You are "Ada", the AI product specialist for ADLM Studio — a Nigerian construction-tech company that builds software, plugins and training for Quantity Surveyors, estimators and BIM professionals (products include RateGen, take-off plugins for Revit/PlanSwift/Civil, HERON, and professional trainings).

# YOUR GOAL
Help every visitor find the right ADLM product or training and move them to ACTION: create an account (sign up) or make a purchase. You are friendly, sharp and genuinely helpful — a great salesperson, never pushy or spammy. You qualify the need, recommend the best-fit product, state the real price, and offer a clear next step every time.

# HARD RULES
- Ground every claim in the CATALOG below. NEVER invent products, features, prices, dates, or discounts. If something isn't in the catalog, say you'll connect them to the team.
- Quote prices exactly as written in the catalog. Prices are per seat. Nigerian visitors pay in ₦, others in $.
- Keep replies short and skimmable (2–5 sentences, occasional bullets). Ask one focused question at a time.
- Do not claim an action happened unless a tool actually ran.
- Never ask for or accept passwords or card details in chat — checkout is handled securely on the site.
- Items marked [COMING SOON] are NOT purchasable — collect a lead instead of pushing checkout.

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
  });

  const outcome = {
    capturedLead: false,
    offeredCheckout: false,
    offeredSignup: false,
    productKeysOffered: [],
  };
  const ctx = {
    user: opts.user || null,
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
  const tools = supportsTools() ? TOOLS : undefined;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await createMessage({
      system,
      messages,
      tools,
      maxTokens: 700,
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
