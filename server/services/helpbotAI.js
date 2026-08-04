import { createMessage, agentEnabled } from "./aiClient.js";
import { checkAiAllowance } from "./aiUsage.js";

// Routed through aiClient.createMessage rather than holding its own provider
// client. That module is the single choke point for direct model calls, so it
// already owns the transport, the timeout, prompt caching and the usage
// record — this file previously duplicated all four against OpenAI, which is
// why its spend showed up on the dashboard under a second provider.
//
// `meta` ({ user, ip, sessionId }) attributes the call on the admin AI-usage
// dashboard and lets a per-user allocation stop it. Returning null on a blocked
// call is deliberate — the route already renders a graceful "no answer" reply
// for that case, so a spent allowance degrades to catalogue-only search rather
// than an error.
const MAX_TOKENS = Number(process.env.HELPBOT_AI_MAX_TOKENS || 140);

// The rules never vary, so they are the cacheable half of the prompt; the
// page context and the question change every call and must stay out of it or
// nothing ever cache-hits.
const RULES = `You are ADLM HelpBot.

Rules:
- Keep answers short (max 6 lines).
- Only talk about ADLM navigation, products, courses, trainings.
- Never invent pricing or features.
- If unsure, say "I may not be fully certain" and suggest WhatsApp support.`;

export async function askAI({ question, context, meta = {} }) {
  if (process.env.HELPBOT_AI_ENABLED !== "true") return null;
  if (!agentEnabled()) return null;

  const gate = await checkAiAllowance({ user: meta.user, feature: "helpbot", ip: meta.ip });
  if (!gate.allowed) return null;

  const out = await createMessage({
    system: { cacheable: RULES, dynamic: context ? `Context:\n${context}` : "" },
    messages: [{ role: "user", content: String(question || "") }],
    maxTokens: MAX_TOKENS,
    meta: { feature: "helpbot", user: meta.user || null, ip: meta.ip, sessionId: meta.sessionId },
  });

  return out?.text?.trim() || null;
}
