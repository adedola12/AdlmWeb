// server/services/aiClient.js
// Provider-agnostic chat transport for the ADLM AI Agent.
//
//   AGENT_PROVIDER=anthropic (default) → Claude via REST (native tool use).
//   AGENT_PROVIDER=openai              → OpenAI SDK (function-calling).
//
// BOTH providers support tools, so the full agent (Buy/Sign-up buttons + lead
// capture) works either way. The canonical message/tool format used across the
// agent loop is Anthropic-style content blocks; the OpenAI adapter translates
// that to/from OpenAI's chat format on each call, so salesAgent.js never needs
// to know which provider is active.
//
// The agent loop (services/salesAgent.js) owns the tools and the multi-turn
// tool-result exchange; this module only normalizes one model round-trip into:
//   { text, toolUses:[{id,name,input}], assistantContent, stopReason }
// where `assistantContent` is the assistant turn (canonical blocks) to echo back.

import fetch from "node-fetch";
import OpenAI from "openai";

const PROVIDER = (process.env.AGENT_PROVIDER || "anthropic").toLowerCase();
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 30000);

const DEFAULT_MODEL =
  process.env.AGENT_MODEL ||
  (PROVIDER === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

// Output-token cap per model round-trip. Bounds spend on a public key; the
// caller may pass a smaller value but never a larger one.
const DEFAULT_MAX_TOKENS = Number(process.env.AGENT_MAX_TOKENS || 700);

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
        max_tokens: Math.min(maxTokens || DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS),
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

/* ------------------------- OpenAI (function-calling) ------------------------- */

// Anthropic tool defs → OpenAI function-tool defs.
function toOpenAiTools(tools) {
  if (!tools || !tools.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// Canonical (Anthropic content-block) messages → OpenAI chat messages.
// - assistant text + tool_use blocks → assistant message with tool_calls
// - user tool_result blocks          → separate `tool` role messages
// - user/assistant text              → plain messages
function toOpenAiMessages(system, messages) {
  const out = [{ role: "system", content: system }];

  for (const m of messages) {
    const blocks = Array.isArray(m.content)
      ? m.content
      : [{ type: "text", text: String(m.content || "") }];

    if (m.role === "assistant") {
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));
      const msg = { role: "assistant", content: text || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    } else {
      // A tool_result-carrying user turn must translate to `tool` messages,
      // which OpenAI requires to directly follow the assistant tool_calls.
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      for (const b of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: b.tool_use_id,
          content: String(b.content ?? ""),
        });
      }
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

async function openaiCreate({ system, messages, tools, maxTokens }) {
  const res = await openai().chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens || 700,
    temperature: 0.3,
    messages: toOpenAiMessages(system, messages),
    ...(tools && tools.length
      ? { tools: toOpenAiTools(tools), tool_choice: "auto" }
      : {}),
  });

  const msg = res.choices?.[0]?.message || {};
  const text = (msg.content || "").trim();
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

  const toolUses = calls.map((c) => {
    let input = {};
    try {
      input = JSON.parse(c.function?.arguments || "{}");
    } catch {
      input = {};
    }
    return { id: c.id, name: c.function?.name, input };
  });

  // Rebuild canonical assistant content blocks so the agent loop can echo it
  // back verbatim next turn — identical shape to the Anthropic path.
  const assistantContent = [];
  if (text) assistantContent.push({ type: "text", text });
  for (const tu of toolUses) {
    assistantContent.push({
      type: "tool_use",
      id: tu.id,
      name: tu.name,
      input: tu.input,
    });
  }

  return {
    text,
    toolUses,
    assistantContent,
    stopReason: toolUses.length ? "tool_use" : "end_turn",
  };
}

/**
 * One model round-trip. `messages` uses Anthropic-style content blocks
 * (strings are also accepted). Returns the normalized shape above.
 */
export async function createMessage({ system, messages, tools, maxTokens }) {
  if (PROVIDER === "openai")
    return openaiCreate({ system, messages, tools, maxTokens });
  return anthropicCreate({ system, messages, tools, maxTokens });
}

export function supportsTools() {
  return true; // both providers support tools now
}
