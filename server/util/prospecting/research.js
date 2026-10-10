// server/util/prospecting/research.js
//
// Asks Claude, with the server-side web search tool, for real firms that
// match one ideal customer profile, and turns the answer into candidate
// prospects with the URLs they came from.
//
// Calls the Anthropic API directly rather than going through aiClient's
// AGENT_PROVIDER (Bedrock for Ada): web search is an Anthropic server tool.
// Metered through the same recordAiUsage as every other model call, under the
// "prospect-research" feature, always billed to the Anthropic account.
//
// Hallucination guard: a candidate's sources are kept only if the URL was
// actually returned by a search in this conversation. A firm with no verified
// source is dropped, never stored (NDPA: we must be able to say where every
// prospect came from).
//
// PROSPECT_FINDER_MODE=sample reads a recorded response from
// fixtures/research.sample.json instead of calling the API, so the whole
// pipeline can run with no key and no spend.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordAiUsage, normalizeUsage } from "../../services/aiUsage.js";
import { estimateCostUsd } from "../../config/aiPricing.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Server-side refusal fallback: if a safety classifier declines the request,
// the API retries it on the model Anthropic recommends for that category.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// USD per search, on top of tokens (Anthropic list price, $10 per 1,000).
export const WEB_SEARCH_USD = 0.01;
// The server-side search loop pauses after 10 iterations; each resume is a
// new billed round-trip, so cap how many we allow.
const MAX_RESUMES = 3;

export const researchModel = () => process.env.PROSPECT_RESEARCH_MODEL || "claude-opus-5";
const maxSearches = () => {
  const n = Number(process.env.PROSPECT_MAX_SEARCHES || 8);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 8;
};
const timeoutMs = () => Number(process.env.PROSPECT_RESEARCH_TIMEOUT_MS || 240000);

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "research.sample.json");

/* ───────────────────────────── the prompt ───────────────────────────── */

const SYSTEM = `You research companies for ADLM Studio, a Nigerian company that makes quantity surveying and BIM software (QUIV, HERON, MEP, RateGen) for the Nigerian and African construction industry.

You will be given one customer profile. Use web search to find real, currently operating organisations that match it. Rules:
- Only include an organisation you found in search results during this task. Never add one from memory.
- Each must have its own website on its own domain. Skip any that only have a social media page or a directory listing.
- Stay inside the profile's locations and organisation types. Respect every exclusion.
- Skip every domain in the "already known" list.
- "whatTheyDo" is one or two plain sentences, from what their own site or reliable sources say.
- "recentProjects" lists up to three specific recent projects or activities you actually read about, each one short. Leave it empty rather than guess.
- "sourceUrls" lists the exact URLs from your search results that support the entry. At least one.
- Fewer good entries are better than padding the list.

Finish with the result only, as JSON inside <companies></companies> tags:
<companies>[{"companyName": "", "website": "", "location": "", "whatTheyDo": "", "recentProjects": [], "sourceUrls": []}]</companies>`;

export function buildResearchRequest({ profile, want, knownDomains = [] }) {
  const lines = [
    `Profile: ${profile.segment}`,
    `Locations: ${(profile.locations || []).join(", ") || "Nigeria"}`,
    `Organisation types: ${(profile.companyTypes || []).join(", ")}`,
    `Useful search terms: ${(profile.keywords || []).join(", ")}`,
    `Exclude: ${(profile.exclusions || []).join(", ") || "none"}`,
    profile.notes ? `Context: ${profile.notes}` : "",
    `Find up to ${want} organisations.`,
    `Already known, skip these domains: ${knownDomains.length ? knownDomains.join(", ") : "none yet"}`,
  ].filter(Boolean);

  return {
    model: researchModel(),
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    fallbacks: "default",
    system: SYSTEM,
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: maxSearches(),
        user_location: { type: "approximate", country: "NG", timezone: "Africa/Lagos" },
      },
    ],
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

/* ───────────────────────────── parsing ───────────────────────────── */

/** Comparable form of a URL: no fragment, no trailing slash. */
export function urlKey(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = "";
    return x.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Every URL the search tool returned in this conversation, with its title.
 * Walks all non-text blocks (search results, and whatever the dynamic
 * filtering step hands back) plus the citations on text blocks, rather than
 * assuming one block shape.
 */
export function collectSearchedUrls(blocks) {
  const found = new Map();
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.url === "string") {
      const k = urlKey(v.url);
      if (k && !found.has(k)) found.set(k, { url: v.url, title: String(v.title || "").slice(0, 300) });
    }
    for (const [key, child] of Object.entries(v)) if (key !== "text") walk(child);
  };
  for (const b of blocks || []) {
    if (b?.type === "text") walk(b.citations);
    else walk(b);
  }
  return found;
}

/** The JSON inside the LAST <companies> tag of the final text. */
export function extractCompaniesJson(blocks) {
  const text = (blocks || []).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  const all = [...text.matchAll(/<companies>([\s\S]*?)<\/companies>/g)];
  if (!all.length) throw new Error("Research answer had no <companies> block.");
  const parsed = JSON.parse(all[all.length - 1][1].trim());
  if (!Array.isArray(parsed)) throw new Error("<companies> did not hold a JSON array.");
  return parsed;
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * Candidates ready for store.addProspects, each with only verified sources.
 * Entries whose every source is unverified come back in `dropped`.
 */
export function parseResearch(blocks) {
  const searched = collectSearchedUrls(blocks);
  const candidates = [];
  const dropped = [];

  for (const raw of extractCompaniesJson(blocks)) {
    const companyName = str(raw?.companyName, 200);
    const website = str(raw?.website, 500);
    const sources = [];
    const seen = new Set();
    for (const u of Array.isArray(raw?.sourceUrls) ? raw.sourceUrls : []) {
      const k = urlKey(u);
      if (!k || seen.has(k) || !searched.has(k)) continue;
      seen.add(k);
      sources.push({ url: searched.get(k).url, title: searched.get(k).title, retrievedAt: new Date() });
    }
    if (!companyName || !website) { dropped.push({ companyName, website, reason: "missing_name_or_site" }); continue; }
    if (!sources.length) { dropped.push({ companyName, website, reason: "no_verified_source" }); continue; }

    candidates.push({
      companyName,
      website,
      location: str(raw?.location, 200),
      whatTheyDo: str(raw?.whatTheyDo, 2000),
      recentProjects: (Array.isArray(raw?.recentProjects) ? raw.recentProjects : []).map((p) => str(p, 500)).filter(Boolean).slice(0, 3),
      sources,
    });
  }
  return { candidates, dropped, searchedUrlCount: searched.size };
}

/* ───────────────────────────── the call ───────────────────────────── */

async function postOnce(body, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": String(process.env.ANTHROPIC_API_KEY || "").trim(),
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": FALLBACK_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic API ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the request to completion, resuming while the server-side search loop
 * pauses. Returns every content block from every round-trip (the search
 * results the parser verifies against can be in any of them) and the summed
 * usage.
 */
export async function runResearchCall(body, { fetchImpl = fetch } = {}) {
  const blocks = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, searches: 0 };
  let messages = body.messages;
  let model = body.model;

  for (let round = 0; round <= MAX_RESUMES; round++) {
    const data = await postOnce({ ...body, messages }, fetchImpl);
    const content = Array.isArray(data.content) ? data.content : [];
    blocks.push(...content);
    model = data.model || model;

    const u = normalizeUsage(data.usage) || {};
    usage.inputTokens += u.inputTokens || 0;
    usage.outputTokens += u.outputTokens || 0;
    usage.cacheReadTokens += u.cacheReadTokens || 0;
    usage.cacheWriteTokens += u.cacheWriteTokens || 0;
    usage.searches +=
      Number(data.usage?.server_tool_use?.web_search_requests) ||
      content.filter((b) => b?.type === "server_tool_use" && b?.name === "web_search").length;

    if (data.stop_reason === "refusal") {
      const cat = data.stop_details?.category || "unknown";
      throw new Error(`Research request was declined (refusal, category ${cat}).`);
    }
    if (data.stop_reason !== "pause_turn") return { blocks, usage, model, stopReason: data.stop_reason };
    // Resume: resend with the paused assistant turn appended, no new user message.
    messages = [...body.messages, { role: "assistant", content }];
  }
  throw new Error(`Research did not finish after ${MAX_RESUMES} resumes.`);
}

export function researchCostUsd({ model, usage }) {
  const tokens = estimateCostUsd({
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  });
  return Number((tokens + usage.searches * WEB_SEARCH_USD).toFixed(6));
}

function loadSample(profileKey) {
  const all = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const res = all.responses?.[profileKey];
  if (!res) throw new Error(`No sample research response for profile "${profileKey}".`);
  return res;
}

/**
 * Finds candidate companies for one profile.
 * @returns {{ candidates, dropped, usage, costUsd, model, mode }}
 */
export async function researchCompanies({ profile, want, knownDomains = [], mode = process.env.PROSPECT_FINDER_MODE || "live", fetchImpl = fetch }) {
  const body = buildResearchRequest({ profile, want, knownDomains });

  if (mode === "sample") {
    const res = loadSample(profile.key);
    const { candidates, dropped } = parseResearch(res.content);
    const usage = { ...normalizeUsage(res.usage), searches: Number(res.usage?.server_tool_use?.web_search_requests) || 0 };
    return { candidates, dropped, usage, costUsd: researchCostUsd({ model: res.model, usage }), model: res.model, mode };
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set; the prospect finder needs it for web search.");

  const started = Date.now();
  try {
    const { blocks, usage, model } = await runResearchCall(body, { fetchImpl });
    const costUsd = researchCostUsd({ model, usage });
    recordAiUsage({
      feature: "prospect-research",
      provider: "anthropic",
      billedTo: "anthropic",
      model,
      usage,
      costUsd,
      tokenSource: "reported",
      ms: Date.now() - started,
      ok: true,
    });
    const { candidates, dropped } = parseResearch(blocks);
    return { candidates, dropped, usage, costUsd, model, mode };
  } catch (err) {
    recordAiUsage({
      feature: "prospect-research",
      provider: "anthropic",
      billedTo: "anthropic",
      model: body.model,
      ms: Date.now() - started,
      ok: false,
      errorCode: String(err?.message || "error").slice(0, 120),
    });
    throw err;
  }
}
