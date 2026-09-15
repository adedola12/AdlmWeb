// server/routes/usage.js
//
// Plugin/app usage heartbeat. Clients (QUIV, RateGen, MEP…) POST here every
// few minutes while the user has the app open; consecutive pings within
// SESSION_GAP_MS extend the current UsageSession, a longer gap starts a new
// one. This powers the admin usage summary (last seen + hours used) without
// relying on sign-in events, which only fire once per token lifetime.
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import {
  DiagnosticLog,
  MAX_CONTENT_BYTES,
} from "../models/DiagnosticLog.js";

const router = express.Router();

// Beta-programme log uploads: one text part named "file", at most
// MAX_CONTENT_BYTES. Memory storage — the text goes straight into the document.
// The plugin's multipart helper labels every part application/octet-stream, so
// the filter accepts that alongside text/plain and rejects the rest.
const uploadLog = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CONTENT_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime === "text/plain" || mime === "application/octet-stream") {
      return cb(null, true);
    }
    cb(new Error(`Only a text log is accepted (got: ${mime || "unknown"})`));
  },
});

const handleLogUpload = (req, res, next) =>
  uploadLog.single("file")(req, res, (err) => {
    if (!err) return next();
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? `The log must be smaller than ${Math.round(MAX_CONTENT_BYTES / 1024)} KB.`
        : err.message || "Upload rejected.";
    return res.status(400).json({ error: msg });
  });

// Logs kept per user+product. Older ones are removed as new ones arrive, on top
// of the model's time-based expiry.
const MAX_LOGS_PER_USER_PRODUCT = 30;

// Lines PerfLog writes look like "[PERF] bill.open.toIdle took 812 ms (...)" or
// the "[PERF] ==== summary" block; pull them out for the admin list view.
function extractPerfLines(text, max = 120) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.includes("[PERF]")) {
      out.push(line.slice(0, 300));
      if (out.length >= max) break;
    }
  }
  return out;
}

// A heartbeat within this window of the previous one continues the session.
// Clients ping every ~5 min, so 15 min tolerates two missed pings.
const SESSION_GAP_MS = 15 * 60 * 1000;

function userIdFrom(req) {
  const raw = req.user?._id || req.user?.id || req.user?.sub || "";
  try {
    return new mongoose.Types.ObjectId(String(raw));
  } catch {
    return null;
  }
}

router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const productKey = String(req.body?.productKey || "")
      .trim()
      .toLowerCase();
    if (!productKey) {
      return res.status(400).json({ error: "productKey required" });
    }

    const email = String(req.user?.email || "").toLowerCase();
    const appVersion = String(req.body?.appVersion || "").slice(0, 40);
    const fpVersion = Math.max(0, Number(req.body?.fpVersion) || 0);
    const deviceFingerprint = String(req.body?.deviceFingerprint || "").slice(
      0,
      64,
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_GAP_MS);

    const open = await UsageSession.findOne({
      userId,
      productKey,
      lastPingAt: { $gte: cutoff },
    }).sort({ lastPingAt: -1 });

    if (open) {
      open.lastPingAt = now;
      open.pings += 1;
      open.minutes = Math.max(
        1,
        Math.round((now.getTime() - open.startedAt.getTime()) / 60000),
      );
      if (appVersion) open.appVersion = appVersion;
      if (fpVersion) open.fpVersion = fpVersion;
      if (deviceFingerprint) open.deviceFingerprint = deviceFingerprint;
      await open.save();
    } else {
      await UsageSession.create({
        userId,
        email,
        productKey,
        appVersion,
        fpVersion,
        deviceFingerprint,
        startedAt: now,
        lastPingAt: now,
      });
    }

    // Keep the bound device's lastSeenAt live so the admin Devices view
    // reflects actual use, not just the last login. Best-effort.
    if (deviceFingerprint) {
      User.updateOne(
        { _id: userId },
        {
          $set: {
            "entitlements.$[ent].devices.$[dev].lastSeenAt": now,
          },
        },
        {
          arrayFilters: [
            { "ent.productKey": productKey },
            { "dev.fingerprint": deviceFingerprint },
          ],
        },
      ).catch(() => {});
    }

    return res.status(204).end();
  } catch (err) {
    console.error("[/usage/heartbeat] error:", err);
    // Heartbeats are fire-and-forget on the client; a 500 body is never read.
    return res.status(500).json({ error: "heartbeat failed" });
  }
});

// POST /usage/beta  { productKey, optedIn }
// Records the user's beta-programme answer on the account so the admin can see
// who is sending logs. The plugin keeps the answer locally too; this is the
// server's copy.
router.post("/beta", requireAuth, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const optedIn = req.body?.optedIn === true || req.body?.optedIn === "true";
    const productKey = String(req.body?.productKey || "")
      .trim()
      .toLowerCase()
      .slice(0, 40);

    const set = optedIn
      ? {
          "betaTester.optedIn": true,
          "betaTester.since": new Date(),
          ...(productKey ? { "betaTester.productKey": productKey } : {}),
        }
      : { "betaTester.optedIn": false, "betaTester.leftAt": new Date() };

    await User.updateOne({ _id: userId }, { $set: set });
    return res.status(204).end();
  } catch (err) {
    console.error("[/usage/beta] error:", err);
    return res.status(500).json({ error: "could not record beta status" });
  }
});

// POST /usage/logs  multipart: file=<text>, productKey, appVersion, revitTarget, reason
// A beta tester's redacted log tail. Stores it, marks the account as a beta
// tester (an upload is the strongest possible opt-in signal), and trims the
// user's older logs beyond MAX_LOGS_PER_USER_PRODUCT.
router.post("/logs", requireAuth, handleLogUpload, async (req, res) => {
  try {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: "file part required" });
    }

    const productKey = String(req.body?.productKey || "")
      .trim()
      .toLowerCase()
      .slice(0, 40);
    if (!productKey) {
      return res.status(400).json({ error: "productKey required" });
    }

    const content = req.file.buffer.toString("utf8");
    const email = String(req.user?.email || "").toLowerCase();

    const doc = await DiagnosticLog.create({
      userId,
      email,
      productKey,
      appVersion: String(req.body?.appVersion || "").slice(0, 40),
      hostTarget: String(
        req.body?.revitTarget || req.body?.hostTarget || "",
      ).slice(0, 20),
      reason: String(req.body?.reason || "").slice(0, 60),
      lineCount: content.split(/\r?\n/).length,
      sizeBytes: req.file.buffer.length,
      perfLines: extractPerfLines(content),
      content,
    });

    // Best-effort bookkeeping: never fail the upload over it.
    User.updateOne(
      { _id: userId, "betaTester.optedIn": { $ne: true } },
      {
        $set: {
          "betaTester.optedIn": true,
          "betaTester.since": new Date(),
          "betaTester.productKey": productKey,
        },
      },
    ).catch(() => {});

    DiagnosticLog.find({ userId, productKey })
      .sort({ createdAt: -1 })
      .skip(MAX_LOGS_PER_USER_PRODUCT)
      .select("_id")
      .lean()
      .then((old) =>
        old.length
          ? DiagnosticLog.deleteMany({ _id: { $in: old.map((o) => o._id) } })
          : null,
      )
      .catch(() => {});

    return res.status(201).json({ id: String(doc._id) });
  } catch (err) {
    console.error("[/usage/logs] error:", err);
    return res.status(500).json({ error: "could not store log" });
  }
});

export default router;
