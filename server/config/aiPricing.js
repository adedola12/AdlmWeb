// server/config/aiPricing.js
// Single source of truth for (a) which AI features exist, (b) what each model
// costs, and (c) which bill the spend lands on. The admin AI-Usage dashboard
// reads all three from here so a new feature or model only has to be declared
// once.
//
// WHY billing accounts matter: ADLM's QS cost-intelligence features run on the
// separate AWS AI service (Bedrock), so their spend burns the AWS credit pool.
// Ada (the sales agent) currently calls the Anthropic API directly, which is a
// different bill. Mixing the two into one "AI spend" number would make the
// credit runway meaningless, so every usage row is tagged with its account.

/* ───────────────────────────── features ───────────────────────────── */
// key          — stored on every AiUsage row and on per-feature allocations
// provider     — who actually runs the model for this feature
// guestAllowed — may an anonymous visitor reach it AT ALL?
//
// guestAllowed is the secure-by-default half of the guest policy. Guests get
// the features whose job is to SELL (Ada, HelpBot); the paid QS cost
// intelligence — which is both the product people pay for and the thing
// burning AWS credit — is signed-in only. An admin can loosen or tighten this
// per feature on the AI-usage page, but an unconfigured install already
// refuses, so the restriction can never be lost by forgetting to set it.
export const AI_FEATURES = [
  {
    key: "ada-chat",
    label: "Ada (sales agent)",
    desc: "Every model round-trip of the website chat agent, tool calls included.",
    provider: "agent",
    metered: true,
    guestAllowed: true, // this IS the conversion path — guests must have it
  },
  {
    key: "helpbot",
    label: "HelpBot fallback",
    desc: "One-shot answer when the catalogue search finds nothing.",
    provider: "openai",
    metered: true,
    guestAllowed: true,
  },
  {
    key: "ai-boq-check",
    label: "BoQ market rate check",
    desc: "Per-line verdict vs the RateGen benchmarks (AWS AI service).",
    provider: "adlm-ai-service",
    metered: true,
    guestAllowed: false, // paid capability, and AWS-credit-billed
  },
  {
    key: "ai-outliers",
    label: "BoQ error scan",
    desc: "Duplicate / unit / quantity / semantic flags (AWS AI service).",
    provider: "adlm-ai-service",
    metered: true,
    guestAllowed: false,
  },
  {
    key: "ai-rate-buildup",
    label: "Rate build-up",
    desc: "Component-level unit-rate build-up (AWS AI service).",
    provider: "adlm-ai-service",
    metered: true,
    guestAllowed: false,
  },
];

// Code-level default: is this feature open to anonymous visitors? An unknown
// key answers "no" — a feature nobody has classified is not one to hand out
// for free.
export const featureAllowsGuests = (key) =>
  AI_FEATURES.find((f) => f.key === key)?.guestAllowed === true;

export const AI_FEATURE_KEYS = AI_FEATURES.map((f) => f.key);
export const isAiFeature = (k) => AI_FEATURE_KEYS.includes(String(k));
export const featureLabel = (k) =>
  AI_FEATURES.find((f) => f.key === k)?.label || String(k || "unknown");

/* ───────────────────────── billing accounts ───────────────────────── */
export const BILLING_ACCOUNTS = {
  aws: { key: "aws", label: "AWS (Bedrock credit)", creditBacked: true },
  anthropic: { key: "anthropic", label: "Anthropic API", creditBacked: false },
  openai: { key: "openai", label: "OpenAI API", creditBacked: false },
  unknown: { key: "unknown", label: "Unattributed", creditBacked: false },
};

// Ada runs on whichever provider AGENT_PROVIDER selects. If you move it onto
// Bedrock, set AGENT_BILLING_ACCOUNT=aws and its spend joins the credit burn
// without any code change.
export function billingAccountFor(provider) {
  const p = String(provider || "").toLowerCase();
  if (p === "adlm-ai-service" || p === "bedrock" || p === "aws") return "aws";
  if (p === "anthropic")
    return String(process.env.AGENT_BILLING_ACCOUNT || "anthropic").toLowerCase();
  if (p === "openai") return "openai";
  return "unknown";
}

/* ─────────────────────────── model prices ─────────────────────────── */
// USD per 1,000,000 tokens. Bedrock's on-demand Claude prices track the
// Anthropic list price, so one table serves both. Matched longest-prefix first,
// so "claude-sonnet-4-5-20250929" resolves via the "claude-sonnet-4" entry.
const BASE_PRICES = {
  // Anthropic / Bedrock Claude
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-5": { in: 3.0, out: 15.0 },
  "claude-sonnet-4": { in: 3.0, out: 15.0 },
  "claude-opus-4": { in: 15.0, out: 75.0 },
  "claude-3-5-haiku": { in: 0.8, out: 4.0 },
  "claude-3-5-sonnet": { in: 3.0, out: 15.0 },
  "claude-3-haiku": { in: 0.25, out: 1.25 },
  "claude-3-opus": { in: 15.0, out: 75.0 },
  // OpenAI
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2.0, out: 8.0 },
};

// AI_PRICES_JSON lets ops correct a price (or add a model) without a deploy:
//   AI_PRICES_JSON={"claude-haiku-4-5":{"in":1,"out":5}}
function loadOverrides() {
  const raw = String(process.env.AI_PRICES_JSON || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[aiPricing] AI_PRICES_JSON is not valid JSON — ignoring.");
    return {};
  }
}

const PRICES = { ...BASE_PRICES, ...loadOverrides() };

// Unknown model → priced at the fallback so it never silently costs "nothing".
// A zero here would quietly under-report the credit burn, which is the one
// failure mode this whole dashboard exists to prevent.
const FALLBACK = {
  in: Number(process.env.AI_PRICE_FALLBACK_IN || 1.0),
  out: Number(process.env.AI_PRICE_FALLBACK_OUT || 5.0),
};

export function priceForModel(model) {
  const m = String(model || "").toLowerCase();
  if (!m) return { ...FALLBACK, matched: false, key: "" };
  let best = null;
  for (const [key, price] of Object.entries(PRICES)) {
    if (m.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best
    ? { in: Number(best.price.in) || 0, out: Number(best.price.out) || 0, matched: true, key: best.key }
    : { ...FALLBACK, matched: false, key: "" };
}

/**
 * Cost of one model round-trip, in USD.
 * Cache multipliers follow Anthropic's published ratios: a cache WRITE costs
 * 1.25× the input rate, a cache READ 0.1×.
 */
export function estimateCostUsd({
  model,
  inputTokens = 0,
  outputTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
} = {}) {
  const p = priceForModel(model);
  const perToken = (rate) => rate / 1_000_000;
  const cost =
    Number(inputTokens || 0) * perToken(p.in) +
    Number(outputTokens || 0) * perToken(p.out) +
    Number(cacheWriteTokens || 0) * perToken(p.in * 1.25) +
    Number(cacheReadTokens || 0) * perToken(p.in * 0.1);
  return Math.max(0, Number(cost.toFixed(6)));
}

// Rough token count when the provider doesn't report one (the AWS AI service
// currently doesn't echo usage). ~4 chars per token is the standard heuristic;
// rows built this way are tagged tokenSource="estimated" so the dashboard can
// show them as approximate rather than passing them off as measured.
export function estimateTokensFromText(text) {
  const s = typeof text === "string" ? text : JSON.stringify(text || "");
  return Math.max(0, Math.ceil(s.length / 4));
}
