import OpenAI from "openai";
import { recordAiUsage, normalizeUsage, checkAiAllowance } from "./aiUsage.js";

const model = process.env.HELPBOT_AI_MODEL || "gpt-4o-mini";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// `meta` ({ user, ip, sessionId }) attributes the call on the admin AI-usage
// dashboard and lets a per-user allocation stop it. Returning null on a blocked
// call is deliberate — the route already renders a graceful "no answer" reply
// for that case, so a spent allowance degrades to catalogue-only search rather
// than an error.
export async function askAI({ question, context, meta = {} }) {
  if (process.env.HELPBOT_AI_ENABLED !== "true") return null;
  if (!client) return null;

  const gate = await checkAiAllowance({ user: meta.user, feature: "helpbot", ip: meta.ip });
  if (!gate.allowed) return null;

  const prompt = `
You are ADLM HelpBot.

Rules:
- Keep answers short (max 6 lines).
- Only talk about ADLM navigation, products, courses, trainings.
- Never invent pricing or features.
- If unsure, say "I may not be fully certain" and suggest WhatsApp support.

Context:
${context}

User question:
${question}
`;

  const started = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: Number(process.env.HELPBOT_AI_MAX_TOKENS || 140),
      temperature: 0.2,
    });

    const usage = normalizeUsage(res.usage);
    recordAiUsage({
      feature: "helpbot",
      user: meta.user || null,
      provider: "openai",
      model: res.model || model,
      usage: usage || undefined,
      tokenSource: usage ? "reported" : "none",
      ms: Date.now() - started,
      ok: true,
      ip: meta.ip,
      sessionId: meta.sessionId,
    });

    return res.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    recordAiUsage({
      feature: "helpbot",
      user: meta.user || null,
      provider: "openai",
      model,
      ms: Date.now() - started,
      ok: false,
      errorCode: String(e?.message || "error").slice(0, 120),
      ip: meta.ip,
      sessionId: meta.sessionId,
    });
    throw e;
  }
}
