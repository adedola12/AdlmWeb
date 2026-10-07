// Report export routes — data payloads for the Project / PM / Management
// report documents rendered + PDF'd on the client (features/reports).
//
// Mounted at /reports and /api/reports in server/index.js.
//
//   GET /reports/project/:productKey/:id  → single-project progress report
//   GET /reports/pm/:productKey/:id       → schedule & earned-value report
//   GET /reports/management               → portfolio report across all
//                                           products the user owns or
//                                           collaborates on
//
// The two project reports also take an OPTIONAL ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// With it, the payload gains `period`: what moved on the job inside that
// window (services/reportPeriod.js). Without it the payload is byte-for-byte
// what it always was, so nothing that reads these today changes. A range that
// does not parse is a 400 rather than a silently unfiltered report.
//
// Access mirrors projects.pm.js: reports are cost documents end to end, so
// the per-project reports require the product entitlement, and a non-owner
// collaborator additionally needs an active RateGen subscription. The
// management report spans products and only aggregates what the requester
// may already see (money on shared projects is masked without RateGen).

import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { User } from "../models/User.js";
import { ActivityLog } from "../models/ActivityLog.js";
import {
  buildProjectReport,
  buildPmReport,
  buildManagementReport,
} from "../services/reportEngine.js";
import { parseReportRange, buildPeriodSummary } from "../services/reportPeriod.js";

const router = express.Router();
router.use(requireAuth);

function normalizeProductKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function mapEntitlementParam(req, _res, next) {
  // Keep the storage key around before requireEntitlementParam rewrites the
  // materials aliases — same convention as projects.pm.js.
  req.productKeyOriginal = normalizeProductKey(req.params.productKey);
  next();
}

function requestedProductKey(req) {
  return normalizeProductKey(req.productKeyOriginal ?? req.params.productKey);
}

function getUserObjectId(req) {
  const raw = req.user?._id || req.user?.id;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

async function userHasActiveEntitlement(userId, key) {
  if (!userId || !key) return false;
  const u = await User.findById(userId, { entitlements: 1 }).lean();
  if (!u) return false;
  const e = (u.entitlements || []).find(
    (x) => x.productKey === key && x.status === "active",
  );
  if (!e) return false;
  if (e.expiresAt && new Date(e.expiresAt).getTime() < Date.now()) return false;
  return true;
}

async function loadReportUser(req) {
  const uid = getUserObjectId(req);
  if (!uid) return null;
  return User.findById(uid, {
    firstName: 1,
    lastName: 1,
    username: 1,
    email: 1,
    firmName: 1,
  }).lean();
}

// Loads the project for a report request, enforcing the same rules as the
// PM dashboard: owner-or-collaborator to read, plus RateGen for non-owners
// (every report page carries money).
async function loadProjectForReport(req, res) {
  const productKey = requestedProductKey(req);
  const id = String(req.params.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const userId = getUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid user id" });
    return null;
  }
  const project = await TakeoffProject.findOne({
    _id: id,
    productKey,
    $or: [{ userId }, { "collaborators.userId": userId }],
  }).lean();
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return null;
  }

  const isOwner = project.userId && userId.equals(project.userId);
  if (!isOwner && !(await userHasActiveEntitlement(userId, "rategen"))) {
    res.status(403).json({
      error:
        "A RateGen subscription is required to export reports on this shared project.",
      code: "RATEGEN_REQUIRED",
    });
    return null;
  }
  return project;
}

// The requested window, or null when none was asked for. Sends the 400 itself
// and returns false when the range is unreadable, so the caller just stops.
function readRange(req, res) {
  const from = req.query?.from;
  const to = req.query?.to;
  if (!from && !to) return null;
  const range = parseReportRange(from, to);
  if (range.error) {
    res.status(400).json({ error: range.error, code: "BAD_RANGE" });
    return false;
  }
  return range;
}

// `period` for a project report. The activity rows are this project's own
// trail inside the window; capped because a report prints, it does not page.
async function periodFor(project, range) {
  const where = { projectId: project._id };
  if (range.from || range.to) where.createdAt = {};
  if (range.from) where.createdAt.$gte = range.from;
  if (range.to) where.createdAt.$lte = range.to;
  const activity = await ActivityLog.find(where, {
    createdAt: 1,
    summary: 1,
    category: 1,
    actorName: 1,
  })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  // loadProjectForReport already refused a non-owner without RateGen, so
  // anybody who reaches here may see the money.
  return {
    ...buildPeriodSummary(project, { from: range.from, to: range.to, activity }),
    fromDay: range.fromDay,
    toDay: range.toDay,
  };
}

// ── GET /reports/project/:productKey/:id ──────────────────────────────────
async function getProjectReport(req, res) {
  try {
    const range = readRange(req, res);
    if (range === false) return;
    const project = await loadProjectForReport(req, res);
    if (!project) return;
    const user = await loadReportUser(req);
    const report = buildProjectReport(project);
    if (range) report.period = await periodFor(project, range);
    report.preparedBy = {
      name:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.username ||
        "",
      firm: user?.firmName || "",
      email: user?.email || "",
    };
    res.json({ ok: true, report });
  } catch (err) {
    console.error("GET project report error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── GET /reports/pm/:productKey/:id ───────────────────────────────────────
async function getPmReport(req, res) {
  try {
    const range = readRange(req, res);
    if (range === false) return;
    const project = await loadProjectForReport(req, res);
    if (!project) return;
    const user = await loadReportUser(req);
    const report = buildPmReport(project);
    if (range) report.period = await periodFor(project, range);
    report.preparedBy = {
      name:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.username ||
        "",
      firm: user?.firmName || "",
      email: user?.email || "",
    };
    res.json({ ok: true, report });
  } catch (err) {
    console.error("GET pm report error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── GET /reports/management ───────────────────────────────────────────────
// Portfolio across every product. Heavy per-line fields are projected out —
// computePmDashboard only needs items (qty/rate/percent/status), the three
// extra cost streams, contract and projectManagement.
async function getManagementReport(req, res) {
  try {
    const userId = getUserObjectId(req);
    if (!userId) return res.status(401).json({ error: "Invalid user id" });

    const projects = await TakeoffProject.find(
      { $or: [{ userId }, { "collaborators.userId": userId }] },
      {
        materialItems: 0,
        budgetItems: 0,
        valuationEvents: 0,
        shareCodes: 0,
        models: 0,
        checklistCompositeKeys: 0,
        excludedCategories: 0,
        customCategories: 0,
        "items.elementIds": 0,
        "items.elementQuantities": 0,
      },
    )
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    const hasRateGen = await userHasActiveEntitlement(userId, "rategen");
    const entries = projects.map((project) => {
      const isOwner = project.userId && userId.equals(project.userId);
      return {
        project,
        role: isOwner ? "owner" : "collaborator",
        canSeeMoney: isOwner || hasRateGen,
      };
    });

    const user = await loadReportUser(req);
    const report = buildManagementReport(entries, { user });
    res.json({ ok: true, report });
  } catch (err) {
    console.error("GET management report error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

router.get(
  "/project/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  getProjectReport,
);
router.get(
  "/pm/:productKey/:id",
  mapEntitlementParam,
  requireEntitlementParam,
  getPmReport,
);
router.get("/management", getManagementReport);

export default router;
