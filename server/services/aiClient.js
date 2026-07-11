// server/services/aiClient.js
// Provider-agnostic chat transport for the ADLM AI Agent.
//
//   AGENT_PROVIDER=anthropic (default) → Claude via REST (native tool use).
//   AGENT_PROVIDER=openai              → OpenAI SDK, TEXT ONLY (degraded
//                                        fallback; no tool calls / buttons).
//
// The agent loop (services/salesAgent.js) owns the tools and the multi-turn
// tool-result exchange; this module only normalizes one model round-trip into:
//   { text, toolUses:[{id,name,input}], assistantContent, stopReason }
// where `assistantContent` is the provider-native assistant turn to echo back.

import fetch from "node-fetch";
import OpenAI from "openai";

const PROVIDER = (process.env.AGENT_PROVIDER || "anthropic").toLowerCase();
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 30000);

const DEFAULT_MODEL =
  process.env.AGENT_MODEL ||
  (PROVIDER === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

let _openai = null;
function openai() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export function agentEnabled() {
  if (process.env.AGENT_ENABLED !== "true") return false;
  if (PROVIDER === "openai") return !!process.env.OPENAI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

export function agentProvider() {
  return PROVIDER;
}

/* ------------------------- Anthropic ------------------------- */
async function anthropicCreate({ system, messages, tools, maxTokens }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": String(process.env.ANTHROPIC_API_KEY || "").trim(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens || 700,
        system,
        messages,
        ...(tools && tools.length ? { tools } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data?.error?.message || `Anthropic API ${res.status}`,
      );
    }

    const content = Array.isArray(data.content) ? data.content : [];
    const text = content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolUses = content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));

    return {
      text,
      toolUses,
      assistantContent: content, // echo back verbatim on the next turn
      stopReason: data.stop_reason || "end_turn",
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------- OpenAI (text only) ------------------------- */
async function openaiCreate({ system, messages, maxTokens }) {
  // Flatten our content-block messages down to plain text for the fallback.
  const flat = messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const text = (Array.isArray(m.content) ? m.content : [])
      .map((b) =>
        b.type === "text"
          ? b.text
          : b.type === "tool_result"
            ? String(b.content || "")
            : "",
      )
      .filter(Boolean)
      .join("\n");
    return { role: m.role === "assistant" ? "assistant" : "user", content: text };
  });

  const res = await openai().chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens || 700,
    temperature: 0.3,
    messages: [{ role: "system", content: system }, ...flat],
  });

  const text = res.choices?.[0]?.message?.content?.trim() || "";
  return { text, toolUses: [], assistantContent: text, stopReason: "end_turn" };
}

/**
 * One model round-trip. `messages` uses Anthropic-style content blocks
 * (strings are also accepted). Returns the normalized shape above.
 */
export async function createMessage({ system, messages, tools, maxTokens }) {
  if (PROVIDER === "openai") return openaiCreate({ system, messages, maxTokens });
  return anthropicCreate({ system, messages, tools, maxTokens });
}

export function supportsTools() {
  return PROVIDER !== "openai";
}
