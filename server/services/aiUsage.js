// server/services/aiUsage.js
// The metering layer every AI call goes through.
//
//   recordAiUsage()    — write one AiUsage row. Fire-and-forget: it must never
//                        throw into the caller, because losing a metric is
//                        always cheaper than failing a user's request.
//   checkAiAllowance() — is this user still inside their monthly allocation?
//                        Called BEFORE the model, so a blown budget costs
//                        nothing rather than being noticed after the fact.
//
// Both are cheap enough to sit on the hot path: allowance answers are cached
// for 30s per user and topped up in-process by each recorded call, so a burst
// can't overshoot the cap by more than the handful of calls in flight.

import mongoose from "mongoose";
import { AiUsage } from "../models/AiUsage.js";
import { AiAllocation } from "../models/AiAllocation.js";
import {
  estimateCostUsd,
  estimateTokensFromText,
  billingAccountFor,
  featureLabel,
  featureAllowsGuests,
} from "../config/aiPricing.js";

const ENFORCE = process.env.AI_ALLOCATION_ENFORCE !== "false"; // on by default
const CACHE_MS = 30_000;

/** First instant of the current calendar month (UTC) — the allocation window. */
export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First instant of today (UTC) — the window for limits marked window:"day". */
export function dayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** When a window next resets, said the way a person would say it. */
function resetsWhen(window) {
  return window === "day"
    ? "It resets at midnight UTC."
    : "It resets at the start of next month.";
}

/* ────────────────────────────── recording ────────────────────────────── */

/**
 * Persist one AI call. Everything is optional except `feature`; missing token
 * counts simply produce a row with tokenSource "none" so the dashboard can
 * show "N calls, tokens not reported" instead of silently reporting zero cost.
 *
 * @param {object} evt
 * @param {string} evt.feature        feature key (config/aiPricing.js)
 * @param {object} [evt.user]         lean User doc (or {_id,email,name,role})
 * @param {string} [evt.provider]     bedrock | anthropic | openai | adlm-ai-service
 * @param {string} [evt.model]
 * @param {object} [evt.usage]        {inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}
 * @param {string} [evt.tokenSource]  reported | estimated | none
 * @param {number} [evt.costUsd]      overrides the computed cost when the
 *                                    provider reports a real charge
 */
export function recordAiUsage(evt = {}) {
  try {
    const u = evt.user || null;
    const usage = evt.usage || {};
    const inputTokens = Math.max(0, Math.round(Number(usage.inputTokens) || 0));
    const outputTokens = Math.max(0, Math.round(Number(usage.outputTokens) || 0));
    const cacheReadTokens = Math.max(0, Math.round(Number(usage.cacheReadTokens) || 0));
    const cacheWriteTokens = Math.max(0, Math.round(Number(usage.cacheWriteTokens) || 0));
    const cacheWrite1hTokens = Math.min(
      cacheWriteTokens,
      Math.max(0, Math.round(Number(usage.cacheWrite1hTokens) || 0)),
    );
    const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

    const tokenSource = evt.tokenSource || (totalTokens > 0 ? "reported" : "none");
    const provider = String(evt.provider || "");
    const costUsd =
      evt.costUsd !== undefined && evt.costUsd !== null
        ? Math.max(0, Number(evt.costUsd) || 0)
        : estimateCostUsd({
            model: evt.model,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            cacheWrite1hTokens,
          });

    const doc = {
      at: evt.at || new Date(),
      userId: u?._id || evt.userId || null,
      email: String(u?.email || evt.email || "").toLowerCase(),
      name: u?.name || evt.name || "",
      role: u?.role || evt.role || (u || evt.userId ? "user" : "guest"),
      feature: String(evt.feature || "unknown"),
      product: String(evt.product || "cloud"),
      provider,
      model: String(evt.model || ""),
      billedTo: evt.billedTo || billingAccountFor(provider),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheWrite1hTokens,
      totalTokens,
      tokenSource,
      costUsd,
      ms: Math.max(0, Math.round(Number(evt.ms) || 0)),
      ok: evt.ok !== false,
      errorCode: String(evt.errorCode || ""),
      sessionId: String(evt.sessionId || "").slice(0, 80),
      ip: String(evt.ip || ""),
    };

    // Keep the in-process allowance snapshot honest for the rest of its TTL.
    bumpCached(doc);

    AiUsage.create(doc).catch((e) =>
      console.error("[aiUsage] record failed:", e?.message || e),
    );
  } catch (e) {
    console.error("[aiUsage] record threw:", e?.message || e);
  }
}

/** Pull a usage block out of whatever shape a provider hands back. */
export function normalizeUsage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const n = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
    }
    return 0;
  };
  const input = n("inputTokens", "input_tokens", "promptTokens", "prompt_tokens");
  const output = n("outputTokens", "output_tokens", "completionTokens", "completion_tokens");
  const cacheRead = n("cacheReadTokens", "cache_read_input_tokens", "cachedTokens");
  const cacheWrite = n("cacheWriteTokens", "cache_creation_input_tokens");
  // With an extended TTL, Anthropic breaks the write down by lifetime — the
  // 1h portion is billed at 2x rather than 1.25x, so it has to be tracked
  // separately or every 1h write is under-costed by 60%.
  const cc = raw.cache_creation || raw.cacheCreation || null;
  const write1h =
    Number(cc?.ephemeral_1h_input_tokens ?? raw.cacheWrite1hTokens ?? 0) || 0;
  if (!input && !output && !cacheRead && !cacheWrite) return null;
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheWrite1hTokens: write1h,
  };
}

export { estimateTokensFromText };

/* ───────────────────────────── allocations ───────────────────────────── */

let defaultCache = { at: 0, doc: null };

/** The single scope:"default" row, created on first use. Cached for 30s. */
export async function getDefaultAllocation() {
  if (defaultCache.doc && Date.now() - defaultCache.at < CACHE_MS) return defaultCache.doc;
  let doc = await AiAllocation.findOne({ scope: "default" }).lean();
  if (!doc) {
    doc = await AiAllocation.findOneAndUpdate(
      { scope: "default" },
      { $setOnInsert: { scope: "default", userId: null, enabled: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }
  defaultCache = { at: Date.now(), doc };
  return doc;
}

export function invalidateAllocationCache(userId) {
  defaultCache = { at: 0, doc: null };
  if (userId) allowCache.delete(String(userId));
  else allowCache.clear();
}

// userId (or "guest") → { at, allocation, used: { total:{}, byFeature:{} } }
const allowCache = new Map();

function emptyBucket() {
  return { calls: 0, tokens: 0, costUsd: 0 };
}

function bumpCached(doc) {
  const key = doc.userId ? String(doc.userId) : "guest";
  const snap = allowCache.get(key);
  if (!snap) return;
  const add = (b) => {
    b.calls += 1;
    b.tokens += doc.totalTokens || 0;
    b.costUsd += doc.costUsd || 0;
  };
  add(snap.used.total);
  snap.used.byFeature[doc.feature] = snap.used.byFeature[doc.feature] || emptyBucket();
  add(snap.used.byFeature[doc.feature]);

  // The daily tally needs the same treatment, or a burst inside one cache TTL
  // is invisible to a daily cap: ten prompts in thirty seconds would each read
  // the same stale "0 used today" and all be allowed.
  if (snap.usedToday) {
    add(snap.usedToday.total);
    snap.usedToday.byFeature[doc.feature] =
      snap.usedToday.byFeature[doc.feature] || emptyBucket();
    add(snap.usedToday.byFeature[doc.feature]);
  }
}

async function loadUsedThisMonth(userId) {
  return loadUsedSince(userId, monthStart());
}

async function loadUsedToday(userId) {
  return loadUsedSince(userId, dayStart());
}

async function loadUsedSince(userId, since) {
  const match = { at: { $gte: since } };
  match.userId = userId ? new mongoose.Types.ObjectId(String(userId)) : null;

  const rows = await AiUsage.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$feature",
        calls: { $sum: 1 },
        tokens: { $sum: "$totalTokens" },
        costUsd: { $sum: "$costUsd" },
      },
    },
  ]);

  const used = { total: emptyBucket(), byFeature: {} };
  for (const r of rows) {
    used.byFeature[r._id] = {
      calls: r.calls || 0,
      tokens: r.tokens || 0,
      costUsd: r.costUsd || 0,
    };
    used.total.calls += r.calls || 0;
    used.total.tokens += r.tokens || 0;
    used.total.costUsd += r.costUsd || 0;
  }
  return used;
}

// `features` is a Mongoose Map on a hydrated doc but a plain object once
// .lean() has been through it — both shapes reach here.
function featureLimitOf(allocation, feature) {
  const f = allocation?.features;
  if (!f) return null;
  return (f instanceof Map ? f.get(feature) : f[feature]) || null;
}

function limitOf(limit) {
  return {
    calls: Math.max(0, Number(limit?.calls) || 0),
    tokens: Math.max(0, Number(limit?.tokens) || 0),
    costUsd: Math.max(0, Number(limit?.costUsd) || 0),
  };
}

// 0 means unlimited, so only a positive limit can ever block.
function exceeded(used, limit) {
  const l = limitOf(limit);
  if (l.calls && used.calls >= l.calls) return { metric: "calls", used: used.calls, limit: l.calls };
  if (l.tokens && used.tokens >= l.tokens)
    return { metric: "tokens", used: used.tokens, limit: l.tokens };
  if (l.costUsd && used.costUsd >= l.costUsd)
    return { metric: "costUsd", used: used.costUsd, limit: l.costUsd };
  return null;
}

/**
 * May this caller use `feature` right now?
 * Returns { allowed, code, reason, used, limits } — `reason` is written to be
 * safe to show to the end user.
 */
export async function checkAiAllowance({ user = null, feature = "", ip = "" } = {}) {
  const ok = { allowed: true, code: "", reason: "", used: null, limits: null };
  if (!ENFORCE) return ok;

  try {
    const userId = user?._id ? String(user._id) : "";
    const cacheKey = userId || "guest";

    let snap = allowCache.get(cacheKey);
    if (!snap || Date.now() - snap.at > CACHE_MS || snap.day !== dayStart().getTime()) {
      const [def, used, usedToday] = await Promise.all([
        getDefaultAllocation(),
        loadUsedThisMonth(userId),
        loadUsedToday(userId),
      ]);
      let allocation = def;
      if (userId) {
        const own = await AiAllocation.findOne({ userId }).lean();
        if (own) allocation = own;
      }
      // `day` is stamped so a snapshot taken before midnight is not reused
      // after it — otherwise the first callers of a new day would be measured
      // against yesterday's tally for as long as the cache lived.
      snap = {
        at: Date.now(),
        day: dayStart().getTime(),
        allocation,
        def,
        hasOwn: allocation !== def,
        used,
        usedToday,
      };
      allowCache.set(cacheKey, snap);
      if (allowCache.size > 5000) {
        for (const [k, v] of allowCache) if (Date.now() - v.at > CACHE_MS) allowCache.delete(k);
      }
    }

    const { allocation, def, used, usedToday } = snap;

    // ── 1. Platform kill switch ──────────────────────────────────────────
    // Deliberately checked before the per-user allocation: "turn AI off" has
    // to mean everyone, or the users most worth stopping (the ones important
    // enough to have their own allowance) would sail straight through it.
    if (def?.enabled === false) {
      return {
        allowed: false,
        code: "AI_OFF",
        reason:
          "Our AI assistant is switched off at the moment. You can browse products or reach us on WhatsApp and we'll help right away.",
        used,
        limits: null,
      };
    }

    // ── 2. Platform kill switch for ONE feature ──────────────────────────
    const defFeature = featureLimitOf(def, feature);
    if (defFeature?.enabled === false) {
      return {
        allowed: false,
        code: "AI_FEATURE_OFF",
        reason: `${featureLabel(feature)} is switched off at the moment. Say so plainly and offer to connect them to the team.`,
        used,
        limits: null,
      };
    }

    // ── 3. This account switched off individually ────────────────────────
    if (allocation?.enabled === false) {
      return {
        allowed: false,
        code: "AI_DISABLED",
        reason: "AI features are switched off for this account.",
        used,
        limits: allocation,
      };
    }

    // ── 4. Guests ────────────────────────────────────────────────────────
    // Anonymous visitors get the features whose job is to SELL, and nothing
    // else. The paid QS cost intelligence is signed-in-only: it is the thing
    // customers pay for AND the thing burning AWS credit, so giving it away
    // to unidentified traffic would undercut the product and the budget at
    // once. Ada's tool wiring already withholds those tools from guests —
    // this is the second lock, enforced at the meter, so the guarantee holds
    // even if a future caller wires them differently.
    if (!userId) {
      const guestPolicy = featureLimitOf({ features: def?.guestFeatures }, feature);
      const allowedForGuests = guestPolicy
        ? guestPolicy.enabled !== false
        : featureAllowsGuests(feature);

      if (!allowedForGuests) {
        return {
          allowed: false,
          code: "GUEST_NOT_ALLOWED",
          reason:
            "That check works on a signed-in account's own projects, so it needs them to be logged in. Warmly explain what it does — it benchmarks every rate against ADLM's market library and flags errors in their bill — and offer a 'signup' button as the next step. This is a genuine reason to create an account, so make it sound like the opportunity it is, not a refusal.",
          used,
          limits: null,
        };
      }

      // Guests can't be metered individually, so they share one budget.
      const hit =
        exceeded(used.total, def?.guestTotal) ||
        exceeded(used.byFeature[feature] || emptyBucket(), guestPolicy);
      if (hit) {
        return {
          allowed: false,
          code: "GUEST_QUOTA_EXCEEDED",
          reason:
            "Our AI assistant has reached its limit for visitors this month. Sign in to keep using it, or reach us on WhatsApp.",
          used,
          limits: def?.guestTotal || null,
        };
      }
      return { ...ok, used };
    }

    // ── 5. Combined monthly cap ──────────────────────────────────────────
    const totalHit = exceeded(used.total, allocation?.total);
    if (totalHit) {
      return {
        allowed: false,
        code: "AI_QUOTA_EXCEEDED",
        reason: `This account has used its monthly AI allowance (${fmtMetric(totalHit)}). It resets at the start of next month.`,
        used,
        limits: allocation?.total || null,
      };
    }

    // ── 6. Per-feature cap ───────────────────────────────────────────────
    // A user's own allocation only overrides the features it actually names;
    // anything it leaves out still falls back to the platform default, so
    // adding one override doesn't silently uncap every other feature.
    const featureLimit = featureLimitOf(allocation, feature) || defFeature;

    // A daily limit is measured against today's rows, a monthly one against
    // the month's. Reading a daily cap off the monthly tally would lock a user
    // out on the 3rd and keep them out until the 1st.
    const featureWindow = featureLimit?.window === "day" ? "day" : "month";
    const featureUsed =
      featureWindow === "day"
        ? (usedToday?.byFeature?.[feature] || emptyBucket())
        : (used.byFeature[feature] || emptyBucket());

    const featHit = exceeded(featureUsed, featureLimit);
    if (featHit) {
      return {
        allowed: false,
        code: "AI_FEATURE_QUOTA_EXCEEDED",
        reason:
          `This account has used its ${featureWindow === "day" ? "daily" : "monthly"} allowance for ` +
          `${featureLabel(feature)} (${fmtMetric(featHit)}). ${resetsWhen(featureWindow)}`,
        used,
        limits: featureLimit || null,
      };
    }

    return { ...ok, used };
  } catch (e) {
    // Never let a metering fault take the feature down.
    console.error("[aiUsage] allowance check failed:", e?.message || e);
    return ok;
  }
}

function fmtMetric(hit) {
  if (hit.metric === "costUsd") return `$${hit.used.toFixed(2)} of $${hit.limit.toFixed(2)}`;
  if (hit.metric === "tokens")
    return `${hit.used.toLocaleString()} of ${hit.limit.toLocaleString()} tokens`;
  return `${hit.used.toLocaleString()} of ${hit.limit.toLocaleString()} calls`;
}
