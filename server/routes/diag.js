// server/routes/diag.js
//
// The network check behind /network-check on the website.
//
// Built for Y.S. Associates, September 2026. Their dashboard read "Failed to
// fetch" for two months while the server logged nothing at all for the
// requests that failed. The first run of this page settled half of it: a
// request carrying a short bearer token reached the API in 182 ms, so the
// network is not simply dropping signed-in traffic. The one request that
// never arrived was the real dashboard call. Nothing on our side can see a
// request that does not get here, so the remaining evidence has to come from
// inside their browser, one variable at a time.
//
// Two rules keep this honest:
//
//   * /diag/ping is public and answers with what it RECEIVED, not with what
//     it thinks. It also echoes how long the Authorization header was, so a
//     header that arrives truncated is visible rather than merely absent.
//   * /diag/report takes the body however it can get it. The first version
//     used express.text() and logged an empty body in production for every
//     real report, which is why the only evidence that day was a photograph
//     of a screen. It now reads the raw bytes, and accepts a GET fallback,
//     because a report that does not arrive is not a diagnostic.
//
// Everything is logged with a [diag] prefix and the page's reference code, so
// a report can be found in CloudWatch by the code the customer reads out.

import express from "express";
import mongoose from "mongoose";
import { ClientNetError } from "../models/ClientNetError.js";

const router = express.Router();

function sawFrom(req) {
  const h = req.headers || {};
  const auth = h.authorization || "";
  return {
    authorization: !!auth,
    // Length matters: a middlebox that truncates a long header is a different
    // fault from one that strips it, and both look like "no token" otherwise.
    authorizationLength: auth.length,
    xAdlmClient: !!h["x-adlm-client"],
    checkCookie: !!(req.cookies && req.cookies.adlm_check),
    origin: h.origin || "",
  };
}

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    at: new Date().toISOString(),
    saw: sawFrom(req),
    ua: (req.headers || {})["user-agent"] || "",
  });
});

function logReport(raw, res) {
  let ref = "";
  try {
    ref = String(JSON.parse(raw)?.ref || "");
  } catch {
    // free-form text is fine; it is logged as-is
  }
  console.log(`[diag] ref=${ref || "-"} len=${raw.length} ${raw.slice(0, 12000)}`);
  res.json({ ok: true, ref, len: raw.length });
}

// Raw bytes, any content type. express.text() matched on Content-Type and came
// back empty behind the Lambda adapter, so this takes whatever arrives.
router.post("/report", express.raw({ type: () => true, limit: "128kb" }), (req, res) => {
  const b = req.body;
  const raw = Buffer.isBuffer(b) ? b.toString("utf8") : typeof b === "string" ? b : b ? JSON.stringify(b) : "";
  logReport(raw, res);
});

// Fallback for when a POST body does not survive the trip. A GET query string
// is the one shape that always gets through.
router.get("/report", (req, res) => {
  logReport(String(req.query.data || req.query.d || ""), res);
});

/*
 * A browser reporting that one of its requests to the API never completed.
 * Sent by client/src/lib/netFailureBeacon.js as text/plain (no preflight).
 *
 * Public by necessity: the whole point is to hear from browsers whose signed-in
 * requests are failing. So everything is clipped, nothing is trusted, and each
 * warm container accepts a bounded number of reports per address per minute.
 */
const recent = new Map();
function allow(ip, now = Date.now()) {
  const hits = (recent.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 20) {
    recent.set(ip, hits);
    return false;
  }
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return true;
}

const clip = (v, n) => String(v ?? "").slice(0, n);

router.post("/client-error", express.raw({ type: () => true, limit: "8kb" }), async (req, res) => {
  if (!allow(req.ip || "-")) return res.status(204).end();
  let data = {};
  try {
    const b = req.body;
    data = JSON.parse(Buffer.isBuffer(b) ? b.toString("utf8") : String(b || "{}")) || {};
  } catch {
    return res.status(204).end();
  }
  const doc = {
    userId: mongoose.isValidObjectId(data.userId) ? data.userId : null,
    email: clip(data.email, 200).trim().toLowerCase(),
    path: clip(data.path, 200).split("?")[0],
    method: clip(data.method, 10).toUpperCase(),
    page: clip(data.page, 200).split("?")[0],
    online: typeof data.online === "boolean" ? data.online : null,
    message: clip(data.message, 200),
    ua: clip(data.ua || req.headers["user-agent"], 300),
  };
  if (!doc.path) return res.status(204).end();
  console.log(`[client-error] ${doc.method} ${doc.path} user=${doc.email || doc.userId || "-"} page=${doc.page}`);
  try {
    await ClientNetError.create(doc);
  } catch (e) {
    console.warn("[client-error] not stored:", e?.message || e);
  }
  return res.status(204).end();
});

export default router;
