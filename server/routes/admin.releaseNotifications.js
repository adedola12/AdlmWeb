// server/routes/admin.releaseNotifications.js
//
// The "new version is ready" emails, from the admin side.
//
// THE WEEKLY DIGEST (util/releaseDigest.js). Release emails go out once a
// week, one email per customer listing every update for the software they
// hold, Monday 09:00 Lagos time by default. These drive it:
//
//   GET  /admin/release-notifications/digest            next run, what is queued, recipients estimate, anything
//                                                       stuck, and `sendNow`: what send-now would do right now
//   POST /admin/release-notifications/digest/preview    what send-now would do, as a dry run: counts + one
//                                                       rendered email ({userId} for that customer's, else the
//                                                       first recipient's). When an unfinished digest still holds
//                                                       updates, THAT digest is shown (the customers still owed
//                                                       it), with `digestKey` and `requiresDigestKey`
//   POST /admin/release-notifications/digest/send-now   EMERGENCY: send now, one email per customer; body
//                                                       {"confirm":"SEND"}, plus {"digestKey":"<key>"} when the
//                                                       preview says requiresDigestKey (an unfinished digest is
//                                                       finished first and alone, and never without its name:
//                                                       409 code "unfinished-digest"). Call again, passing back
//                                                       `digestKey`, until counts.pending is 0 or it answers
//                                                       `skipped`. What it sends is marked, so the Monday digest
//                                                       skips it; Monday still mails anything queued after it.
//                                                       Refused (409, code "digest-disabled") while
//                                                       RELEASE_DIGEST_ENABLED is off: the kill switch.
//   POST /admin/release-notifications/digest/cancel     {id|key}: take a notice out of the queue
//   POST /admin/release-notifications/digest/hub        {version, releaseNotes?, downloadUrl?}: add a new
//                                                       Installation Center to the digest, for every holder of
//                                                       software it installs (cancel it with
//                                                       /digest/cancel {key:"hub@1.0.3"})
//
// The notices themselves:
//
//   GET  /admin/release-notifications              recent notices, with live counts
//   POST /admin/release-notifications/preview      who would get it + the rendered mail; sends and writes nothing
//   POST /admin/release-notifications              announce a version by hand (queued for the weekly digest)
//   GET  /admin/release-notifications/:id          one notice, counts, failed and in-flight rows
//   GET  /admin/release-notifications/:id/preview  the rendered mail for an existing notice
//   POST /admin/release-notifications/:id/send     the per-release email, NOW. Refused (409, code
//                                                  "weekly-digest") unless the body says {"bypassDigest":true}:
//                                                  that is for true emergencies only, a release customers must
//                                                  hear about today and by itself. A notice a digest has taken
//                                                  is refused either way (409, code "in-digest"), and so is an
//                                                  Installation Center notice (409, code "hub-in-digest-only":
//                                                  it has no deployment and no licence of its own, so only the
//                                                  digest can address it; use /digest/send-now).
//   POST /admin/release-notifications/:id/retry-failed   put failed rows back in the queue
//   POST /admin/release-notifications/:id/cancel   stop an unfinished notice
//
// `:id` is the notice's _id or its key, e.g. "revit@3.1.11".
//
// Notices are created by the deployment PUT (routes/admin.deployments.js),
// and a hub notice by a change of the Installation Center link
// (routes/admin.settings.js). They wait for the weekly digest. A release
// script calls /cancel when its own checks of the published build fail, so
// nobody is mailed about a build that failed its release check; the digest
// also re-reads every build before it mails it. With bypassDigest, each /send
// call sends what fits in about forty seconds, well inside the API's sixty,
// and says how many are left.
//
// THE /send CONTRACT A RELEASE SCRIPT LOOPS ON (with bypassDigest:true)
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
  isHubNotice,
  mongoStore,
  previewRelease,
  sendReleaseNotice,
  sesAccountVerdict,
  tallyCounts,
} from "../util/releaseNotifier.js";
import {
  cancelQueuedNotice,
  createManualHubNotice,
  digestStatus,
  nextDigestRun,
  previewSendNow,
  sendDigestNow,
} from "../util/releaseDigest.js";

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

/** What a /digest/send-now reply says, and with which status. */
export function digestSendReply(out, limit) {
  const pending = out?.counts?.pending;
  if (out?.disabled) return { status: 409, note: out.error };
  // An unfinished digest that was not named, or a name that is not the one
  // send-now would act on: nothing was sent (dead digests may have been closed).
  if (out?.refused) return { status: 409, note: out.error };
  if (out?.notFound) return { status: 404, note: out.error };
  if (out?.dryRun) {
    return {
      status: 200,
      note: `DRY RUN: would mail ${out.recipients ?? 0} customer(s), one email each. Nothing sent, nothing written.`,
    };
  }
  if (out?.busy) return { status: 409, note: out.error || "A digest run is in progress. Try again in a minute." };
  if (out?.stopped) {
    return {
      status: 409,
      note: "SES refused. Nothing further was sent and no other provider was tried. Fix SES, then call /digest/send-now again.",
    };
  }
  if (out?.retryLater && out?.code === "ses-account-unreachable") {
    return {
      status: 503,
      retryAfter: 30,
      note: "SES could not be reached, so nothing was sent this time. Call /digest/send-now again shortly.",
    };
  }
  if (out?.retryLater) {
    return {
      status: 200,
      note:
        `SES was throttling or did not answer, so this run paused${pending > 0 ? ` with ${pending} still to go` : ""}. ` +
        "Call /digest/send-now again shortly." +
        (out.inDoubt ? ` ${out.inDoubt} email(s) in doubt were left in flight and will not be sent again.` : ""),
    };
  }
  if (out?.paused) {
    return {
      status: 200,
      note:
        `Paused: ${String(out.error || "SES asked us to wait").replace(/\.+$/, "")}.` +
        (pending > 0 ? ` ${pending} still to go; call /digest/send-now again later.` : ""),
    };
  }
  if (out?.skipped && out.reason === "nothing-queued") {
    return { status: 200, note: "Nothing is queued for the digest. Nothing was sent." };
  }
  if (out?.skipped) {
    return { status: 200, note: `Nothing to do (${out.reason}${out.error ? `: ${out.error}` : ""}).` };
  }
  if (out?.status === "empty") {
    return { status: 200, note: "Every queued update was withdrawn before it went out. Nothing was sent." };
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
  digest = {
    status: () => digestStatus(),
    preview: (opts) => previewSendNow(opts),
    sendNow: (opts) => sendDigestNow(opts),
    cancel: (opts) => cancelQueuedNotice(opts),
    createHub: (opts) => createManualHubNotice(opts),
    next: () => nextDigestRun(),
  },
} = {}) {
  const router = express.Router();

  router.use(requireAuth, requireAdmin, refuseDemo);

  /** "the weekly digest on Mon 28 Sep 2026, 09:00 WAT" for a note; never fails the request. */
  const nextRunNote = async () => {
    try {
      const n = await digest.next();
      return n.dueNow ? "the digest starting at the next 15-minute tick" : `the weekly digest on ${n.lagos}`;
    } catch {
      return "the next weekly digest";
    }
  };

  /* ── the weekly digest (registered before /:id, which would catch "digest") ── */

  router.get(
    "/digest",
    asyncHandler(async (_req, res) => {
      res.json(await digest.status());
    }),
  );

  router.post(
    "/digest/preview",
    asyncHandler(async (req, res) => {
      const userId = String(req.body?.userId || "").trim();
      const [p, ses] = await Promise.all([digest.preview({ userId }), sesState()]);
      res.json({ ...p, ses, note: `Dry run: nothing was sent and nothing was written.${p.plan ? ` ${p.plan}` : ""}` });
    }),
  );

  router.post(
    "/digest/send-now",
    asyncHandler(async (req, res) => {
      if (req.body?.confirm !== "SEND") {
        return res.status(400).json({
          error:
            'This emails every customer with a queued update now. Send {"confirm":"SEND"} to go ahead; ' +
            "POST /digest/preview first to see who gets what.",
          code: "confirm-required",
        });
      }
      const limit = clampLimit(req.body?.limit);
      const out = await digest.sendNow({
        actor: String(req.user?.email || "admin"),
        digestKey: typeof req.body?.digestKey === "string" ? req.body.digestKey.trim() : "",
        limit,
        deadlineAt: Date.now() + SEND_BUDGET_MS,
      });
      const reply = digestSendReply(out, limit);
      let note = reply.note;
      if (!out?.refused && !out?.dryRun && out?.stillQueued?.length && !(out.counts?.pending > 0)) {
        note +=
          ` Still queued: ${out.stillQueued.join(", ")}, for ${await nextRunNote()}` +
          " (call /digest/send-now again to send them now).";
      }
      const extra = {};
      if ((out?.started || out?.continued) && out?.counts?.sent > 0) {
        // The email says "usually once a week" because of exactly this. Said
        // in the note too once the digest is done, since a release script
        // prints the note.
        const when = await nextRunNote();
        extra.weeklyNote =
          `Sent now. ${when.charAt(0).toUpperCase()}${when.slice(1)} will not repeat these updates, but it ` +
          "mails anything queued after this, so some of these customers may hear from us again within a few days.";
        if (out.status === "done") note += ` ${extra.weeklyNote}`;
      }
      if (reply.retryAfter) res.set("Retry-After", String(reply.retryAfter));
      res.status(reply.status).json({ ...out, note, ...extra });
    }),
  );

  router.post(
    "/digest/cancel",
    asyncHandler(async (req, res) => {
      const idOrKey = String(req.body?.id || req.body?.key || "").trim();
      if (!idOrKey) return res.status(400).json({ error: "id or key is required" });
      const out = await digest.cancel({ idOrKey, actor: String(req.user?.email || "admin") });
      if (!out.ok) return res.status(out.status || 409).json({ error: out.error });
      res.json(out);
    }),
  );

  router.post(
    "/digest/hub",
    asyncHandler(async (req, res) => {
      const out = await digest.createHub({
        version: req.body?.version,
        releaseNotes: req.body?.releaseNotes,
        downloadUrl: typeof req.body?.downloadUrl === "string" ? req.body.downloadUrl.trim() : "",
        actor: String(req.user?.email || "admin"),
      });
      res.status(out.created ? 201 : 200).json({
        ok: true,
        ...out,
        note: `Queued for ${await nextRunNote()}, to everybody with an active licence for software it installs. Nothing has been sent.`,
      });
    }),
  );

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
      const when = await nextRunNote();
      res.status(out.created ? 201 : 200).json({
        ok: true,
        ...out,
        deliveredBy: "weekly-digest",
        note: out.created
          ? `Recorded. Nothing has been sent: it goes out in ${when}.`
          : `Reopened ${out.key}, which had been cancelled. Nothing has been sent: it goes out in ${when}.`,
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
      // An Installation Center notice, bypass or not: there is no "hub"
      // deployment for the per-release send to check it against (it would
      // cancel it as deleted) and no "hub" licence to address it to. Only the
      // digest can send it.
      if (isHubNotice(notice)) {
        return res.status(409).json({
          error: `${notice.key} is an Installation Center announcement: it only goes out in the weekly digest. Nothing was sent.`,
          code: "hub-in-digest-only",
          key: notice.key,
          note:
            `${notice.key} goes out in ${await nextRunNote()}. To send it now, with everything else queued, ` +
            'one email per customer: POST /admin/release-notifications/digest/send-now {"confirm":"SEND"} ' +
            "(POST /digest/preview first).",
        });
      }
      // Release emails go out in the weekly digest. Mailing one release on its
      // own is for emergencies, and has to be asked for in so many words.
      if (req.body?.bypassDigest !== true) {
        return res.status(409).json({
          error: "release emails now go out in the weekly digest; use /digest/send-now",
          code: "weekly-digest",
          key: notice.key,
          note:
            `${notice.key} goes out in ${await nextRunNote()}. To send the queued updates now, one email per ` +
            'customer: POST /admin/release-notifications/digest/send-now {"confirm":"SEND"}. To mail this ' +
            'release alone, now, in a true emergency: repeat this call with {"bypassDigest":true}.',
        });
      }
      if (notice.status === "digesting" || notice.digestKey) {
        return res.status(409).json({
          error: `${notice.key} is in ${notice.digestKey || "a digest"}, which sends it. Nothing was sent here.`,
          code: "in-digest",
          key: notice.key,
          digestKey: notice.digestKey || "",
        });
      }
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
