import OpenAI from "openai";

const model = process.env.HELPBOT_AI_MODEL || "gpt-4o-mini";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function askAI({ question, context }) {
  if (process.env.HELPBOT_AI_ENABLED !== "true") return null;
  if (!client) return null;

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

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: Number(process.env.HELPBOT_AI_MAX_TOKENS || 140),
    temperature: 0.2,
  });

  return res.choices?.[0]?.message?.content?.trim() || null;
}
