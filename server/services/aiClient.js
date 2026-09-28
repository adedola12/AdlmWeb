// server/services/aiClient.js
// Provider-agnostic chat transport for the ADLM AI Agent.
//
//   AGENT_PROVIDER=bedrock (default)   → Claude on Amazon Bedrock (IAM auth).
//   AGENT_PROVIDER=anthropic           → Claude via REST, with an API key.
//   AGENT_PROVIDER=openai              → OpenAI SDK (function-calling).
//
// ALL THREE support tools, so the full agent (Buy/Sign-up buttons + lead
// capture) works whichever is active. The canonical message/tool format used
// across the agent loop is Anthropic-style content blocks; the OpenAI adapter
// translates that to/from OpenAI's chat format on each call, so salesAgent.js
// never needs to know which provider is active.
//
// WHY BEDROCK IS THE DEFAULT: the direct Anthropic endpoint authenticates with
// an API key drawn against a prepaid credit balance, and both of those are
// single points of failure that have already taken Ada down — every message
// for hours, with the provider answering "your credit balance is too low".
// Bedrock authenticates with the function's own IAM role and bills to AWS, so
// there is no key to revoke, rotate or leak and no separate balance to drain.
//
// The agent loop (services/salesAgent.js) owns the tools and the multi-turn
// tool-result exchange; this module only normalizes one model round-trip into:
//   { text, toolUses:[{id,name,input}], assistantContent, stopReason }
// where `assistantContent` is the assistant turn (canonical blocks) to echo back.

import fetch from "node-fetch";
import OpenAI from "openai";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { recordAiUsage, normalizeUsage } from "./aiUsage.js";

const PROVIDER = (process.env.AGENT_PROVIDER || "bedrock").toLowerCase();
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// The whole budget for ONE createMessage() call, retries included: every
// attempt's abort timer is cut to whatever is left of it. Retrying therefore
// never makes a single round-trip slower than it could already be before
// retries existed. The ceilings above this are the Lambda timeout and the
// CloudFront origin read timeout, both 60s (infra/config.ts).
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 30000);

/* ------------------------- transient-error retry ------------------------- */
// A Bedrock 503 ("Bedrock is unable to process your request") or a throttle
// is usually gone a second later, but without a retry it reaches the visitor
// as "Sorry, I hit a snag". So a failed round-trip is retried when, and only
// when, the error says the provider was briefly unable rather than that the
// request was wrong:
//
//   - at most AGENT_MAX_RETRIES retries (default 2, so 3 attempts in all);
//   - exponential backoff with jitter: 500ms, then 1s, each scaled into
//     50-100% so two containers that failed together do not retry together;
//   - never past the TIMEOUT_MS budget: a retry only starts if, after its
//     backoff, at least MIN_ATTEMPT_MS of the budget is left for it;
//   - never a 4xx other than 429/408: a validation, auth or billing refusal
//     fails identically the second time and only doubles the wait.
//
// Nothing here streams: each provider call returns the whole response or
// throws, and the agent loop only runs tools AFTER a round-trip succeeds. So a
// retry can never repeat output the visitor has already seen, nor re-run a
// save_lead.
//
// The Bedrock SDK's own retry is switched OFF (maxAttempts: 1, below) so this
// is the only policy. Left at its default of 3 attempts, it retried with a
// 100ms base (too short to outlast a Bedrock 503 blip), knew nothing of this
// budget, and would have stacked under this loop into 9 attempts. It also
// never covered the direct Anthropic path, which had no retry at all. OpenAI's
// SDK keeps its own retries, so this loop does not wrap that provider.
const MAX_RETRIES = Math.max(0, Math.min(3, Number(process.env.AGENT_MAX_RETRIES ?? 2) || 0));
const RETRY_BASE_MS = 500;
const RETRY_MAX_DELAY_MS = 4000;
const MIN_ATTEMPT_MS = 5000;

const TRANSIENT_NAMES = new Set([
  "ThrottlingException",
  "TooManyRequestsException",
  "ServiceUnavailableException",
  "ServiceUnavailable",
  "InternalServerException",
  "InternalServerError",
  "InternalFailure",
  "ModelNotReadyException",
  "overloaded_error",
  "api_error",
  "rate_limit_error",
]);

const TRANSIENT_NET_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * Is this failure worth one more try? Exported for tests.
 *
 * Reads structure, not wording: the provider adapters below attach `status`
 * and `type` (and the SDK error as `cause`) to what they throw. Our own
 * timeout (AbortError) is deliberately NOT transient: by the time it fires the
 * budget is spent, and the model may already have billed the call.
 */
export function isTransientModelError(err) {
  for (let e = err, depth = 0; e && depth < 3; e = e.cause, depth++) {
    if (e.name === "AbortError" || e.name === "TimeoutError") return false;
    const status = Number(e.status ?? e.statusCode ?? e.$metadata?.httpStatusCode);
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
    if (status === 408 || status === 429 || status >= 500) return true;
    if (e.$retryable) return true;
    if (TRANSIENT_NAMES.has(e.name) || TRANSIENT_NAMES.has(e.code) || TRANSIENT_NAMES.has(e.type)) return true;
    if (TRANSIENT_NET_CODES.has(e.code) || TRANSIENT_NET_CODES.has(e.errno)) return true;
    if (/socket hang up/i.test(String(e.message || ""))) return true;
  }
  return false;
}

// Test seams. Production never touches these; tests swap in a fake Bedrock
// client, a meter that counts instead of writing to Mongo, and a sleep that
// does not actually wait.
let meterFn = recordAiUsage;
let sleepFn = (ms) => new Promise((r) => setTimeout(r, ms));
let randomFn = Math.random;

/** Backoff before retry number `n` (1-based): exponential, 50-100% jitter. */
export function retryDelayMs(n, random = randomFn) {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_MS * 2 ** (n - 1));
  return Math.round(ceiling * (0.5 + 0.5 * random()));
}

// Bedrock pins the Messages API contract in the body rather than a header.
const BEDROCK_ANTHROPIC_VERSION = "bedrock-2023-05-31";

// Lambda sets AWS_REGION for us; the literal is only for local runs.
const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || "eu-west-1";

// A cross-region inference profile, not a bare foundation-model id — the newer
// Claude models are only on-demand invocable through one. The `eu.` prefix is
// tied to the EU regions: deploying outside them means changing this to the
// matching prefix (`us.`, `apac.`) via BEDROCK_MODEL_ID, and the model has to
// be enabled for the account in the Bedrock console first either way.
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

// Bedrock is keyed on BEDROCK_MODEL_ID and ignores AGENT_MODEL entirely: the
// two id formats are not interchangeable, and AGENT_MODEL is already set to a
// direct-API id in every environment carried over from the API-key era.
// Letting it win here would only mislabel the usage rows, since the call
// itself always goes to BEDROCK_MODEL_ID.
const DEFAULT_MODEL =
  PROVIDER === "bedrock"
    ? BEDROCK_MODEL_ID
    : process.env.AGENT_MODEL ||
      (PROVIDER === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

// Output-token default per model round-trip, for a caller that does not say.
// Not a ceiling: an explicit ask is honoured up to HARD_MAX_TOKENS below.
const DEFAULT_MAX_TOKENS = Number(process.env.AGENT_MAX_TOKENS || 700);

/**
 * The most any single call may ask for.
 *
 * DEFAULT_MAX_TOKENS is what a caller gets when it does not say — it exists to
 * keep Ada's chat replies short and cheap. It was also being used as a CEILING
 * via Math.min(asked, DEFAULT), which meant a caller asking for more was
 * silently given 700 instead. Nothing errored; the reply just stopped
 * mid-sentence. Every one of the thirty-two generated quizzes came back
 * truncated because of it.
 *
 * So: unspecified still gets the small default, an explicit ask is honoured,
 * and this is the real ceiling.
 */
const HARD_MAX_TOKENS = Number(process.env.AGENT_HARD_MAX_TOKENS || 8192);

const capTokens = (asked) =>
  Math.min(Number(asked) || DEFAULT_MAX_TOKENS, HARD_MAX_TOKENS);

let _openai = null;
function openai() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * Can the selected provider be called at all? Credentials only — this asks
 * nothing about whether any particular FEATURE is switched on.
 *
 * Separate from agentEnabled() because Ada is not the only caller: HelpBot has
 * its own master switch, and hanging its availability off Ada's would mean
 * turning the chat widget off silently took the help search's answers with it.
 */
export function providerConfigured() {
  if (PROVIDER === "openai") return !!process.env.OPENAI_API_KEY;
  // Bedrock authenticates with the function's IAM role. There is deliberately
  // no key to check here — removing that check is the point of the move, not
  // an omission. A missing role shows up as an AccessDenied on the first call
  // rather than as a silently disabled agent.
  if (PROVIDER === "bedrock") return true;
  return !!process.env.ANTHROPIC_API_KEY;
}

export function agentEnabled() {
  if (process.env.AGENT_ENABLED !== "true") return false;
  return providerConfigured();
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
async function anthropicCreate({ system, messages, tools, maxTokens, temperature }, opts = {}) {
  const extendedTtl = opts.extendedTtl ?? useExtendedTtl();
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
        max_tokens: capTokens(maxTokens),
        system: anthropicSystem(system, { extendedTtl }),
        messages,
        ...(tools && tools.length ? { tools } : {}),
        ...(temperature != null ? { temperature } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Anthropic API ${res.status}`;
      // A pricing optimisation must never be able to take the agent down, so
      // ANY 400 raised while the beta header is on earns one retry without it.
      // This used to require the message to mention a TTL, which made the
      // safety net only as good as our guess at Anthropic's wording — reword
      // the rejection and the retry never fires, so the fallback is missing
      // exactly when it is needed. Retrying blind costs one cheap round-trip
      // when the header was innocent, and the real error still surfaces from
      // the second attempt.
      //
      // Only a TTL-shaped complaint disables the header for the rest of the
      // process. An unrelated 400 must not quietly downgrade every later call
      // to the pricier 5m cache.
      if (extendedTtl && res.status === 400) {
        if (looksLikeTtlRejection(msg)) {
          extendedTtlUnavailable = true;
          console.warn(
            `[aiClient] 1h prompt cache rejected (${msg}) — falling back to the 5m cache.`,
          );
        } else {
          console.warn(
            `[aiClient] 400 while the 1h cache header was set (${msg}) — retrying once without it.`,
          );
        }
        clearTimeout(timer);
        return anthropicCreate(
          { system, messages, tools, maxTokens, temperature },
          { extendedTtl: false, timeoutMs },
        );
      }
      // Status and error type ride along so the retry policy can tell an
      // overloaded 529 from a malformed 400 without parsing the wording.
      const e = new Error(msg);
      e.status = res.status;
      if (data?.error?.type) e.type = data.error.type;
      throw e;
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

/* ------------------------- Bedrock ------------------------- */
// Claude on Amazon Bedrock speaks the same Messages API as Anthropic's own
// endpoint, so the request body, the tool definitions and the response content
// blocks are all identical and the agent loop above needs no adapter. Three
// things differ, and all three are handled here:
//
//   1. the model is the InvokeModel target, not a `model` body field;
//   2. `anthropic_version` is required IN THE BODY, pinned to a Bedrock-
//      specific string that is not the date used on the direct API;
//   3. there is no anthropic-beta header, so the 1h cache TTL cannot be asked
//      for at all — Bedrock offers the standard ephemeral cache and nothing
//      longer. Asking anyway would be a hard validation error, so the
//      extendedTtl machinery above is simply not reachable from this path.

let _bedrock = null;
function bedrock() {
  // maxAttempts: 1 — retries belong to createMessage(); see the note on
  // MAX_RETRIES for why the SDK's own are switched off.
  if (!_bedrock) _bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION, maxAttempts: 1 });
  return _bedrock;
}

// Set if Bedrock ever objects to the cache_control blocks, so we degrade to an
// uncached prompt for the rest of the process instead of failing every call.
// Same principle as the extended-TTL fallback: a cost optimisation must never
// be the reason the agent is down. Prompt-cache support varies by model, and
// BEDROCK_MODEL_ID is deliberately easy to change.
let bedrockCacheUnavailable = false;

function looksLikeCacheRejection(msg) {
  const s = String(msg || "").toLowerCase();
  return s.includes("cache") || s.includes("cachepoint");
}

/**
 * The InvokeModel request body. Exported for tests: the shape is the whole
 * contract with Bedrock, and every way of getting it wrong fails identically
 * from outside — a ValidationException and an agent that answers nothing.
 * Notably it must carry `anthropic_version` and must NOT carry `model`, which
 * is the opposite of the direct API on both counts.
 */
export function bedrockRequestBody({
  system,
  messages,
  tools,
  maxTokens,
  temperature,
  useCache = true,
}) {
  return {
    anthropic_version: BEDROCK_ANTHROPIC_VERSION,
    max_tokens: capTokens(maxTokens),
    // Never the extended TTL on this path — see the note above.
    system: useCache
      ? anthropicSystem(system, { extendedTtl: false })
      : flattenSystem(system),
    messages,
    ...(tools && tools.length ? { tools } : {}),
    // Omitted unless asked for, so each provider keeps its own default.
    ...(temperature != null ? { temperature } : {}),
  };
}

async function bedrockCreate({ system, messages, tools, maxTokens, temperature }, opts = {}) {
  const useCache = opts.useCache ?? (CACHE_ENABLED && !bedrockCacheUnavailable);
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const body = bedrockRequestBody({ system, messages, tools, maxTokens, temperature, useCache });

    let res;
    try {
      res = await bedrock().send(
        new InvokeModelCommand({
          modelId: BEDROCK_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(body),
        }),
        { abortSignal: ctrl.signal },
      );
    } catch (err) {
      const msg = String(err?.message || err);
      if (useCache && looksLikeCacheRejection(msg)) {
        bedrockCacheUnavailable = true;
        console.warn(
          `[aiClient] Bedrock rejected prompt caching (${msg}) — retrying without it.`,
        );
        clearTimeout(timer);
        return bedrockCreate(
          { system, messages, tools, maxTokens, temperature },
          { useCache: false, timeoutMs },
        );
      }
      // Keep the SDK's error NAME in the message. It is the difference between
      // "the role cannot invoke this model" (AccessDeniedException) and "this
      // model id does not exist in this region" (ValidationException), and the
      // health endpoint classifies on this text. The SDK error itself rides
      // along as `cause`, which is what the retry policy reads.
      const e = new Error(`Bedrock ${err?.name || "error"}: ${msg}`, { cause: err });
      e.status = err?.$metadata?.httpStatusCode;
      throw e;
    }

    const data = JSON.parse(new TextDecoder().decode(res.body));
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
      // Bedrock does not echo the model, and the id it was invoked with is
      // what the cost table needs to match on anyway.
      model: BEDROCK_MODEL_ID,
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

async function openaiCreate({ system, messages, tools, maxTokens, temperature }) {
  const res = await openai().chat.completions.create({
    model: DEFAULT_MODEL,
    // Same two tiers as the Anthropic and Bedrock paths. This used to be
    // `maxTokens || 700`, which had no ceiling at all: switching the provider
    // to OpenAI quietly removed the spend bound on a public endpoint.
    max_tokens: capTokens(maxTokens),
    // 0.3 was this path's existing default and stays the default; a caller
    // that asks for something more deterministic now gets it.
    temperature: temperature ?? 0.3,
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
export async function createMessage({ system, messages, tools, maxTokens, temperature, meta }) {
  const args = { system, messages, tools, maxTokens, temperature };
  const started = Date.now();
  const deadline = started + TIMEOUT_MS;
  const maxRetries = PROVIDER === "openai" ? 0 : MAX_RETRIES;

  for (let attempt = 1; ; attempt++) {
    const timeoutMs = Math.max(1, deadline - Date.now());
    try {
      const out =
        PROVIDER === "openai"
          ? await openaiCreate(args)
          : PROVIDER === "bedrock"
            ? await bedrockCreate(args, { timeoutMs })
            : await anthropicCreate(args, { timeoutMs });

      // Metered once, for the attempt that succeeded: that is the call the
      // provider billed tokens for. Attempts that failed before it are not
      // rows of their own. A 503 or a throttle is refused before inference,
      // so there is nothing to bill, and counting them would make one visitor
      // message look like three calls on the dashboard.
      meterFn({
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
      const delay = retryDelayMs(attempt);
      const leftAfterWait = deadline - Date.now() - delay;
      if (attempt <= maxRetries && leftAfterWait >= MIN_ATTEMPT_MS && isTransientModelError(err)) {
        console.warn(
          `[aiClient] transient model error on attempt ${attempt} (${String(err?.message || err).slice(0, 160)}) - retrying in ${delay}ms.`,
        );
        await sleepFn(delay);
        continue;
      }

      // One failure row per call that finally failed, as before retries
      // existed: a spike of them is the signal that something is wrong.
      meterFn({
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
}

/**
 * Tests only: swap in a fake Bedrock client, a counting meter, and a sleep
 * that does not wait. Call with no argument to restore the real ones.
 */
export function __setAiClientTestHooks({ bedrockClient, meter, sleep, random } = {}) {
  _bedrock = bedrockClient ?? null;
  meterFn = meter ?? recordAiUsage;
  sleepFn = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  randomFn = random ?? Math.random;
}

export function supportsTools() {
  return true; // all three providers support tools
}
