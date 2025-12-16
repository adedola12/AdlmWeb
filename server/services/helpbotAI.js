import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askAI({ question, context }) {
  if (process.env.HELPBOT_AI_ENABLED !== "true") return null;

  const prompt = `
You are ADLM HelpBot.

Rules:
- Be brief (max 5 lines)
- Only talk about ADLM products, courses, and navigation
- If unsure, say "I may not be fully certain"
- Never invent pricing or features
- Encourage WhatsApp support when needed

Context:
${context}

User question:
${question}
`;

  const res = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    max_tokens: Number(process.env.HELPBOT_AI_MAX_TOKENS || 120),
    temperature: 0.2,
  });

  return res.choices?.[0]?.message?.content || null;
}
