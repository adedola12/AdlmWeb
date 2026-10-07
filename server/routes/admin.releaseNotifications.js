// server/routes/admin.releaseNotifications.js
//
// The "new version is ready" emails, from the admin side.
//
//   GET  /admin/release-notifications              recent notices, with live counts
//   POST /admin/release-notifications/preview      who would get it + the rendered mail; sends and writes nothing
//   POST /admin/release-notifications              announce a version by hand
//   GET  /admin/release-notifications/:id          one notice, counts, failed and in-flight rows
//   GET  /admin/release-notifications/:id/preview  the rendered mail for an existing notice
//   POST /admin/release-notifications/:id/send     send one bounded batch (repeat until pending is 0)
//   POST /admin/release-notifications/:id/retry-failed   put failed rows back in the queue
//   POST /admin/release-notifications/:id/cancel   stop an unfinished notice
//
// `:id` is the notice's _id or its key, e.g. "revit@3.1.11".
//
// Notices are created by the deployment PUT (routes/admin.deployments.js) and
// worked through here or by the fifteen-minute job, which leaves a new notice
// alone for its first ten minutes (RELEASE_HOLD_MS). A release script calls
// /send once its own checks of the published build have passed (the download
// hash matches), and /cancel when they fail, so nobody is mailed about a
// build that failed its release check. Each /send call sends what fits in
// about forty seconds, well inside the API's sixty, and says how many are left.
//
// THE /send CONTRACT A RELEASE SCRIPT LOOPS ON
//
//   200  counts.pending > 0   call again (also when `paused`/`retryLater`:
//                             SES throttled or did not answer; wait a little)
//   200  counts.pending == 0  finished ("Complete.")
//   200  skipped              nothing to do: reason says why (already done,
//                             cancelled because the build was pulled, ...)
//   409  stopped              SES refused (sandbox, paused, denied). Nothing
//                             further was sent and no other provider was tried.
//   503  retryLater           SES could not be reached before anything was
//                             sent. Call again after Retry-After seconds.
//
// Admin only, like broadcast: mailing the customer base is not a mini-admin
// action. The role is read from the database on every request (requireAdmin),
// not trusted from the token, so revoking an admin or disabling the account
// stops these endpoints at once rather than when the token expires.

import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { ReleaseNotice, ReleaseNoticeRecipient, OPEN_STATUSES } from "../models/ReleaseNotice.js";
import { getSesAccount } from "../util/sesTransport.js";
import {
  createManualNotice,
  mongoStore,
  previewRelease,
  sendReleaseNotice,
  sesAccountVerdict,
  tallyCounts,
} from "../util/releaseNotifier.js";

/** Seconds of sending per /send call. The API function times out at 60. */
const SEND_BUDGET_MS = Number(process.env.RELEASE_SEND_BUDGET_MS || 40_000);
export const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

/** requireAdmin lets a demo session through for viewing; this list is not for viewing. */
function refuseDemo(req, res, next) {
  if (req.demoMode) return res.status(403).json({ error: "Admin only" });
  return next();
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (err?.status === 400 || err?.status === 409) {
      return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
    }
    return next(err);
  });

async function mongoLiveCounts(keys) {
  if (!keys.length) return new Map();
  const rows = await ReleaseNoticeRecipient.aggregate([
    { $match: { noticeKey: { $in: keys } } },
    { $group: { _id: { k: "$noticeKey", s: "$status", r: "$skipReason" }, n: { $sum: 1 } } },
  ]);
  const byKey = new Map();
  for (const r of rows) {
    const list = byKey.get(r._id.k) || [];
    list.push({ status: r._id.s, skipReason: r._id.r, n: r.n });
    byKey.set(r._id.k, list);
  }
  return new Map(keys.map((k) => [k, tallyCounts(byKey.get(k) || [])]));
}

/** What SES says about reaching customers, for the screens. Never throws. */
async function mongoSesState() {
  try {
    const v = sesAccountVerdict(await getSesAccount());
    return v.ok
      ? { ok: true, ratePerSecond: v.ratePerSecond, remaining24h: v.remaining24h }
      : { ok: false, code: v.code, message: v.message };
  } catch (err) {
    return { ok: false, code: "ses-account-unreadable", message: String(err?.name || err?.message || err) };
  }
}

/** The /send limit: 200 when absent or unreadable, never below 1 or above MAX_LIMIT. */
export function clampLimit(raw) {
  return Math.min(Math.max(Number.parseInt(raw ?? DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

/** What a /send reply says, and with which status, for every way a run can end. */
export function sendReply(out, limit) {
  const pending = out?.counts?.pending;
  if (out?.dryRun) {
    return {
      status: 200,
      note:
        out.reason === "deployment-withdrawn"
          ? `DRY RUN: would be cancelled (${out.error}). Nothing sent, nothing written.`
          : `DRY RUN: would mail ${out.recipients ?? 0} licence holder(s). Nothing sent, nothing written.`,
    };
  }
  if (out?.stopped) {
    return {
      status: 409,
      note: "SES refused. Nothing further was sent and no other provider was tried. Fix SES, then call /send again.",
    };
  }
  if (out?.retryLater && out?.code === "ses-account-unreachable") {
    return {
      status: 503,
      retryAfter: 30,
      note:
        "SES could not be reached, so nothing was sent this time. The notice is unchanged" +
        (pending > 0 ? ` with ${pending} still to go` : "") +
        ". Call /send again shortly.",
    };
  }
  if (out?.retryLater) {
    return {
      status: 200,
      note:
        `SES was throttling or did not answer, so this run paused${pending > 0 ? ` with ${pending} still to go` : ""}. ` +
        "Call /send again shortly." +
        (out.inDoubt ? ` ${out.inDoubt} message(s) in doubt were left in flight and will not be sent again unless you re-queue them.` : ""),
    };
  }
  if (out?.paused) {
    return {
      status: 200,
      note:
        `Paused: ${String(out.error || "SES asked us to wait").replace(/\.+$/, "")}.` +
        (pending > 0 ? ` ${pending} still to go; call /send again later.` : ""),
    };
  }
  if (out?.skipped) {
    return { status: 200, note: `Nothing to do (${out.reason}${out.error ? `: ${out.error}` : ""}).` };
  }
  if (out?.cancelled) {
    return { status: 200, note: `Stopped and cancelled: ${out.reason}. Nothing more will be sent.` };
  }
  if (pending > 0) return { status: 200, note: `Call again to send the next ${Math.min(pending, limit)}.` };
  return { status: 200, note: "Complete." };
}

/**
 * The router, with its data and its sender injectable so the tests can drive
 * the real routes over HTTP against an in-memory store and a stub SES. The
 * gate is always the real one.
 */
export function makeReleaseNotificationsRouter({
  store = mongoStore,
  send = sendReleaseNotice,
  preview = previewRelease,
  createManual = createManualNotice,
  sesState = mongoSesState,
  liveCounts = mongoLiveCounts,
  listNotices = ({ productKey, limit }) =>
    ReleaseNotice.find(productKey ? { productKey } : {})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  rowsIn = (noticeKey, status, fields) =>
    ReleaseNoticeRecipient.find({ noticeKey, status }).select(fields).limit(100).lean(),
} = {}) {
  const router = express.Router();

  router.use(requireAuth, requireAdmin, refuseDemo);

  async function loadNotice(req, res) {
    const notice = await store.findNotice(req.params.id);
    if (!notice) {
      res.status(404).json({ error: `No release notification "${req.params.id}"` });
      return null;
    }
    return notice;
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
      const productKey = req.query.productKey ? String(req.query.productKey).trim().toLowerCase() : "";
      const items = await listNotices({ productKey, limit });
      const counts = await liveCounts(items.map((n) => n.key));
      res.json({
        items: items.map((n) => ({ ...n, counts: counts.get(n.key) || n.counts })),
      });
    }),
  );

  router.post(
    "/preview",
    asyncHandler(async (req, res) => {
      const productKey = String(req.body?.productKey || "").trim().toLowerCase();
      const version = String(req.body?.version || "").trim();
      if (!productKey || !version) {
        return res.status(400).json({ error: "productKey and version are required" });
      }
      const [p, ses] = await Promise.all([
        preview({
          productKey,
          version,
          releaseNotes: req.body?.releaseNotes,
          displayName: req.body?.displayName,
        }),
        sesState(),
      ]);
      res.json({ ...p, ses, note: "Nothing was sent and nothing was written." });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const out = await createManual({
        productKey: req.body?.productKey,
        version: req.body?.version,
        releaseNotes: req.body?.releaseNotes,
        displayName: req.body?.displayName,
        actor: String(req.user?.email || "admin"),
      });
      res.status(out.created ? 201 : 200).json({
        ok: true,
        ...out,
        note: out.created
          ? `Recorded. Nothing has been sent: POST /admin/release-notifications/${out.key}/send to begin.`
          : `Reopened ${out.key}, which had been cancelled. Nothing has been sent: POST .../send to begin.`,
      });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const notice = await loadNotice(req, res);
      if (!notice) return;
      const [counts, failed, inFlight] = await Promise.all([
        liveCounts([notice.key]),
        rowsIn(notice.key, "failed", "email error attempts updatedAt"),
        rowsIn(notice.key, "sending", "email error claimedAt attempts"),
      ]);
      res.json({ ...notice, counts: counts.get(notice.key), failed, inFlight });
    }),
  );

  router.get(
    "/:id/preview",
    asyncHandler(async (req, res) => {
      const notice = await loadNotice(req, res);
      if (!notice) return;
      const [p, ses] = await Promise.all([
        preview({
          productKey: notice.productKey,
          version: notice.version,
          displayName: notice.productName,
          notes: notice.notes,
        }),
        sesState(),
      ]);
      res.json({ ...p, status: notice.status, ses, note: "Nothing was sent and nothing was written." });
    }),
  );

  router.post(
    "/:id/send",
    asyncHandler(async (req, res) => {
      const notice = await loadNotice(req, res);
      if (!notice) return;
      const limit = clampLimit(req.body?.limit);
      const out = await send(notice.key, {
        limit,
        deadlineAt: Date.now() + SEND_BUDGET_MS,
        // Pressing Send on a notice SES refused is the decision to try again.
        resume: true,
      });
      const reply = sendReply(out, limit);
      if (reply.retryAfter) res.set("Retry-After", String(reply.retryAfter));
      res.status(reply.status).json({ ...out, note: reply.note });
    }),
  );

  router.post(
    "/:id/retry-failed",
    asyncHandler(async (req, res) => {
      const notice = await loadNotice(req, res);
      if (!notice) return;
      if (["cancelled", "superseded"].includes(notice.status)) {
        return res.status(409).json({ error: `This notice is ${notice.status}; nothing to retry.` });
      }
      // In-flight rows are ones a dead run claimed, or whose send SES may have
      // taken without answering. Only re-queued when asked, and only once
      // they are stale.
      const requeued = await store.requeue(notice.key, {
        includeInFlight: req.body?.includeInFlight === true,
      });
      if (requeued > 0 && notice.status === "done") {
        await store.setNotice(notice.key, { status: "sending", finishedAt: null }, "done");
      }
      res.json({ ok: true, key: notice.key, requeued, note: "Call /send to mail them." });
    }),
  );

  router.post(
    "/:id/cancel",
    asyncHandler(async (req, res) => {
      const notice = await loadNotice(req, res);
      if (!notice) return;
      const out = await store.setNotice(
        notice.key,
        { status: "cancelled", cancelledReason: `Cancelled by ${req.user?.email || "admin"}` },
        OPEN_STATUSES,
      );
      if (!out) return res.status(409).json({ error: `This notice is already ${notice.status}.` });
      res.json({ ok: true, key: notice.key, status: out.status });
    }),
  );

  return router;
}

export default makeReleaseNotificationsRouter();
