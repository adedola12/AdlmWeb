// server/routes/ai.js
//
// HTTP surface for the ADLM AI Service cost-intelligence features.
//
// WHY THIS EXISTS
// The three capabilities (BoQ market check, error scan, rate build-up) were
// only ever reachable as Anthropic tools inside Ada — nothing else on the
// platform could call them. Recorded usage showed the consequence: two calls
// from one user for boq-check, two for rate-buildup, and zero ever for
// outliers. They were built, deployed, entitled to every account, and had no
// door. This is the door, so QUIV and HERON can offer a button.
//
// These routes are a thin pass-through on purpose. Everything that matters —
// the local allowance gate, forwarding the CALLER'S own access token so the AI
// service meters the real user, and recording the spend for /admin/ai-usage —
// already lives in services/adlmAiService.js and is shared with Ada. A second
// implementation would drift, and the thing it would drift on is money.

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiServiceEnabled, callAiService } from "../services/adlmAiService.js";

const router = express.Router();
router.use(requireAuth);

// Item cap. The AI service prices per line and a whole bill can be thousands
// of rows; an accidental full-project POST is a large, slow, billable call
// that nobody meant to make. The plugin is expected to send a selection.
const MAX_ITEMS = 250;

function bearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

/** Map the service's failure codes onto honest HTTP, for a machine caller. */
function fail(res, r) {
  const status =
    r.code === "NOT_CONFIGURED" ? 503
    : r.code === "LOCAL_QUOTA" ? 429
    : r.code === "TIMEOUT" ? 504
    : r.status || 502;
  return res.status(status).json({
    error: r.reason || r.code || "AI service unavailable",
    code: r.code || "AI_ERROR",
  });
}

/** Normalise the bill rows a plugin sends into what the AI service expects. */
function readItems(req) {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];
  return raw.slice(0, MAX_ITEMS).map((i, idx) => ({
    ref: String(i?.ref ?? i?.code ?? idx),
    description: String(i?.description ?? i?.title ?? "").slice(0, 400),
    unit: String(i?.unit ?? "").slice(0, 24),
    quantity: Number(i?.quantity) || 0,
    rate: Number(i?.rate) || 0,
  }));
}

function meta(req) {
  return {
    user: req.user || null,
    ip: req.ip,
    sessionId: String(req.body?.sessionId || "").slice(0, 80),
  };
}

/**
 * GET /ai/status
 * So a plugin can hide its button rather than offer one that always fails.
 */
router.get("/status", (req, res) => {
  res.json({ enabled: aiServiceEnabled(), features: ["boq-check", "outliers", "rate-buildup"] });
});

/** POST /ai/boq-check — per-line market verdict against the RateGen library. */
router.post("/boq-check", async (req, res, next) => {
  try {
    const items = readItems(req);
    if (!items.length) return res.status(400).json({ error: "items[] is required." });

    const r = await callAiService(
      "/api/ai/boq-check",
      { items, zone: req.body?.zone || undefined },
      bearer(req),
      { feature: "ai-boq-check", meta: meta(req) },
    );
    if (!r.ok) return fail(res, r);
    res.json({ ok: true, ...(r.result || {}) });
  } catch (err) {
    next(err);
  }
});

/** POST /ai/outliers — duplicate / unit / quantity / semantic flags. */
router.post("/outliers", async (req, res, next) => {
  try {
    const items = readItems(req);
    if (!items.length) return res.status(400).json({ error: "items[] is required." });

    const r = await callAiService("/api/ai/outliers", { items }, bearer(req), {
      feature: "ai-outliers",
      meta: meta(req),
    });
    if (!r.ok) return fail(res, r);
    res.json({ ok: true, ...(r.result || {}) });
  } catch (err) {
    next(err);
  }
});

/** POST /ai/rate-buildup — component-level unit-rate build-up for one item. */
router.post("/rate-buildup", async (req, res, next) => {
  try {
    const description = String(req.body?.description || "").trim();
    if (!description) return res.status(400).json({ error: "description is required." });

    const r = await callAiService(
      "/api/ai/rate-buildup",
      {
        description: description.slice(0, 400),
        unit: req.body?.unit || undefined,
        zone: req.body?.zone || undefined,
      },
      bearer(req),
      { feature: "ai-rate-buildup", meta: meta(req) },
    );
    if (!r.ok) return fail(res, r);
    res.json({ ok: true, ...(r.result || {}) });
  } catch (err) {
    next(err);
  }
});

export default router;
