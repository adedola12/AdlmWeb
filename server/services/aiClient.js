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
import { recordAiUsage, normalizeUsage } from "./aiUsage.js";

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

/* ------------------------- prompt caching ------------------------- */
// `system` may be a plain string, or { cacheable, dynamic } — the split form
// tells us which half is identical across visitors and therefore worth
// caching. Ada's catalogue + rules run to several thousand tokens and are
// resent on every round-trip (up to 4 per user message), so caching them is
// the single biggest lever on AI spend: a cache READ costs 0.1x the input
// rate, against 1.25x to write it.
//
// The cached prefix spans tools + this first system block, because Anthropic
// orders the prompt tools → system → messages and a cache_control marker ends
// the cacheable prefix. Both must be byte-identical between calls to hit, so
// anything per-visitor has to live in `dynamic`.
const CACHE_ENABLED = process.env.AGENT_PROMPT_CACHE !== "false";

// Cache lifetime. "1h" suits bursty, low-concurrency traffic: the default 5m
// window expires between visitors, so almost every call pays the write premium
// instead of the read discount. A 1h write costs 2x the input rate against
// 1.25x for 5m, so it only wins if it converts misses into hits — which it
// does here, where a whole quiet afternoon can pass between conversations.
const CACHE_TTL = String(process.env.AGENT_CACHE_TTL || "1h").toLowerCase() === "5m" ? "5m" : "1h";
const EXTENDED_TTL_BETA = "extended-cache-ttl-2025-04-11";

// Set if the API ever rejects the extended TTL, so we degrade to 5m caching
// for the rest of the process instead of failing every call. Ada breaking is
// far worse than Ada being slightly more expensive.
let extendedTtlUnavailable = false;

const useExtendedTtl = () => CACHE_TTL === "1h" && !extendedTtlUnavailable;

function looksLikeTtlRejection(msg) {
  const s = String(msg || "").toLowerCase();
  return (
    s.includes("ttl") ||
    s.includes("extended-cache") ||
    s.includes("cache_control") ||
    s.includes("beta")
  );
}

function splitSystem(system) {
  if (system && typeof system === "object" && !Array.isArray(system)) {
    return { cacheable: String(system.cacheable || ""), dynamic: String(system.dynamic || "") };
  }
  return { cacheable: "", dynamic: String(system || "") };
}

// Flat string for providers that cache automatically (OpenAI) or not at all.
function flattenSystem(system) {
  const { cacheable, dynamic } = splitSystem(system);
  return [cacheable, dynamic].filter(Boolean).join("\n\n");
}

function anthropicSystem(system, { extendedTtl = false } = {}) {
  const { cacheable, dynamic } = splitSystem(system);
  if (!cacheable) return dynamic;
  if (!CACHE_ENABLED) return flattenSystem(system);
  const cacheControl = extendedTtl
    ? { type: "ephemeral", ttl: "1h" }
    : { type: "ephemeral" };
  const blocks = [{ type: "text", text: cacheable, cache_control: cacheControl }];
  if (dynamic) blocks.push({ type: "text", text: dynamic });
  return blocks;
}

/* ------------------------- Anthropic ------------------------- */
async function anthropicCreate({ system, messages, tools, maxTokens }, opts = {}) {
  const extendedTtl = opts.extendedTtl ?? useExtendedTtl();
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
        // Harmless once the feature is GA; required while it isn't.
        ...(extendedTtl ? { "anthropic-beta": EXTENDED_TTL_BETA } : {}),
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: Math.min(maxTokens || DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS),
        system: anthropicSystem(system, { extendedTtl }),
        messages,
        ...(tools && tools.length ? { tools } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Anthropic API ${res.status}`;
      // If the extended TTL is what it objected to, fall back to the standard
      // 5m cache and remember not to ask again. A pricing optimisation must
      // never be able to take the agent down.
      if (extendedTtl && res.status === 400 && looksLikeTtlRejection(msg)) {
        extendedTtlUnavailable = true;
        console.warn(
          `[aiClient] 1h prompt cache rejected (${msg}) — falling back to the 5m cache.`,
        );
        clearTimeout(timer);
        return anthropicCreate({ system, messages, tools, maxTokens }, { extendedTtl: false });
      }
      throw new Error(msg);
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
      model: data.model || DEFAULT_MODEL,
      usage: normalizeUsage(data.usage),
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
  // OpenAI caches long prefixes automatically, so the split form just gets
  // flattened back into one system message.
  const out = [{ role: "system", content: flattenSystem(system) }];

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
    model: res.model || DEFAULT_MODEL,
    usage: normalizeUsage(res.usage),
  };
}

/**
 * One model round-trip. `messages` uses Anthropic-style content blocks
 * (strings are also accepted). Returns the normalized shape above.
 *
 * `meta` ({ feature, user, sessionId, ip }) is what gets the call onto the
 * admin AI-usage dashboard. This is the single choke point for every direct
 * model call the website makes, so metering lives here rather than in each
 * caller — a new agent feature is metered the moment it calls createMessage().
 */
export async function createMessage({ system, messages, tools, maxTokens, meta }) {
  const started = Date.now();
  try {
    const out =
      PROVIDER === "openai"
        ? await openaiCreate({ system, messages, tools, maxTokens })
        : await anthropicCreate({ system, messages, tools, maxTokens });

    recordAiUsage({
      feature: meta?.feature || "ada-chat",
      user: meta?.user || null,
      provider: PROVIDER,
      model: out.model || DEFAULT_MODEL,
      usage: out.usage || undefined,
      tokenSource: out.usage ? "reported" : "none",
      ms: Date.now() - started,
      ok: true,
      sessionId: meta?.sessionId,
      ip: meta?.ip,
      product: meta?.product,
    });

    return out;
  } catch (err) {
    // Failed calls still cost input tokens on most providers and, more
    // usefully, a spike of them is the signal that something is wrong.
    recordAiUsage({
      feature: meta?.feature || "ada-chat",
      user: meta?.user || null,
      provider: PROVIDER,
      model: DEFAULT_MODEL,
      ms: Date.now() - started,
      ok: false,
      errorCode: String(err?.message || "error").slice(0, 120),
      sessionId: meta?.sessionId,
      ip: meta?.ip,
      product: meta?.product,
    });
    throw err;
  }
}

export function supportsTools() {
  return true; // both providers support tools now
}
