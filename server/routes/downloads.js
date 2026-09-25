// Downloads served from ADLM's own storage (R15). See util/downloadLinks.js
// for the order: our stored file first, the Admin setting as the fail-safe.
//
//   GET /downloads/android            public (the app signs in by itself); 302
//   GET /me/downloads/installer-hub   signed in; { url, fileName, source }
//
// The Installer Hub answer is JSON rather than a redirect because the site
// calls it with a bearer token, which a plain link cannot carry.

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Setting } from "../models/Setting.js";
import { resolveDownload } from "../util/downloadLinks.js";

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

meDownloads.get("/installer-hub", requireAuth, async (_req, res, next) => {
  try {
    const r = await resolveDownload("installer-hub", { settings: await settingsNow() });
    if (!r.url) return res.status(404).json({ error: "The Installer Hub is not available for download yet." });
    res.set("Cache-Control", "no-store");
    res.json(r);
  } catch (err) {
    next(err);
  }
});
