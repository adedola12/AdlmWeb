// server/services/aiClient.js
// Chat transport for the ADLM AI Agent. Claude via REST, with native tool use.
//
// Single provider by design. The OpenAI function-calling adapter that used to
// live here was removed: a second provider meant a second API key on a public
// surface, a second set of pricing rows to keep accurate on the usage
// dashboard, and a translation layer between OpenAI's chat format and the
// canonical Anthropic content blocks that every caller already speaks.
//
// The intended destination is Bedrock, so model calls bill the AWS Activate
// credit instead of cash. That is a transport swap in this one file once
// Anthropic model access is actually granted on the AWS account — as of
// 2026-07-29 it is not (every Bedrock model returns "not available for this
// account"), which is why this still calls the Anthropic API directly.
//
// The agent loop (services/salesAgent.js) owns the tools and the multi-turn
// tool-result exchange; this module only normalizes one model round-trip into:
//   { text, toolUses:[{id,name,input}], assistantContent, stopReason }
// where `assistantContent` is the assistant turn (canonical blocks) to echo back.

import fetch from "node-fetch";
import { recordAiUsage, normalizeUsage } from "./aiUsage.js";

const PROVIDER = "anthropic";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 30000);

// A leftover AGENT_PROVIDER=openai in a deployed environment would previously
// have selected a provider that no longer exists here. Say so once at startup
// rather than letting the setting look honoured.
const configuredProvider = String(process.env.AGENT_PROVIDER || "").toLowerCase();
if (configuredProvider && configuredProvider !== PROVIDER) {
  console.warn(
    `[aiClient] AGENT_PROVIDER=${configuredProvider} is no longer supported — ` +
      `this build only talks to Anthropic. Ignoring it and using ${PROVIDER}.`,
  );
}

const DEFAULT_MODEL = process.env.AGENT_MODEL || "claude-haiku-4-5-20251001";

// Output-token cap per model round-trip. Bounds spend on a public key; the
// caller may pass a smaller value but never a larger one.
const DEFAULT_MAX_TOKENS = Number(process.env.AGENT_MAX_TOKENS || 700);

export function agentEnabled() {
  if (process.env.AGENT_ENABLED !== "true") return false;
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

// Flat string for when caching is switched off — the split into cacheable and
// dynamic halves only exists to place a cache_control marker.
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
    const out = await anthropicCreate({ system, messages, tools, maxTokens });

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
  return true; // native Anthropic tool use
}
