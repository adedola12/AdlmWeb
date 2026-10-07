// server/routes/projects.openIntent.js
//
// "Open in QUIV / HERON" from a web project (work board r2-open-in-quiv-heron).
//
//   POST /projects/open-intent/issue    web session    -> { url, expiresAt }
//   POST /projects/open-intent/redeem   plugin session -> the project to open
//
// The first call runs in the browser and returns an adlm:// link carrying a
// 10-minute, single-use ticket. The Installer Hub's handler (ADLMOpen.exe)
// writes it to %LOCALAPPDATA%\ADLM\open-requests\<product>.json, and QUIV or
// HERON redeems it with the plugin's own Bearer token. The plugin then opens
// the project through the route it already uses (GET /projects/revit/:id or
// /projects/planswift/:id), so no plugin-facing response changes shape.
//
// Security model: util/openIntent.js. Contract for the desktop side:
// docs/OPEN_IN_DESKTOP.md.
//
// ADDITIVE. Mounted ahead of the projects router in index.js so "open-intent"
// is never read as a :productKey. The issue call is /issue, not the bare
// path, on purpose: against an API that predates this file, a bare
// POST /projects/open-intent lands on POST /:productKey (create project), and
// a God account passes its entitlement check. /issue is a plain 404 there.
import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { OpenIntent } from "../models/OpenIntent.js";
import { isMergeContainer } from "../services/projectMerge.js";
import { recordActivity, ACT } from "../util/activityLog.js";
import { accessFilter, resolveProjectAccess } from "./projects.js";
import {
  OPEN_PRODUCTS,
  OPEN_INTENT_TTL_SECONDS,
  openProductForKey,
  isObjectIdString,
  newJti,
  signOpenIntent,
  verifyOpenIntent,
  buildOpenUrl,
} from "../util/openIntent.js";

const router = express.Router();
router.use(requireAuth);

function userIdOf(req) {
  const raw = String(req.user?._id || req.user?.id || req.user?.sub || "");
  return isObjectIdString(raw) ? raw : "";
}

// A person clicking a button does not need more than this; a script does.
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userIdOf(req) || "anon",
  message: { error: "Too many requests. Please wait a few minutes.", code: "RATE_LIMITED" },
});

// Run an entitlement middleware inline and report whether it let us through.
// It writes the 401/403 itself when it refuses.
async function passesEntitlement(productKey, req, res) {
  let passed = false;
  await requireEntitlement(productKey)(req, res, () => {
    passed = true;
  });
  return passed;
}

function fail(res, status, code, error) {
  return res.status(status).json({ error, code });
}

// Load the project the requester may read, or null. Samples are excluded:
// they have no desktop counterpart and are read-only anyway.
async function loadReadable(req, projectId, productKey) {
  const uid = new mongoose.Types.ObjectId(userIdOf(req));
  const project = await TakeoffProject.findOne(
    accessFilter(new mongoose.Types.ObjectId(projectId), uid, productKey),
  )
    .select("_id name userId productKey isSample collaborators clientProjectKey modelTitle mergeContainer")
    .lean();
  if (!project || project.isSample) return null;
  const access = await resolveProjectAccess(req, project);
  if (access.role === "none") return null;
  return { project, access };
}

// ── Issue: the web page asks for a link ──────────────────────────────────
router.post("/issue", limiter, async (req, res) => {
  try {
    const uid = userIdOf(req);
    if (!uid) return fail(res, 401, "UNAUTHORIZED", "Unauthorized");

    const projectId = String(req.body?.projectId || "").trim().toLowerCase();
    if (!isObjectIdString(projectId)) {
      return fail(res, 400, "BAD_REQUEST", "projectId is required");
    }

    // The product comes from the project, never from the caller. Only a
    // project the caller can already read is looked at, so this cannot be
    // used to learn whether someone else's project id exists.
    const uidObj = new mongoose.Types.ObjectId(uid);
    const meta = await TakeoffProject.findOne({
      _id: new mongoose.Types.ObjectId(projectId),
      productKey: { $in: Object.values(OPEN_PRODUCTS).map((p) => p.productKey) },
      $or: [{ userId: uidObj }, { "collaborators.userId": uidObj }],
    })
      .select("productKey")
      .lean();
    const product = openProductForKey(meta?.productKey);
    if (!meta || !product) {
      return fail(res, 404, "NOT_FOUND", "This project cannot be opened in a desktop product.");
    }
    const { productKey, label } = OPEN_PRODUCTS[product];
    if (!(await passesEntitlement(productKey, req, res))) return;

    const found = await loadReadable(req, projectId, productKey);
    if (!found) return fail(res, 404, "NOT_FOUND", "Project not found");
    if (isMergeContainer(found.project)) {
      return fail(
        res,
        409,
        "MERGED",
        `A combined project has no single model. Open one of its source projects in ${label}.`,
      );
    }

    const jti = newJti();
    const expiresAt = new Date(Date.now() + OPEN_INTENT_TTL_SECONDS * 1000);
    await OpenIntent.create({ jti, userId: uid, projectId, product, expiresAt });
    const ticket = signOpenIntent({ userId: uid, projectId, product, jti });

    return res.json({
      url: buildOpenUrl({ product, projectId, ticket }),
      product,
      label,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[open-intent] issue failed:", err?.message || err);
    return fail(res, 500, "SERVER_ERROR", "Could not prepare the link. Please try again.");
  }
});

// ── Redeem: the desktop product, signed in as itself ─────────────────────
router.post("/redeem", limiter, async (req, res) => {
  const note = (jti, failure) =>
    jti
      ? OpenIntent.updateOne({ jti, redeemedAt: null }, { $set: { failure } }).catch(() => {})
      : null;
  try {
    const uid = userIdOf(req);
    if (!uid) return fail(res, 401, "UNAUTHORIZED", "Unauthorized");

    const ticket = String(req.body?.ticket || "");
    const projectId = String(req.body?.projectId || "").trim().toLowerCase();
    const product = String(req.body?.product || "").trim().toLowerCase();
    if (!ticket || ticket.length > 1024 || !isObjectIdString(projectId) || !OPEN_PRODUCTS[product]) {
      return fail(res, 400, "BAD_REQUEST", "ticket, projectId and product are required");
    }

    let claims;
    try {
      claims = verifyOpenIntent(ticket);
    } catch (e) {
      if (e?.name === "TokenExpiredError") {
        return fail(res, 410, "EXPIRED", "This link has expired. Open the project from the web again.");
      }
      return fail(res, 400, "BAD_TICKET", "This link is not valid.");
    }

    // The request file said one thing, the signed ticket another: refuse.
    if (claims.pid !== projectId || claims.prd !== product) {
      return fail(res, 400, "BAD_TICKET", "This link is not valid.");
    }

    // Made for someone else. Not burned: the right person may still sign in.
    if (claims.sub !== uid) {
      note(claims.jti, "WRONG_ACCOUNT");
      return fail(
        res,
        403,
        "WRONG_ACCOUNT",
        "This link was made for a different ADLM account. Sign in as that account, or open the project from the web again.",
      );
    }

    const { productKey, label } = OPEN_PRODUCTS[product];
    if (!(await passesEntitlement(productKey, req, res))) {
      note(claims.jti, "NO_LICENCE");
      return;
    }

    // Access is checked now, not when the link was made: a collaborator
    // removed in the last ten minutes is refused.
    const found = await loadReadable(req, projectId, productKey);
    if (!found) {
      note(claims.jti, "NOT_FOUND");
      return fail(res, 404, "NOT_FOUND", "You no longer have access to this project.");
    }

    const burned = await OpenIntent.findOneAndUpdate(
      { jti: claims.jti, userId: uid, redeemedAt: null },
      { $set: { redeemedAt: new Date(), failure: "" } },
    ).lean();
    if (!burned) {
      return fail(res, 410, "USED", "This link has already been used. Open the project from the web again.");
    }

    const { project, access } = found;
    recordActivity(req, project, ACT.PROJECT_OPENED_DESKTOP, `Opened in ${label} from ADLM Cloud`, {
      product,
    });

    return res.json({
      ok: true,
      projectId: String(project._id),
      product,
      productKey,
      name: project.name || "",
      modelTitle: project.modelTitle || "",
      clientProjectKey: project.clientProjectKey || "",
      role: access.role,
    });
  } catch (err) {
    console.error("[open-intent] redeem failed:", err?.message || err);
    return fail(res, 500, "SERVER_ERROR", "Could not open the project. Please try again.");
  }
});

export default router;
