// Downloads served from ADLM's own storage (R15). See util/downloadLinks.js
// for the order: our stored file first, the Admin setting as the fail-safe.
//
//   GET /downloads/android            public (the app signs in by itself); 302
//   GET /me/downloads/installer-hub   signed in AND paid (R3); { url, fileName, source }
//                                     401 signed out, 403 HUB_REQUIRES_PAID unpaid
//
// The Installer Hub answer is JSON rather than a redirect because the site
// calls it with a bearer token, which a plain link cannot carry.

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { resolveDownload } from "../util/downloadLinks.js";
import {
  canDownloadInstallerHub,
  HUB_REQUIRES_PAID,
  HUB_REQUIRES_PAID_MESSAGE,
} from "../util/installerHubAccess.js";

const settingsNow = () => Setting.findOne({ key: "global" }).select("mobileAppUrl installerHubUrl").lean();

export const publicDownloads = express.Router();

publicDownloads.get("/android", async (_req, res, next) => {
  try {
    const r = await resolveDownload("android", { settings: await settingsNow() });
    if (!r.url) return res.status(404).json({ error: "The Android app is not available for download yet." });
    res.set("Cache-Control", "no-store");
    res.redirect(302, r.url);
  } catch (err) {
    next(err);
  }
});

export const meDownloads = express.Router();

meDownloads.get("/installer-hub", requireAuth, async (req, res, next) => {
  try {
    // R3: the Hub is for paying accounts (and staff). Read from the database,
    // not the token, so a licence that lapsed or was revoked a minute ago
    // stops the download now rather than when the token expires.
    const uid = String(req.user?._id || req.user?.id || req.user?.sub || "");
    const user = uid
      ? await User.findById(uid).select("role isGod email disabled entitlements").lean()
      : null;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    res.set("Cache-Control", "no-store");
    if (!canDownloadInstallerHub(user)) {
      return res.status(403).json({ error: HUB_REQUIRES_PAID_MESSAGE, code: HUB_REQUIRES_PAID });
    }
    const r = await resolveDownload("installer-hub", { settings: await settingsNow() });
    if (!r.url) return res.status(404).json({ error: "The Installer Hub is not available for download yet." });
    res.json(r);
  } catch (err) {
    next(err);
  }
});
