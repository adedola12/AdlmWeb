// Project Management (PM) routes.
//
// Live alongside projects.js but kept in a separate file because the PM
// surface is large enough (tasks/risks/issues CRUD + dashboard + imports)
// that mixing it into the BoQ flow would obscure both. Mounted in
// server/index.js with the same /:productKey prefix as projects.js.

import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlementParam } from "../middleware/requireEntitlement.js";
import { TakeoffProject } from "../models/TakeoffProject.js";
import { computePmDashboard, rescheduleTasks, computeProjectScope, _itemIdentity } from "../services/pmCompute.js";
import { parseMsProjectFile } from "../util/msProjectParser.js";
import { generateIcs, suggestedIcsFilename } from "../util/icsExporter.js";
import { bestMatch, normalizeTaskName } from "../util/fuzzyMatch.js";
import { TaskLinkLearned } from "../models/TaskLinkLearned.js";

const PM_IMPORT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PM_IMPORT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".xml") || name.endsWith(".mpp")) return cb(null, true);
    cb(new Error("Only MS Project .xml or .mpp files are accepted."));
  },
});

const router = express.Router();
router.use(requireAuth);

function normalizeProductKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function entitlementKeyFor(productKeyOriginal) {
  const key = normalizeProductKey(productKeyOriginal);
  if (key === "revit-materials") return "revit";
  if (key === "planswift-materials") return "planswift";
  return key;
}

function mapEntitlementParam(req, _res, next) {
  const original = normalizeProductKey(req.params.productKey);
  req.productKeyOriginal = original;
  req.params.productKey = entitlementKeyFor(original);
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

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalDate(v) {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function genId(prefix = "tsk") {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

const TASK_STATUSES = new Set(["not-started", "in-progress", "completed", "blocked"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);
const RISK_STATUSES = new Set(["open", "mitigating", "closed", "accepted"]);
const ISSUE_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const ISSUE_STATUSES = new Set(["open", "in-progress", "resolved", "closed"]);
const TASK_SOURCES = new Set([
  "manual",
  "boq",
  "msproject-xml",
  "msproject-mpp",
  "csv",
]);

function sanitizeTask(input, fallback = {}) {
  if (!input || typeof input !== "object") return null;
  const taskId = String(input.taskId || fallback.taskId || genId()).trim().slice(0, 64);
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) return null;

  const status = TASK_STATUSES.has(input.status) ? input.status : "not-started";
  const priority = TASK_PRIORITIES.has(input.priority) ? input.priority : "medium";
  const source = TASK_SOURCES.has(input.source) ? input.source : "manual";

  const startDate = parseOptionalDate(input.startDate);
  const endDate = parseOptionalDate(input.endDate);
  const baselineStart = parseOptionalDate(input.baselineStart) || startDate;
  const baselineEnd = parseOptionalDate(input.baselineEnd) || endDate;

  let durationDays = safeNum(input.durationDays);
  if (!durationDays && startDate && endDate) {
    const days = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
    );
    durationDays = days;
  }

  const predecessors = Array.isArray(input.predecessors)
    ? input.predecessors
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];

  const linkedBoqIdentities = Array.isArray(input.linkedBoqIdentities)
    ? input.linkedBoqIdentities
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];
  // Parallel weights array. Each entry is 0-100; missing/invalid entries
  // default to 100 (full item). Truncated/padded to match identities
  // length so the index alignment is guaranteed downstream.
  const rawWeights = Array.isArray(input.linkedBoqWeights)
    ? input.linkedBoqWeights
    : [];
  const linkedBoqWeights = linkedBoqIdentities.map((_, i) => {
    const raw = rawWeights[i];
    const n = Number(raw);
    if (!Number.isFinite(n)) return 100;
    return Math.max(0, Math.min(100, n));
  });

  return {
    taskId,
    wbs: String(input.wbs || "").trim().slice(0, 60),
    name,
    description: String(input.description || "").slice(0, 2000),
    startDate,
    endDate,
    baselineStart,
    baselineEnd,
    durationDays,
    percentComplete: Math.max(0, Math.min(100, safeNum(input.percentComplete))),
    predecessors,
    baselineCost: Math.max(0, safeNum(input.baselineCost)),
    actualCost: Math.max(0, safeNum(input.actualCost)),
    resourceNames: String(input.resourceNames || "").trim().slice(0, 200),
    assignedTo: String(input.assignedTo || "").trim().slice(0, 120),
    status,
    priority,
    linkedBoqIdentities,
    linkedBoqWeights,
    isMilestone: Boolean(input.isMilestone),
    isSummary: Boolean(input.isSummary),
    parentTaskId: String(input.parentTaskId || "").trim().slice(0, 64),
    source,
    notes: String(input.notes || "").slice(0, 2000),
    createdAt: parseOptionalDate(input.createdAt) || fallback.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

function sanitizeRisk(input, fallback = {}) {
  if (!input || typeof input !== "object") return null;
  const title = String(input.title || "").trim().slice(0, 200);
  if (!title) return null;
  return {
    riskId: String(input.riskId || fallback.riskId || genId("rsk")).trim().slice(0, 64),
    title,
    description: String(input.description || "").slice(0, 2000),
    probability: RISK_LEVELS.has(input.probability) ? input.probability : "medium",
    impact: RISK_LEVELS.has(input.impact) ? input.impact : "medium",
    status: RISK_STATUSES.has(input.status) ? input.status : "open",
    owner: String(input.owner || "").trim().slice(0, 120),
    mitigation: String(input.mitigation || "").slice(0, 2000),
    createdAt: parseOptionalDate(input.createdAt) || fallback.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

function sanitizeIssue(input, fallback = {}) {
  if (!input || typeof input !== "object") return null;
  const title = String(input.title || "").trim().slice(0, 200);
  if (!title) return null;
  const status = ISSUE_STATUSES.has(input.status) ? input.status : "open";
  return {
    issueId: String(input.issueId || fallback.issueId || genId("iss")).trim().slice(0, 64),
    title,
    description: String(input.description || "").slice(0, 2000),
    severity: ISSUE_SEVERITIES.has(input.severity) ? input.severity : "medium",
    status,
    owner: String(input.owner || "").trim().slice(0, 120),
    openedAt:
      parseOptionalDate(input.openedAt) || fallback.openedAt || new Date(),
    resolvedAt:
      status === "resolved" || status === "closed"
        ? parseOptionalDate(input.resolvedAt) || new Date()
        : null,
    notes: String(input.notes || "").slice(0, 2000),
  };
}

async function loadProject(req, res) {
  const productKey = requestedProductKey(req);
  const id = String(req.params.id || "").trim();
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const userId = getUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid user id" });
    return null;
  }
  const project = await TakeoffProject.findOne({ _id: id, userId, productKey });
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  if (!project.projectManagement) project.projectManagement = {};
  return project;
}

function touchPm(project) {
  if (!project.projectManagement) project.projectManagement = {};
  project.projectManagement.lastEditedAt = new Date();
  project.markModified("projectManagement");
}

// ── GET dashboard ────────────────────────────────────────────────────────
async function getDashboard(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;
    const data = computePmDashboard(project);
    res.json({ ok: true, dashboard: data });
  } catch (err) {
    console.error("GET PM dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── PATCH bulk PM update (tasks/risks/issues/header) ─────────────────────
async function updatePm(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const {
      tasks,
      risks,
      issues,
      projectStart,
      projectFinish,
      baselineDate,
      budgetOverride,
      // When true (default true), changing projectStart cascades through
      // every task's predecessor chain. Pass false to update only the
      // header value while leaving task dates untouched.
      cascadeReschedule = true,
    } = req.body || {};

    // Snapshot the old start so we can tell if the header value moved.
    const previousProjectStart = project.projectManagement?.projectStart
      ? new Date(project.projectManagement.projectStart)
      : null;

    if (Array.isArray(tasks)) {
      const previousById = new Map(
        (project.projectManagement?.tasks || []).map((t) => [String(t.taskId), t]),
      );
      const next = [];
      for (const t of tasks) {
        const fallback = previousById.get(String(t?.taskId || ""));
        const sanitized = sanitizeTask(t, fallback || {});
        if (sanitized) next.push(sanitized);
        if (next.length >= 5000) break;
      }

      // ── Summary-task protection ──────────────────────────────────────
      // A summary task is one that has at least one child by WBS hierarchy.
      // If a summary row is missing from `next` while its children are
      // still present, the user is implicitly trying to delete it — that
      // would orphan the children. Re-insert the summary so its rollup
      // stays computable. Same goes for edits that try to mutate a summary
      // — restore its core fields from the previous version.
      const nextWbsSet = new Set(
        next.map((t) => String(t.wbs || "").trim()).filter(Boolean),
      );
      function hasChildrenInNextList(parentWbs) {
        if (!parentWbs) return false;
        for (const w of nextWbsSet) {
          if (w === parentWbs) continue;
          if (w.startsWith(parentWbs + ".")) return true;
        }
        return false;
      }
      const previousTasks = project.projectManagement?.tasks || [];
      for (const prev of previousTasks) {
        const wbs = String(prev?.wbs || "").trim();
        if (!wbs) continue;
        if (!hasChildrenInNextList(wbs)) continue; // not a summary anymore
        const stillPresent = next.find(
          (t) => String(t.taskId) === String(prev.taskId),
        );
        if (!stillPresent) {
          // Delete attempt on a summary — restore the row verbatim.
          const sanitized = sanitizeTask(prev, prev);
          if (sanitized) next.push(sanitized);
        }
      }

      project.projectManagement.tasks = next;

      // Bi-directional sync: a task's percentComplete propagates to its
      // linked BoQ items so partial progress flows into the valuation
      // pipeline. Rules:
      //   • For each linked item, item.percentComplete = max of
      //     percentComplete across ALL tasks linking to it. Taking the
      //     max means completing one task that includes an item is
      //     enough to credit that item — multiple linking tasks don't
      //     double-count.
      //   • When the resulting max is ≥100, also flip the binary status
      //     (completed / purchased) so existing certificates and reports
      //     treat the item as fully signed off.
      //   • Items not linked to any task are left untouched — users still
      //     control them from the BoQ tab.
      const productKey = requestedProductKey(req);
      const isMaterials = productKey.includes("materials");
      const statusField = isMaterials ? "purchased" : "completed";
      const statusDateField = isMaterials ? "purchasedAt" : "completedAt";
      const itemsArr = Array.isArray(project.items) ? project.items : [];
      const itemByIdentity = new Map();
      itemsArr.forEach((item, idx) => {
        itemByIdentity.set(_itemIdentity(item, idx), item);
      });

      // Build reverse map: identity → weighted sum of (taskPct × weight)
      // across every task linking to that identity. Capped at 100.
      //
      // Weighted propagation is the only one that's correct when a BoQ
      // line is split across multiple tasks. Example: "Windows & Doors"
      // linked to a "First fix" task at weight 70 and a "Final fix"
      // task at weight 30. First fix done (100%) + final fix at 50% →
      //   100% × 70/100 + 50% × 30/100 = 70 + 15 = 85% of the BoQ line.
      // Falls back to max() semantics when no weights are stored (legacy
      // data) — a single task at 50% propagates as 50%, not 0%.
      const maxPctByItem = new Map();
      for (const t of next) {
        const taskPct = Math.max(0, Math.min(100, safeNum(t.percentComplete)));
        const links = Array.isArray(t.linkedBoqIdentities) ? t.linkedBoqIdentities : [];
        const weights = Array.isArray(t.linkedBoqWeights) ? t.linkedBoqWeights : [];
        for (let i = 0; i < links.length; i += 1) {
          const identity = links[i];
          if (!identity) continue;
          const rawW = Number(weights[i]);
          const w = Number.isFinite(rawW) ? Math.max(0, Math.min(100, rawW)) : 100;
          const contribution = (taskPct * w) / 100; // 0-100 scale
          const prev = maxPctByItem.get(identity) || 0;
          maxPctByItem.set(identity, Math.min(100, prev + contribution));
        }
      }

      let itemsDirty = false;
      let prelimsDirty = false;
      let provisionalsDirty = false;
      let variationsDirty = false;

      for (const [identity, pct] of maxPctByItem) {
        // ── Measured items (long identity hash) ───────────────────────
        const item = itemByIdentity.get(identity);
        if (item) {
          const currentPct = Math.max(
            0,
            Math.min(100, safeNum(item.percentComplete)),
          );
          if (pct !== currentPct) {
            item.percentComplete = pct;
            item.percentCompleteUpdatedAt = new Date();
            itemsDirty = true;
          }
          if (pct >= 100 && !item[statusField]) {
            item[statusField] = true;
            item[statusDateField] = new Date();
            item.statusUpdatedAt = new Date();
            itemsDirty = true;
          }
          continue;
        }

        // ── Preliminary items (identity = "prelim::<idx>") ────────────
        // Threshold: when ANY linked task reaches 100% the prelim is
        // ticked as done. Going back below 100% does NOT un-tick (the
        // user can clear it manually from the BoQ tab) — same defensive
        // semantics as measured items above.
        const prelimMatch = /^prelim::(\d+)$/.exec(identity);
        if (prelimMatch) {
          const idx = Number(prelimMatch[1]);
          const arr = project.preliminaryItems || [];
          const entry = arr[idx];
          if (entry && pct >= 100 && !entry.completed) {
            entry.completed = true;
            entry.completedAt = new Date();
            prelimsDirty = true;
          }
          continue;
        }

        // ── Provisional sums (identity = "pc::<idx>") ─────────────────
        const pcMatch = /^pc::(\d+)$/.exec(identity);
        if (pcMatch) {
          const idx = Number(pcMatch[1]);
          const arr = project.provisionalSums || [];
          const entry = arr[idx];
          if (entry && pct >= 100 && !entry.completed) {
            entry.completed = true;
            entry.completedAt = new Date();
            provisionalsDirty = true;
          }
          continue;
        }

        // ── Variations (identity = "var::<idx>") ──────────────────────
        const varMatch = /^var::(\d+)$/.exec(identity);
        if (varMatch) {
          const idx = Number(varMatch[1]);
          const arr = project.variations || [];
          const entry = arr[idx];
          if (entry && pct >= 100 && !entry.completed) {
            entry.completed = true;
            entry.completedAt = new Date();
            variationsDirty = true;
          }
          continue;
        }

        // Unknown identity → silently skip (could be stale, could be a
        // future kind we don't handle yet).
      }

      if (itemsDirty) project.markModified("items");
      if (prelimsDirty) project.markModified("preliminaryItems");
      if (provisionalsDirty) project.markModified("provisionalSums");
      if (variationsDirty) project.markModified("variations");

      // ── Learning hook ────────────────────────────────────────────────
      // For every task that now carries linkedBoqIdentities, upsert a row
      // in TaskLinkLearned. Next time this user imports an MS Project
      // with a task of the same (normalised) name, the importer re-uses
      // these identities instead of fuzzy-matching from scratch.
      //
      // We only record when the user has explicitly saved — fuzzy-matched
      // suggestions that were never reviewed don't count.
      // (productKey was declared earlier in this block for the item-sync
      // pass, so just reuse it.)
      const userId = getUserObjectId(req);
      if (userId && productKey) {
        const ops = [];
        for (const t of next) {
          const links = Array.isArray(t.linkedBoqIdentities)
            ? t.linkedBoqIdentities.filter(Boolean)
            : [];
          if (!links.length) continue;
          const norm = normalizeTaskName(t.name || "");
          if (!norm) continue;
          ops.push(
            TaskLinkLearned.findOneAndUpdate(
              { userId, productKey, taskNameNorm: norm },
              {
                $set: {
                  linkedIdentities: links,
                  lastUsedAt: new Date(),
                },
                $inc: { hits: 1 },
                $setOnInsert: { userId, productKey, taskNameNorm: norm },
              },
              { upsert: true, new: false },
            ),
          );
          if (ops.length >= 200) break; // cap to keep save snappy
        }
        // Fire-and-forget — don't block the save on the learning writes,
        // but log failures for debugging.
        if (ops.length) {
          Promise.allSettled(ops).then((results) => {
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length) {
              console.warn(
                `TaskLinkLearned upserts: ${failed.length}/${ops.length} failed.`,
                failed[0]?.reason?.message || failed[0]?.reason,
              );
            }
          });
        }
      }
    }

    if (Array.isArray(risks)) {
      const previousById = new Map(
        (project.projectManagement?.risks || []).map((r) => [String(r.riskId), r]),
      );
      const next = [];
      for (const r of risks) {
        const fallback = previousById.get(String(r?.riskId || ""));
        const sanitized = sanitizeRisk(r, fallback || {});
        if (sanitized) next.push(sanitized);
        if (next.length >= 1000) break;
      }
      project.projectManagement.risks = next;
    }

    if (Array.isArray(issues)) {
      const previousById = new Map(
        (project.projectManagement?.issues || []).map((i) => [String(i.issueId), i]),
      );
      const next = [];
      for (const i of issues) {
        const fallback = previousById.get(String(i?.issueId || ""));
        const sanitized = sanitizeIssue(i, fallback || {});
        if (sanitized) next.push(sanitized);
        if (next.length >= 1000) break;
      }
      project.projectManagement.issues = next;
    }

    if (projectStart !== undefined) {
      project.projectManagement.projectStart = parseOptionalDate(projectStart);
    }
    if (projectFinish !== undefined) {
      project.projectManagement.projectFinish = parseOptionalDate(projectFinish);
    }
    if (baselineDate !== undefined) {
      project.projectManagement.baselineDate = parseOptionalDate(baselineDate);
    }
    if (budgetOverride !== undefined) {
      project.projectManagement.budgetOverride = Math.max(0, safeNum(budgetOverride));
    }

    // ── Cascade rescheduling ────────────────────────────────────────
    // If projectStart was provided in this request AND it moved, AND the
    // caller didn't opt out (cascadeReschedule: false), recompute every
    // task's start/end through the predecessor graph. Manual updates to
    // individual task dates in this same request are honoured first —
    // the cascade then re-runs over the resulting set.
    let rescheduleResult = null;
    if (projectStart !== undefined && cascadeReschedule) {
      const newStart = project.projectManagement.projectStart;
      const changed =
        (previousProjectStart?.getTime() || 0) !== (newStart?.getTime() || 0);
      if (newStart && changed && Array.isArray(project.projectManagement.tasks)) {
        const result = rescheduleTasks(
          project.projectManagement.tasks,
          newStart,
        );
        project.projectManagement.tasks = result.tasks;
        project.markModified("projectManagement.tasks");
        rescheduleResult = {
          changed: result.changed,
          cycles: result.cycles,
          anchored: result.anchored,
        };
      }
    }

    touchPm(project);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      dashboard: computePmDashboard(project),
      version: project.version,
      reschedule: rescheduleResult,
    });
  } catch (err) {
    console.error("PATCH PM error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── POST /pm/reschedule ─────────────────────────────────────────────────
// Explicit re-cascade trigger. Used by the "Reschedule from project start"
// button in the UI. Accepts optional { projectStart } in body to anchor at
// a specific date; otherwise uses the project's stored projectStart.
async function reschedulePm(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const requested = parseOptionalDate(req.body?.projectStart);
    const anchor =
      requested || project.projectManagement?.projectStart || null;
    if (!anchor) {
      return res.status(400).json({
        error:
          "No project start date set. Set one in the Project header first, or include projectStart in the request body.",
      });
    }

    const tasks = project.projectManagement?.tasks || [];
    if (!tasks.length) {
      return res.status(400).json({ error: "Project has no tasks to reschedule." });
    }

    if (requested) {
      project.projectManagement.projectStart = requested;
    }
    const result = rescheduleTasks(tasks, anchor);
    project.projectManagement.tasks = result.tasks;
    project.markModified("projectManagement.tasks");
    touchPm(project);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      reschedule: {
        changed: result.changed,
        cycles: result.cycles,
        anchored: result.anchored,
      },
      dashboard: computePmDashboard(project),
      version: project.version,
    });
  } catch (err) {
    console.error("POST PM reschedule error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── POST generate-from-boq ───────────────────────────────────────────────
// Creates one task per BoQ item, linked back via linkedBoqIdentities so its
// baselineCost stays in sync with the item's qty × rate. Tasks are evenly
// distributed across the project window (default: today → today + items × 3
// days) unless an explicit start/end is provided. If a task with the same
// linked identity already exists it is updated rather than duplicated.
async function generateFromBoq(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const requestedStart = parseOptionalDate(req.body?.projectStart);
    const requestedFinish = parseOptionalDate(req.body?.projectFinish);
    const daysPerItem = Math.max(1, safeNum(req.body?.daysPerItem) || 3);
    const replaceExisting = req.body?.replaceExisting === true;

    const items = Array.isArray(project.items) ? project.items : [];
    if (items.length === 0) {
      return res.status(400).json({
        error: "Project has no BoQ items to generate tasks from. Upload a takeoff first.",
      });
    }

    const existingTasks = project.projectManagement?.tasks || [];
    const byIdentity = new Map();
    for (const t of existingTasks) {
      for (const id of t.linkedBoqIdentities || []) {
        byIdentity.set(String(id), t);
      }
    }

    const start = requestedStart || project.projectManagement?.projectStart || new Date();
    const totalDays = items.length * daysPerItem;
    const finish = requestedFinish
      || (project.projectManagement?.projectFinish)
      || new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
    const spanDays = Math.max(
      items.length,
      Math.round((finish.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const perItemDays = Math.max(1, Math.floor(spanDays / items.length));

    const keptTasks = replaceExisting
      ? existingTasks.filter((t) => !(t.linkedBoqIdentities || []).length)
      : existingTasks.slice();

    const updated = [];
    items.forEach((item, idx) => {
      const identity = _itemIdentity(item, idx);
      const taskStart = new Date(start.getTime() + idx * perItemDays * 24 * 60 * 60 * 1000);
      const taskEnd = new Date(taskStart.getTime() + perItemDays * 24 * 60 * 60 * 1000);
      const existing = byIdentity.get(identity);
      const cost = safeNum(item?.qty) * safeNum(item?.rate);
      const name = String(item?.description || item?.materialName || item?.takeoffLine || `Item ${idx + 1}`).slice(0, 200);
      const isMaterials = String(project.productKey || "").includes("materials");
      const completed = Boolean(isMaterials ? item?.purchased : item?.completed);

      if (existing && !replaceExisting) {
        existing.linkedBoqIdentities = [identity];
        existing.baselineCost = cost;
        existing.name = existing.name || name;
        if (!existing.startDate) existing.startDate = taskStart;
        if (!existing.endDate) existing.endDate = taskEnd;
        if (!existing.baselineStart) existing.baselineStart = taskStart;
        if (!existing.baselineEnd) existing.baselineEnd = taskEnd;
        existing.durationDays = existing.durationDays || perItemDays;
        existing.percentComplete = completed ? 100 : existing.percentComplete || 0;
        existing.status = completed
          ? "completed"
          : existing.percentComplete > 0
            ? "in-progress"
            : "not-started";
        existing.source = existing.source || "boq";
        existing.updatedAt = new Date();
        updated.push(existing);
      } else {
        const task = sanitizeTask({
          taskId: genId("boq"),
          wbs: `${idx + 1}`,
          name,
          startDate: taskStart,
          endDate: taskEnd,
          baselineStart: taskStart,
          baselineEnd: taskEnd,
          durationDays: perItemDays,
          percentComplete: completed ? 100 : 0,
          baselineCost: cost,
          status: completed ? "completed" : "not-started",
          priority: "medium",
          linkedBoqIdentities: [identity],
          source: "boq",
        });
        if (task) updated.push(task);
      }
    });

    if (replaceExisting) {
      project.projectManagement.tasks = updated;
    } else {
      // Merge: keep existing tasks that aren't BoQ-linked, replace/insert the rest.
      const updatedIds = new Set(updated.map((t) => String(t.taskId)));
      const merged = keptTasks.filter((t) => !updatedIds.has(String(t.taskId)));
      project.projectManagement.tasks = [...merged, ...updated];
    }

    if (!project.projectManagement.projectStart) project.projectManagement.projectStart = start;
    if (!project.projectManagement.projectFinish) project.projectManagement.projectFinish = finish;
    if (!project.projectManagement.baselineDate) project.projectManagement.baselineDate = new Date();

    touchPm(project);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      generated: updated.length,
      dashboard: computePmDashboard(project),
      version: project.version,
    });
  } catch (err) {
    console.error("POST PM generate-from-boq error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── POST import (MS Project XML / MPP) ───────────────────────────────────
// Auto-link incoming tasks to existing BoQ scope. Two-pass strategy:
//   1. Per-user learning lookup: if this user has previously confirmed a
//      mapping for an identical task-name (normalised), reuse it.
//   2. Otherwise, fuzzy-match against the full scope catalogue (measured,
//      preliminaries, PC sums, variations). Best match above the
//      threshold is auto-linked. Below threshold → task imports unlinked,
//      user can link manually in the modal.
//
// Returns { linkedCount, fuzzyCount, learnedCount } for the response.
async function autoLinkImportedTasks({ project, tasks, userId, productKey }) {
  if (!tasks?.length) return { linkedCount: 0, fuzzyCount: 0, learnedCount: 0 };

  // Build the BoQ-side catalogue once. Identical to what the picker sees.
  const scope = computeProjectScope(project);
  const catalogue = scope.virtualItems;
  if (!catalogue.length) return { linkedCount: 0, fuzzyCount: 0, learnedCount: 0 };

  // Pull all learned mappings for this user/tool in one query. Build a
  // map keyed on the normalised task name.
  const norms = new Set(
    tasks
      .map((t) => normalizeTaskName(t?.name || ""))
      .filter(Boolean),
  );
  const learnedRows = norms.size
    ? await TaskLinkLearned.find({
        userId,
        productKey,
        taskNameNorm: { $in: [...norms] },
      }).lean()
    : [];
  const learnedByNorm = new Map(
    learnedRows.map((row) => [row.taskNameNorm, row]),
  );

  // For fuzzy validity, also build a set of catalogue identities so we
  // can drop learned identities that no longer exist (BoQ items get
  // re-uploaded with different SNs etc.).
  const validIdentities = new Set(catalogue.map((c) => c.identity));

  let linkedCount = 0;
  let fuzzyCount = 0;
  let learnedCount = 0;

  for (const t of tasks) {
    // If the upstream parser somehow already attached links (e.g. via
    // future custom mapping), leave them alone.
    if (Array.isArray(t.linkedBoqIdentities) && t.linkedBoqIdentities.length) {
      linkedCount += 1;
      continue;
    }
    const norm = normalizeTaskName(t?.name || "");
    if (!norm) continue;

    // Pass 1 — learned mapping.
    const learned = learnedByNorm.get(norm);
    if (learned?.linkedIdentities?.length) {
      const stillValid = learned.linkedIdentities.filter((id) =>
        validIdentities.has(id),
      );
      if (stillValid.length) {
        t.linkedBoqIdentities = stillValid;
        linkedCount += 1;
        learnedCount += 1;
        continue;
      }
    }

    // Pass 2 — fuzzy match.
    const match = bestMatch(t?.name || "", catalogue, { threshold: 0.45 });
    if (match) {
      t.linkedBoqIdentities = [match.identity];
      linkedCount += 1;
      fuzzyCount += 1;
    }
  }

  return { linkedCount, fuzzyCount, learnedCount };
}

async function importPm(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const parsed = await parseMsProjectFile(file.buffer, { filename: file.originalname });
    if (!parsed.ok) {
      // Propagate the parser's errorCode (e.g. MPP_NOT_ENABLED) so the
      // client can react with an XML-export helper modal instead of a
      // generic toast.
      return res.status(400).json({
        error: parsed.error || "Could not parse the file.",
        errorCode: parsed.errorCode || null,
        format: parsed.format,
      });
    }

    // Run auto-link on the parsed tasks BEFORE sanitizing — sanitizeTask
    // preserves linkedBoqIdentities so the suggested links flow through.
    const linkStats = await autoLinkImportedTasks({
      project,
      tasks: parsed.tasks,
      userId: getUserObjectId(req),
      productKey: requestedProductKey(req),
    });

    const replaceExisting = req.body?.replaceExisting === "true" || req.body?.replaceExisting === true;
    const existing = project.projectManagement?.tasks || [];
    const sanitized = parsed.tasks
      .map((t) => sanitizeTask(t))
      .filter(Boolean);

    if (replaceExisting) {
      project.projectManagement.tasks = sanitized;
    } else {
      // Merge by taskId; new ones append.
      const byId = new Map(existing.map((t) => [String(t.taskId), t]));
      for (const t of sanitized) byId.set(String(t.taskId), t);
      project.projectManagement.tasks = Array.from(byId.values());
    }

    if (parsed.projectStart && !project.projectManagement.projectStart) {
      project.projectManagement.projectStart = parsed.projectStart;
    }
    if (parsed.projectFinish && !project.projectManagement.projectFinish) {
      project.projectManagement.projectFinish = parsed.projectFinish;
    }
    if (parsed.baselineDate && !project.projectManagement.baselineDate) {
      project.projectManagement.baselineDate = parsed.baselineDate;
    }

    const imports = project.projectManagement.imports || [];
    imports.push({
      filename: file.originalname || "",
      format: parsed.format,
      importedAt: new Date(),
      taskCount: sanitized.length,
      note: parsed.skipped ? `Skipped ${parsed.skipped} empty rows` : "",
    });
    // Cap import history at 25 entries.
    project.projectManagement.imports = imports.slice(-25);

    touchPm(project);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      imported: sanitized.length,
      skipped: parsed.skipped || 0,
      format: parsed.format,
      // Per-task auto-link breakdown for the import toast:
      //   linkedCount  = total tasks that got at least one link
      //   learnedCount = subset that re-used a prior user-confirmed mapping
      //   fuzzyCount   = subset matched via similarity score
      autoLink: linkStats,
      dashboard: computePmDashboard(project),
      version: project.version,
    });
  } catch (err) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: `File too large. Maximum upload is ${Math.round(PM_IMPORT_MAX_BYTES / 1024 / 1024)} MB.`,
      });
    }
    console.error("POST PM import error:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
}

// ── DELETE only imported (MS Project) tasks ──────────────────────────────
// Removes every task whose `source` starts with "msproject" (xml or mpp)
// and clears the imports[] history. Manually-authored and BoQ-generated
// tasks are preserved. Optional ?keepHistory=true preserves imports[].
async function clearImports(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const pm = project.projectManagement || {};
    const before = (pm.tasks || []).length;
    const kept = (pm.tasks || []).filter(
      (t) => !String(t?.source || "").startsWith("msproject"),
    );
    pm.tasks = kept;
    const removed = before - kept.length;

    if (req.query?.keepHistory !== "true" && req.query?.keepHistory !== true) {
      pm.imports = [];
    }

    project.projectManagement = pm;
    touchPm(project);
    project.version += 1;
    await project.save();

    res.json({
      ok: true,
      removed,
      remaining: kept.length,
      dashboard: computePmDashboard(project),
      version: project.version,
    });
  } catch (err) {
    console.error("POST PM clear-imports error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── GET /pm/calendar.ics ────────────────────────────────────────────────
// Streams an RFC 5545 iCalendar file for the project schedule. One event
// per leaf task; summary tasks are skipped by default to avoid duplicate
// ranges in the user's calendar. Filename = project name + .ics.
async function exportPmCalendar(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;

    const tasks = project.projectManagement?.tasks || [];
    if (!tasks.length) {
      return res.status(400).json({
        error:
          "Project has no tasks to export. Add tasks or import an MS Project schedule first.",
      });
    }

    // Optional ?includeSummary=true keeps parent/summary rows in the file —
    // useful for the calendar to show major phases as background blocks.
    const includeSummaryRows =
      req.query?.includeSummary === "true" || req.query?.includeSummary === true;

    const { body, filename, included, skipped } = generateIcs({
      project: project.toObject ? project.toObject() : project,
      tasks,
      includeSummaryRows,
    });

    if (included === 0) {
      return res.status(400).json({
        error:
          "No tasks had valid start/end dates. Reschedule from the project start, or set task dates manually before exporting.",
        skipped,
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Calendar-Filename",
    );
    // Quote the filename to handle spaces / special chars cleanly across
    // Chrome / Safari / Firefox. We also expose it as a custom header so
    // the JS client can read it without parsing Content-Disposition.
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    );
    res.setHeader("X-Calendar-Filename", encodeURIComponent(filename));
    res.status(200).send(body);
  } catch (err) {
    console.error("GET PM calendar export error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ── DELETE all PM data (reset) ───────────────────────────────────────────
async function resetPm(req, res) {
  try {
    const project = await loadProject(req, res);
    if (!project) return;
    project.projectManagement = {
      projectStart: null,
      projectFinish: null,
      baselineDate: null,
      budgetOverride: 0,
      tasks: [],
      risks: [],
      issues: [],
      imports: project.projectManagement?.imports || [],
      lastEditedAt: new Date(),
    };
    project.markModified("projectManagement");
    project.version += 1;
    await project.save();
    res.json({ ok: true, dashboard: computePmDashboard(project), version: project.version });
  } catch (err) {
    console.error("DELETE PM error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// Routes — same shape as the BoQ routes: /:productKey/:id/pm/...
router.get(
  "/:productKey/:id/pm/dashboard",
  mapEntitlementParam,
  requireEntitlementParam,
  getDashboard,
);

router.patch(
  "/:productKey/:id/pm",
  mapEntitlementParam,
  requireEntitlementParam,
  updatePm,
);

router.post(
  "/:productKey/:id/pm/generate-from-boq",
  mapEntitlementParam,
  requireEntitlementParam,
  generateFromBoq,
);

router.post(
  "/:productKey/:id/pm/import",
  mapEntitlementParam,
  requireEntitlementParam,
  importUpload.single("file"),
  importPm,
);

router.post(
  "/:productKey/:id/pm/clear-imports",
  mapEntitlementParam,
  requireEntitlementParam,
  clearImports,
);

router.post(
  "/:productKey/:id/pm/reschedule",
  mapEntitlementParam,
  requireEntitlementParam,
  reschedulePm,
);

router.get(
  "/:productKey/:id/pm/calendar.ics",
  mapEntitlementParam,
  requireEntitlementParam,
  exportPmCalendar,
);

router.delete(
  "/:productKey/:id/pm",
  mapEntitlementParam,
  requireEntitlementParam,
  resetPm,
);

export default router;
