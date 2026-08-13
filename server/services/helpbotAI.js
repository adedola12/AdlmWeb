// server/services/helpbotAI.js
// The one-shot answer HelpBot gives when the catalogue search finds nothing.
//
// This used to hold its own OpenAI client, its own model id and its own copy
// of the metering calls. It now goes through services/aiClient.js like every
// other model call the website makes, which means it follows AGENT_PROVIDER —
// today Bedrock, authenticated by the server's IAM role.
//
// WHY: an OPENAI_API_KEY is the same shape of dependency that took Ada down —
// a third-party key drawn against a third-party balance, either of which can
// stop working without anything here changing. HelpBot fails far more gently
// than Ada did (a null answer degrades the widget to catalogue-only search
// rather than erroring), but "fails quietly" is its own problem: nobody would
// have noticed. Routing it through the shared transport also means it is
// metered at the same choke point, so it can never again be the AI call that
// does not appear on the spend dashboard.

import { createMessage, providerConfigured } from "./aiClient.js";
import { checkAiAllowance } from "./aiUsage.js";

// Identical for every visitor and every question, so it belongs in `system`
// rather than glued onto the front of the user turn: it is what lets the
// provider treat the rules as a cacheable prefix, and it keeps the actual
// question the only thing the model reads as input.
const SYSTEM_RULES = `You are ADLM HelpBot.

Rules:
- Keep answers short (max 6 lines).
- Only talk about ADLM navigation, products, courses, trainings.
- Never invent pricing or features.
- If unsure, say "I may not be fully certain" and suggest WhatsApp support.`;

/**
 * `meta` ({ user, ip, sessionId }) attributes the call on the admin AI-usage
 * dashboard and lets a per-user allocation stop it. Returning null on a blocked
 * call is deliberate — the route already renders a graceful "no answer" reply
 * for that case, so a spent allowance degrades to catalogue-only search rather
 * than an error.
 */
export async function askAI({ question, context, meta = {} }) {
  if (process.env.HELPBOT_AI_ENABLED !== "true") return null;
  // HelpBot's own switch, then the provider's credentials — deliberately NOT
  // agentEnabled(), which would tie this to Ada's master switch and make
  // turning the chat widget off take the help answers down with it.
  if (!providerConfigured()) return null;

  const gate = await checkAiAllowance({ user: meta.user, feature: "helpbot", ip: meta.ip });
  if (!gate.allowed) return null;

  const out = await createMessage({
    system: SYSTEM_RULES,
    messages: [
      {
        role: "user",
        content: `Context:\n${context}\n\nUser question:\n${question}`,
      },
    ],
    maxTokens: Number(process.env.HELPBOT_AI_MAX_TOKENS || 140),
    // Kept from the original OpenAI call. This answers navigation questions
    // about a real catalogue, so it should be as close to deterministic as the
    // provider allows.
    temperature: 0.2,
    // createMessage meters every call it makes, so there is no recordAiUsage
    // here any more — one choke point, and no way for this feature to drift
    // out of the dashboard again.
    meta: {
      feature: "helpbot",
      user: meta.user || null,
      ip: meta.ip,
      sessionId: meta.sessionId,
    },
  });

  return out?.text?.trim() || null;
}
