// server/routes/usage.js
//
// Plugin/app usage heartbeat. Clients (QUIV, RateGen, MEP…) POST here every
// few minutes while the user has the app open; consecutive pings within
// SESSION_GAP_MS extend the current UsageSession, a longer gap starts a new
// one. This powers the admin usage summary (last seen + hours used) without
// relying on sign-in events, which only fire once per token lifetime.
import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";

const router = express.Router();

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

export default router;
