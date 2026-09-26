// server/util/releaseNotifier.js
//
// "QUIV 3.1.11 is ready": one email to everybody licensed for a product, each
// time a newer version of it is published to the Installation Center.
//
// HOW A RELEASE BECOMES AN EMAIL
//
//   1. A release script PUTs /admin/deployments/<key> (routes/admin.deployments.js).
//      recordDeploymentRelease() compares the new version with the one it
//      replaced and, only when it went UP, records a ReleaseNotice keyed
//      "<key>@<canonical version>". Nothing is sent inside the PUT, and
//      nothing here can fail it.
//   2. The notice is worked through by sendReleaseNotice(): from the
//      fifteen-minute job (scheduled.js, after video-poll) once it is
//      RELEASE_HOLD_MS (10 minutes) old, and from
//      POST /admin/release-notifications/:id/send, which a release script calls
//      in a loop once its own checks of the published build have passed (and
//      it calls /cancel when they fail). Each call sends a bounded amount and
//      stops before its Lambda would, so the ledger is the only state.
//
// A PULLED BUILD IS NEVER ANNOUNCED
//
// A rollback, a PUT that switches the product off or leaves it with no
// package, and DELETE /admin/deployments/<key> all cancel the product's
// unfinished notices. And because a hook can be missed (the admin UI, a failed
// write, a direct database edit), sendReleaseNotice reads the deployment itself
// before it takes a notice and before every batch: if customers can no longer
// download that version, the notice is cancelled and nothing more is sent.
//
// SES AND ONLY SES
//
// The owner's rule: transactional and bulk mail go through Amazon SES only, and
// if SES refuses, stop and say so. So this file calls sesTransport directly
// rather than util/mailer.js#sendMail, which falls through to Resend and then
// Gmail when SES fails. Before a single message goes out the account is asked
// whether it can reach customers at all (GetAccount): in the sandbox SES only
// delivers to verified addresses, so the notice is marked failed with SES's
// answer and nothing is attempted. An account-level refusal during the run
// (access denied, sending paused, "not verified") stops the run the same way
// and puts the refused row back in the queue, since SES did not take it.
//
// NEVER A SEND REPEATED ON A GUESS
//
// Each message is one SendEmail request (sendViaSesOnce: the SDK's own retries
// are off). Only throttling, or a connection that was never made, is tried
// again: SES certainly did not take those. A timeout, a reset or a 5xx after
// the request went out may have been delivered, so that row is left in flight
// for an admin, exactly like a crash, and the run pauses without failing the
// notice. A row still throttled after its attempts goes back in the queue and
// the run pauses; the next run carries on.
//
// WHY THE STORE IS INJECTED
//
// Every database call goes through `store` (mongoStore below by default). The
// tests drive the real send loop against an in-memory store with the same
// rules — a unique key per notice, a unique address per notice, a conditional
// claim — so "a crash halfway does not double-send" is exercised rather than
// asserted about a mock of Mongoose.

import mongoose from "mongoose";
import { senderFor, replyToAddress as defaultReplyTo } from "./senders.js";
import dayjs from "dayjs";
import { User } from "../models/User.js";
import { ChangelogProduct } from "../models/Changelog.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { ProductDeployment } from "../models/ProductDeployment.js";
import { ROLLOUT_ORGANIZATIONS, earlyRingUserIds, newestOffered } from "./releaseRollout.js";
import {
  ReleaseNotice,
  ReleaseNoticeRecipient,
  OPEN_STATUSES,
} from "../models/ReleaseNotice.js";
import { sendViaSesOnce, getSesAccount, isRetryableSesError } from "./sesTransport.js";
import { mapWithPool } from "./sendPool.js";
import { productUpdatesUnsubscribeUrl, assertUnsubscribeLinksWork } from "./campaigns.js";
import {
  canonicalVersion,
  compareVersions,
  normalizeVersion,
  parseVersion,
  maxVersion,
} from "./releaseVersion.js";
import {
  productFor,
  notesFromMarkdown,
  notesFromChangelog,
  genericNotes,
  buildReleaseMessage,
  whatsNewUrl,
  TEMPLATE_KEY,
} from "./releaseEmail.js";

/* ───────────────────────────────────────────────────────────── settings ── */

/** Attempts per recipient for a transient failure, including the first. */
export const MAX_ATTEMPTS = Number(process.env.RELEASE_SEND_ATTEMPTS || 3);
const RETRY_BASE_MS = 500;

/** Rows per batch at most; smaller when SES allows fewer per second. */
export const BATCH_SIZE = Number(process.env.RELEASE_BATCH_SIZE || 50);

/** Most sends in flight at once, whatever SES allows. */
const MAX_CONCURRENCY = 10;

/**
 * Every send so far refused, and this many of them: something is wrong with
 * the account or the message, not with the addresses. Stop and say so rather
 * than burning through the whole list.
 */
const REFUSALS_BEFORE_STOP = 10;

/** A row claimed this long ago and never settled belongs to a run that died. */
export const IN_FLIGHT_STALE_MS = 15 * 60 * 1000;

const DEFAULT_HOLD_MS = 10 * 60 * 1000;

/**
 * How long the fifteen-minute job leaves a freshly recorded notice alone.
 *
 * A release script PUTs the manifest and only then downloads the published
 * package to check its hash. Without a hold the job could mail every licence
 * holder about a build that is about to fail its own release check. Ten
 * minutes gives the script time to finish and, on a failed check, to cancel.
 * An admin's (or a script's) POST .../send is a deliberate decision and is
 * not held. Read at call time; RELEASE_HOLD_MS=0 turns the hold off.
 */
export function releaseHoldMs() {
  const raw = String(process.env.RELEASE_HOLD_MS ?? "").trim();
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) && n >= 0 ? n : DEFAULT_HOLD_MS;
}

/** Send nothing, write nothing, log who would get it. Read at call time. */
export const isDryRun = () =>
  /^(1|true|yes)$/i.test(String(process.env.DRY_RUN || "").trim());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mail that carries an unsubscribe link is an announcement, so it goes out as
// news@ with replies to the real inbox (util/senders.js). RELEASE_MAIL_FROM and
// RELEASE_MAIL_REPLY_TO still override for this mail alone.
const fromAddress = () =>
  String(process.env.RELEASE_MAIL_FROM || "").trim() || senderFor({ marketing: true });

const replyToAddress = () =>
  String(process.env.RELEASE_MAIL_REPLY_TO || "").trim() || defaultReplyTo();

/* ─────────────────────────────────────────────────── should we announce ── */

/**
 * "<productKey>@<version>", the notice's identity, with the version in its
 * canonical spelling: "3.2" and "3.2.0" are the same release, so they must be
 * the same notice, or an admin typing it the other way would mail everybody
 * again. (HERON has shipped "2.5", so mixed spellings are real.)
 */
export const noticeKeyFor = (productKey, version) =>
  `${String(productKey || "").trim().toLowerCase()}@${canonicalVersion(version) || normalizeVersion(version)}`;

/**
 * Did the caller ask for silence? `notifySubscribers: false` in the PUT body
 * (the string "false" too, since not every script sends real booleans).
 * Absent means yes.
 */
export function wantsNotification(body = {}) {
  const raw = body?.notifySubscribers ?? body?.notify;
  if (raw === undefined || raw === null || raw === "") return true;
  if (raw === false) return false;
  return !/^(false|0|no|off)$/i.test(String(raw).trim());
}

/**
 * The whole rule for "does this deployment announce itself", pure.
 *
 * Only a real, enabled, downloadable build whose version is readable and
 * strictly higher than both what it replaced and anything already announced.
 * Everything else — a re-save of the same version, a manifest-only fix, a
 * rollback, a staged product still switched off, a first-ever deployment, an
 * unreadable version, a demo session — is silence. Silence is recoverable (an
 * admin can announce by hand); a wrong mailshot is not.
 *
 * A build that was staged switched off (or saved before its package was
 * uploaded) and is now switched on is the moment customers can first download
 * it, even at the same version. The build it replaced was never available, so
 * it is no baseline: that case is checked against what has already been
 * announced, and nothing else ("now-downloadable").
 */
export function decideReleaseNotice({ previous, next, body = {}, demoMode = false, lastAnnounced = "" }) {
  if (demoMode) return { notify: false, reason: "demo-mode" };
  if (!wantsNotification(body)) return { notify: false, reason: "notify-subscribers-false" };
  if (!next || next.enabled === false) return { notify: false, reason: "deployment-disabled" };
  if (!String(next.packageUri || "").trim()) return { notify: false, reason: "no-package" };

  const version = normalizeVersion(next.version);
  if (!parseVersion(version)) return { notify: false, reason: "unreadable-version" };

  if (previous && !isDownloadable(previous)) {
    if (lastAnnounced && compareVersions(version, lastAnnounced) <= 0) {
      return { notify: false, reason: "already-announced" };
    }
    return { notify: true, reason: "now-downloadable" };
  }

  const prev = normalizeVersion(previous?.version);
  if (!prev) return { notify: false, reason: "first-deployment" };

  const cmp = compareVersions(version, prev);
  if (cmp === null) return { notify: false, reason: "unreadable-previous-version" };
  if (cmp === 0) return { notify: false, reason: "same-version" };
  if (cmp < 0) return { notify: false, reason: "rollback" };

  if (lastAnnounced && compareVersions(version, lastAnnounced) <= 0) {
    return { notify: false, reason: "already-announced" };
  }
  return { notify: true, reason: "version-increased" };
}

/**
 * Could a customer download this deployment? The same test
 * routes/me.deployments.js applies before it lists a build: switched on and
 * with a package.
 */
export function isDownloadable(deployment) {
  return !!deployment && deployment.enabled !== false && !!String(deployment.packageUri || "").trim();
}

/**
 * Why a notice for `version` must not go out given the deployment as it is
 * now, or "" when it may. The build has to still be downloadable, and at this
 * version or above: a deployment that was deleted, switched off, left with no
 * package, rolled back below the version, or given a version nobody can read
 * means the email would send people to a build the Installation Center no
 * longer offers.
 */
export function withdrawnReason(deployment, version) {
  if (!deployment) return "the deployment was deleted";
  if (deployment.enabled === false) return "the deployment was switched off";
  if (!String(deployment.packageUri || "").trim()) return "the deployment has no package";
  const cmp = compareVersions(deployment.version, version);
  if (cmp === null) return `the deployment's version "${String(deployment.version ?? "")}" cannot be read`;
  if (cmp < 0) return `the deployment is now ${normalizeVersion(deployment.version)}, below ${normalizeVersion(version)}`;
  return "";
}

/* ────────────────────────────────────────────────────────── who gets it ── */

/** Fields the audience query and the send-time re-check need, and no more. */
export const USER_FIELDS =
  "email firstName disabled emailUndeliverable notifications " +
  "entitlements.productKey entitlements.status entitlements.expiresAt";

const startOfToday = (now) => dayjs(now).startOf("day").toDate();

/**
 * The Mongo filter for "holds a live licence for one of these products".
 *
 * Active AND unexpired on the SAME entitlement ($elemMatch), with the expiry
 * read the way routes/me.deployments.js reads it: a licence is good through
 * the end of its expiry day. The campaign and broadcast audiences ignore
 * expiry; this one must not, or a customer who let QUIV lapse in March is told
 * in September to install an update they can no longer download.
 */
export function audienceFilter(productKeys, now = new Date()) {
  return {
    disabled: { $ne: true },
    email: { $exists: true, $ne: "" },
    entitlements: {
      $elemMatch: {
        productKey: { $in: productKeys },
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gte: startOfToday(now) } }],
      },
    },
  };
}

/** The same rule in code, for the re-check at send time. */
export function isEntitlementLive(ent, productKeys, now = new Date()) {
  if (!ent) return false;
  if (!productKeys.includes(String(ent.productKey || "").trim().toLowerCase())) return false;
  if (String(ent.status || "").trim().toLowerCase() !== "active") return false;
  if (!ent.expiresAt) return true;
  const end = dayjs(ent.expiresAt).endOf("day");
  return !(end.isValid() && end.isBefore(dayjs(now)));
}

/**
 * Why this person does or does not get the email. One place, so the tests and
 * the admin preview ask the same question the send loop does.
 *
 * The order follows the mail gate (feat/mail-compliance-gate): address, then
 * account, then licence, then deliverable, then consent — so a bounced
 * address is counted as undeliverable rather than as somebody who opted out.
 *
 * Whether the address was ever confirmed is NOT asked. Everybody who reaches
 * that point holds a live licence for the product, and util/emailGate.js takes
 * the same view of licence holders: "it has paid, so its address has already
 * worked". Confirmation codes only began on 1 Sep 2026 and User.emailVerified
 * defaults to false, so most customers who bought before then are unconfirmed,
 * and a verified-only rule would leave them out of every release email. The
 * bounce guard is emailUndeliverable, set from SES's own bounce feedback, with
 * SES's suppression list behind it.
 *
 * Consent is User.notifications.productUpdates, the switch the settings
 * screen labels "When a build ships for something you are licensed for". Read
 * as `=== false`: accounts created before the field existed have no value and
 * are opted in, which is the field's own default. A spam complaint switches it
 * off (util/mailFeedback.js). The marketing switch is not consulted — telling
 * a customer their paid software has an update is not marketing, and it has
 * its own off switch.
 */
export function classifyRecipient(user, { productKeys, now = new Date() } = {}) {
  const email = String(user?.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "no-address";
  if (user.disabled) return "disabled";
  if (!(user.entitlements || []).some((e) => isEntitlementLive(e, productKeys, now))) {
    return "no-entitlement";
  }
  if (user.emailUndeliverable) return "undeliverable";
  if (user.notifications?.productUpdates === false) return "opted-out";
  return "send";
}

const SKIP_BUCKET = {
  "opted-out": "optedOut",
  undeliverable: "undeliverable",
  "no-entitlement": "noEntitlement",
  disabled: "disabled",
  "no-address": "noAddress",
  "address-changed": "addressChanged",
};

/** Who gets it and why the rest do not, from a list of users. */
export function splitAudience(users = [], { productKeys, now = new Date() } = {}) {
  const recipients = [];
  const skipped = {};
  for (const u of users) {
    const why = classifyRecipient(u, { productKeys, now });
    if (why === "send") recipients.push(u);
    else skipped[SKIP_BUCKET[why] || why] = (skipped[SKIP_BUCKET[why] || why] || 0) + 1;
  }
  return { recipients, skipped };
}

/* ─────────────────────────────────────────────────────────────── SES ── */

/**
 * Can this account reach customers? From GetAccount, before any send.
 *
 * Strict: production access has to be positively true. An account that does
 * not say so is treated as the sandbox, because in the sandbox every customer
 * send is refused and the whole run would be a list of failures.
 */
export function sesAccountVerdict(acct = {}, region = "") {
  const where = region || process.env.SES_REGION || process.env.AWS_REGION || "eu-west-1";
  if (acct?.SendingEnabled === false || acct?.EnforcementStatus === "SHUTDOWN") {
    return {
      ok: false,
      code: "ses-paused",
      message:
        `SES sending is paused for this account in ${where} (enforcement: ` +
        `${acct?.EnforcementStatus || "unknown"}). Nothing was sent. Resolve the pause, then resume this notice.`,
    };
  }
  if (acct?.ProductionAccessEnabled !== true) {
    return {
      ok: false,
      code: "ses-sandbox",
      message:
        `SES is still in the sandbox in ${where}: it only delivers to verified addresses, so customers ` +
        "cannot be reached. Nothing was sent. Request production access, then resume this notice.",
    };
  }

  const max24 = Number(acct?.SendQuota?.Max24HourSend);
  const sent24 = Number(acct?.SendQuota?.SentLast24Hours);
  const remaining24h =
    Number.isFinite(max24) && max24 > 0
      ? Math.max(0, Math.floor(max24 - (Number.isFinite(sent24) ? sent24 : 0)))
      : null;

  const override = Number(process.env.MAIL_SEND_RATE_PER_SEC);
  const max = Number(acct?.SendQuota?.MaxSendRate);
  const ratePerSecond =
    Number.isFinite(override) && override > 0
      ? override
      : Number.isFinite(max) && max > 0
        ? Math.max(1, Math.floor(max * 0.9))
        : 1;

  return { ok: true, code: "ok", message: "", ratePerSecond, remaining24h };
}

const errText = (err) =>
  `${err?.name && err.name !== "Error" ? `${err.name}: ` : ""}${err?.message || err || "unknown error"}`.slice(0, 500);

/**
 * What a failed send means:
 *   "retry"     transient (throttling, 5xx, network): not this person's fault.
 *               Whether the SAME message may go again is neverAccepted()'s
 *               question, not this one's.
 *   "pause"     the daily quota is spent; stop, keep the queue, carry on later
 *   "account"   SES refuses this account or sender; stop and report
 *   "recipient" this address or message; record it and move on
 */
export function classifySesError(err) {
  const name = String(err?.name || err?.Code || "");
  const msg = String(err?.message || "");
  const code = String(err?.code || "");

  if (/daily (sending|message) quota|24.?hour|sending quota exceeded/i.test(msg)) return "pause";

  if (
    /AccessDenied|AccountSuspended|SendingPaused|MailFromDomainNotVerified|NotFoundException|InvalidClientTokenId|UnrecognizedClient|ExpiredToken|CredentialsProviderError|SignatureDoesNotMatch|ConfigurationSetDoesNotExist/i.test(
      name,
    )
  ) {
    return "account";
  }
  // The sandbox answer: "Email address is not verified. The following
  // identities failed the check in region EU-WEST-1: ..."
  if (/MessageRejected/i.test(name) && /not verified|sandbox|identit/i.test(msg)) return "account";

  if (isRetryableSesError(err)) return "retry";
  if (
    /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|EAI_AGAIN|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|socket hang up|TimeoutError|RequestTimeout|NetworkingError/i.test(
      `${name} ${code} ${msg}`,
    )
  ) {
    return "retry";
  }
  return "recipient";
}

/**
 * Did SES certainly NOT take this message? Then sending it again cannot
 * deliver it twice.
 *
 * True for throttling (refused at the door, before anything is accepted) and
 * for a connection that was never made (refused, no route, name not found).
 * False for a timeout, a reset, a hang-up or a 5xx: by then the request may
 * have gone out and SES may have accepted the message and lost only its
 * answer, so the row is left in flight rather than sent again on a guess.
 */
export function neverAccepted(err) {
  const name = String(err?.name || err?.Code || "");
  if (/Throttling|TooManyRequests|LimitExceeded/i.test(name)) return true;
  if (Number(err?.$metadata?.httpStatusCode) === 429) return true;
  return /^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/.test(String(err?.code || ""));
}

/**
 * One message, sent again only when SES certainly did not take it (see
 * neverAccepted). Never throws. `send` is expected to make one request per
 * call (sendViaSesOnce), so this loop is the only retry there is.
 */
export async function sendWithRetry(send, message, { attempts = MAX_ATTEMPTS, pause = sleep } = {}) {
  let last;
  const n = Math.max(1, attempts);
  for (let attempt = 1; attempt <= n; attempt += 1) {
    try {
      const messageId = await send(message);
      return { ok: true, messageId: String(messageId || ""), attempts: attempt };
    } catch (err) {
      last = err;
      if (classifySesError(err) !== "retry" || !neverAccepted(err) || attempt === n) break;
      await pause(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  return { ok: false, error: last };
}

/* ──────────────────────────────────────────────────────────────── notes ── */

/**
 * What the mail says has changed, in order of preference: notes passed with
 * the deployment; the What's New entry for exactly this version; one honest
 * generic line. Always with a link to the product's What's New page.
 */
export async function resolveNotes({ store = mongoStore, product, version, releaseNotes, log = console }) {
  const moreUrl = whatsNewUrl(product.slug);

  const given = Array.isArray(releaseNotes)
    ? releaseNotes.some((s) => String(s ?? "").trim())
    : typeof releaseNotes === "string" && releaseNotes.trim();
  if (given) {
    const n = notesFromMarkdown(releaseNotes);
    if (n.groups.length || n.paragraphs.length) return { ...n, moreUrl };
  }

  if (product.slug) {
    try {
      const doc = await store.changelogFor(product.slug);
      const n = notesFromChangelog(doc, version);
      if (n) return { ...n, moreUrl };
    } catch (err) {
      log.warn?.(`[release-mail] could not read What's New for ${product.slug}: ${err?.message || err}`);
    }
  }

  return { ...genericNotes(product), moreUrl };
}

/* ───────────────────────────────────────────────────────── the trigger ── */

/**
 * Cancel every unfinished announcement for a product whose build customers
 * can no longer download: a PUT that switched it off or left it with no
 * package, or DELETE /admin/deployments/<key>. Nobody should be told to
 * install a build that was pulled. Returns the keys it cancelled. Never sends.
 */
export async function recordDeploymentWithdrawn({
  productKey,
  reason = "Deployment withdrawn",
  demoMode = false,
  store = mongoStore,
  log = console,
}) {
  if (demoMode) return [];
  const pk = String(productKey || "").trim().toLowerCase();
  if (!pk) return [];
  const cancelled = await store.closeOpenNotices(pk, {
    match: () => true,
    set: { status: "cancelled", cancelledReason: reason },
  });
  if (cancelled.length) log.log?.(`[release-mail] ${pk}: ${reason}; cancelled ${cancelled.join(", ")}`);
  return cancelled;
}

/** Back in the queue after a cancel, with the hold starting again. */
async function reopenIfCancelled(store, key, notice, now) {
  if (notice?.status !== "cancelled") return notice;
  return (
    (await store.setNotice(key, { status: "pending", cancelledReason: "", openedAt: now() }, "cancelled")) ||
    notice
  );
}

/**
 * Called by the deployment PUT with the document before and after the write.
 *
 * Records at most one notice, never sends, and returns a small summary the
 * PUT hands back to the release script. Also does the tidy-ups a change of
 * build implies: a PUT that switches the product off or leaves it with no
 * package cancels every unfinished announcement of it, a rollback cancels any
 * unfinished announcement of the versions above it (nobody should be told to
 * install a build that was pulled), and a new version supersedes unfinished
 * announcements of older ones (nobody needs 3.1.11 and 3.1.12 in the same
 * morning).
 */
export async function recordDeploymentRelease({
  previous,
  item,
  body = {},
  demoMode = false,
  actor = "",
  // "organizations" while the build is only with firms (util/releaseRollout.js).
  audience = "everyone",
  store = mongoStore,
  log = console,
  now = () => new Date(),
}) {
  if (demoMode) return { created: false, reason: "demo-mode" };
  const forFirms = audience === ROLLOUT_ORGANIZATIONS;

  const productKey = String(item?.productKey || "").trim().toLowerCase();
  const version = normalizeVersion(item?.version);
  const prevVersion = normalizeVersion(previous?.version);
  const out = { created: false, productKey, version, previousVersion: prevVersion };

  if (!isDownloadable(item)) {
    out.cancelled = await recordDeploymentWithdrawn({
      productKey,
      reason: item?.enabled === false ? "Deployment switched off" : "Deployment has no package",
      store,
      log,
    });
  } else if (prevVersion && version && compareVersions(version, prevVersion) < 0) {
    out.cancelled = await store.closeOpenNotices(productKey, {
      match: (v) => compareVersions(v, version) > 0,
      set: { status: "cancelled", cancelledReason: `Deployment rolled back to ${version}` },
    });
  }

  // A release for everyone is measured against what everyone has been told,
  // not against a newer build only firms have heard about: a hotfix to 3.1.12
  // while 4.0.0 is with firms must still reach single users.
  const lastAnnounced = await store.lastAnnouncedVersion(productKey, { everyoneOnly: !forFirms });
  const decision = decideReleaseNotice({ previous, next: item, body, demoMode, lastAnnounced });
  out.reason = decision.reason;
  if (!decision.notify) return out;

  const product = productFor(productKey, item?.displayName);
  const key = noticeKeyFor(productKey, version);
  const notes = await resolveNotes({ store, product, version, releaseNotes: body?.releaseNotes, log });

  const { notice, created } = await store.insertNotice({
    key,
    productKey,
    version,
    previousVersion: prevVersion,
    productName: product.name,
    notes,
    status: "pending",
    source: "deployment",
    audience: forFirms ? ROLLOUT_ORGANIZATIONS : "everyone",
    createdBy: actor,
    openedAt: now(),
  });

  // The same version came back after a rollback or a switch-off cancelled it
  // (however it is spelt this time: the key is canonical): announce it again.
  // Rows already sent stay sent, so nobody hears about it twice.
  const current = created ? notice : await reopenIfCancelled(store, key, notice, now);

  out.superseded = await store.closeOpenNotices(productKey, {
    exceptKey: key,
    // A firms-only notice replaces only older firms-only notices: an email to
    // everyone about a hotfix still has to go.
    match: (v, n) => compareVersions(v, version) < 0 && (!forFirms || n?.audience === ROLLOUT_ORGANIZATIONS),
    set: { status: "superseded", supersededBy: key },
  });

  log.log?.(
    `[release-mail] ${key}: ${created ? "recorded" : "already recorded"} (${current?.status}), ` +
      `notes from ${notes.source}`,
  );

  return {
    ...out,
    created,
    key,
    id: current?._id ? String(current._id) : "",
    status: current?.status || "pending",
    notesSource: notes.source,
  };
}

/**
 * The firms' build has gone to everyone (util/releaseGateFlow.js,
 * releaseToEveryone): its email is widened to every licence holder. The
 * audience is enrolled again on the next run; the ledger's unique
 * (noticeKey, emailHash) index keeps everyone the firms' run already reached
 * from hearing about it twice. A notice that was cancelled or superseded stays
 * as it is. Never sends.
 */
export async function widenReleaseNotice({ productKey, version, actor = "", store = mongoStore, now = () => new Date(), log = console }) {
  const key = noticeKeyFor(productKey, version);
  const notice = await store.findNotice(key);
  if (!notice) return { widened: false, key, reason: "no-notice" };
  if (notice.audience !== ROLLOUT_ORGANIZATIONS) return { widened: false, key, reason: "already-everyone" };
  if (notice.status === "cancelled" || notice.status === "superseded") {
    return { widened: false, key, reason: `notice-${notice.status}` };
  }
  const set = { audience: "everyone", enrolledAt: null, widenedBy: actor, widenedAt: now() };
  let where = OPEN_STATUSES;
  if (notice.status === "done") {
    Object.assign(set, { status: "pending", openedAt: now(), finishedAt: null });
    where = "done";
  }
  const updated = await store.setNotice(key, set, where);
  log.log?.(`[release-mail] ${key}: widened to everyone (${updated?.status || notice.status})`);
  return { widened: !!updated, key, status: updated?.status || notice.status };
}

/** A build taken back from firms: its unfinished firms-only email stops. */
export async function cancelEarlyNotices({ productKey, reason = "Taken back from firms", store = mongoStore }) {
  return store.closeOpenNotices(String(productKey || "").trim().toLowerCase(), {
    match: (_v, n) => n?.audience === ROLLOUT_ORGANIZATIONS,
    set: { status: "cancelled", cancelledReason: reason },
  });
}

const conflict = (message, details = {}) => Object.assign(new Error(message), { status: 409, details });

/**
 * An admin announcing a version by hand: one the PUT stayed silent about
 * (notifySubscribers:false, a first release), or a notice to try again under a
 * version that was cancelled.
 *
 * The same rules as the PUT, so a manual notice cannot mail anybody twice:
 * the key is canonical ("3.2" is "3.2.0"), and a version that is not above
 * everything already announced (anything not cancelled) is refused with 409
 * rather than recorded again under another spelling. A notice SES refused is
 * resumed with POST .../send, not re-created. And the build has to be one
 * customers can download now, at this version or above.
 */
export async function createManualNotice({
  productKey,
  version,
  releaseNotes,
  displayName = "",
  actor = "",
  store = mongoStore,
  log = console,
  now = () => new Date(),
}) {
  const key0 = String(productKey || "").trim().toLowerCase();
  const v = normalizeVersion(version);
  if (!key0) throw Object.assign(new Error("productKey is required"), { status: 400 });
  if (!parseVersion(v)) {
    throw Object.assign(new Error(`"${version}" is not a version (expected e.g. 3.1.11)`), { status: 400 });
  }

  const product = productFor(key0, displayName);
  const key = noticeKeyFor(key0, v);

  const lastAnnounced = await store.lastAnnouncedVersion(key0);
  if (lastAnnounced && compareVersions(v, lastAnnounced) <= 0) {
    const existingKey = noticeKeyFor(key0, lastAnnounced);
    const existing = await store.findNotice(existingKey);
    throw conflict(
      compareVersions(v, lastAnnounced) === 0
        ? `${product.name} ${lastAnnounced} is already announced (${existingKey}, ${existing?.status || "recorded"}). ` +
            "Nothing new was created. To resume it, POST .../send; to mail failed rows again, POST .../retry-failed."
        : `${product.name} ${lastAnnounced} has already been announced, which is newer than ${v}. Nothing was created.`,
      { code: "already-announced", key: existingKey, lastAnnounced, status: existing?.status || "" },
    );
  }

  const withdrawn = withdrawnReason(await store.deploymentFor(key0), v);
  if (withdrawn) {
    throw conflict(`Customers cannot download ${product.name} ${v}: ${withdrawn}. Nothing was created.`, {
      code: "not-downloadable",
      key,
    });
  }

  const notes = await resolveNotes({ store, product, version: v, releaseNotes, log });
  const { notice, created } = await store.insertNotice({
    key,
    productKey: key0,
    version: v,
    previousVersion: "",
    productName: product.name,
    notes,
    status: "pending",
    source: "manual",
    createdBy: actor,
    openedAt: now(),
  });

  const current = created ? notice : await reopenIfCancelled(store, key, notice, now);
  const superseded = await store.closeOpenNotices(key0, {
    exceptKey: key,
    match: (x) => compareVersions(x, v) < 0,
    set: { status: "superseded", supersededBy: key },
  });
  return { created, key, id: current?._id ? String(current._id) : "", status: current?.status, superseded };
}

/* ───────────────────────────────────────────────────────── the message ── */

function messageFor({ notice, product, user, email }) {
  const unsubscribeUrl = productUpdatesUnsubscribeUrl(user._id);
  const replyTo = replyToAddress();
  const m = buildReleaseMessage({
    firstName: user.firstName,
    product,
    version: notice.version,
    notes: notice.notes,
    unsubscribeUrl,
    replyTo,
  });
  return {
    from: fromAddress(),
    to: [email],
    ...(replyTo ? { replyTo } : {}),
    subject: m.subject,
    html: m.html,
    text: m.text,
    // Gmail's and Yahoo's own unsubscribe button, and the one-click POST the
    // product-updates route answers.
    listUnsubscribe: unsubscribeUrl,
  };
}

const productOf = (notice) => productFor(notice.productKey, notice.productName);

/* ────────────────────────────────────────────────────────── the preview ── */

/**
 * Who would get it and what it would say, for a product and version. Reads,
 * renders, and neither sends nor writes. The admin preview endpoint and
 * DRY_RUN both come through here, so a preview proves the real audience and
 * the real template.
 */
export async function previewRelease({
  productKey,
  version,
  releaseNotes,
  displayName = "",
  notes = null,
  store = mongoStore,
  now = () => new Date(),
  log = console,
}) {
  const product = productFor(productKey, displayName);
  const v = normalizeVersion(version);
  const resolved = notes || (await resolveNotes({ store, product, version: v, releaseNotes, log }));
  const users = await store.audience(product.audienceKeys, now());
  const { recipients, skipped } = splitAudience(users, { productKeys: product.audienceKeys, now: now() });

  // Rendered for a placeholder, never for a real customer: the preview's
  // unsubscribe link is live, and an admin clicking around a preview must not
  // be able to switch somebody's mail off. The zero id resolves to nobody.
  const sampleUser = { _id: "000000000000000000000000", firstName: "", email: "" };
  const m = messageFor({
    notice: { version: v, notes: resolved },
    product,
    user: sampleUser,
    email: "customer@example.com",
  });

  return {
    productKey: product.key,
    version: v,
    key: noticeKeyFor(product.key, v),
    product: { name: product.name, slug: product.slug, hostApps: product.hostApps, audienceKeys: product.audienceKeys },
    notesSource: resolved.source,
    matched: users.length,
    recipients: recipients.length,
    skipped,
    subject: m.subject,
    html: m.html,
    text: m.text,
    from: m.from,
    listUnsubscribe: m.listUnsubscribe,
  };
}

/* ─────────────────────────────────────────────────────────── the send ── */

const TERMINAL = new Set(["done", "cancelled", "superseded"]);

/**
 * Is the build this notice announces still downloadable? Asked of the
 * deployment itself, not trusted from the PUT and DELETE hooks, which a
 * missed hook, the admin UI or a direct edit could get round. "" when it is.
 */
async function withdrawnNow(store, notice) {
  // A build still with firms is downloadable (by them): read the deployment
  // at the top of its rollout (util/releaseRollout.js).
  return withdrawnReason(newestOffered(await store.deploymentFor(notice.productKey)), notice.version);
}

/**
 * Work through one notice: at most `limit` messages, and stop before
 * `deadlineAt`. Safe to call again and again, from anywhere, at the same time:
 * every row is claimed before it is mailed, so nothing is ever sent twice.
 *
 * `resume` lets a failed notice (SES refused) go again. The admin endpoint
 * passes it — pressing Send is the decision to retry. The fifteen-minute job
 * does not, so a sandboxed account is not asked every quarter of an hour.
 *
 * Before the notice is taken, and again before every batch, the deployment is
 * read: if customers can no longer download this version the notice is
 * cancelled and nothing more is sent.
 */
export async function sendReleaseNotice(
  idOrKey,
  {
    store = mongoStore,
    send = sendViaSesOnce,
    sesAccount = getSesAccount,
    limit = 200,
    deadlineAt = Date.now() + 40_000,
    resume = false,
    dryRun = isDryRun(),
    now = () => new Date(),
    log = console,
    pause = sleep,
  } = {},
) {
  const notice = await store.findNotice(idOrKey);
  if (!notice) return { ok: false, error: "not-found" };
  const key = notice.key;

  if (TERMINAL.has(notice.status)) {
    return { ok: true, skipped: true, key, reason: `already-${notice.status}` };
  }
  if (notice.status === "failed" && !resume) {
    return { ok: true, skipped: true, key, reason: "failed-needs-resume", error: notice.error };
  }

  // Before anything is claimed: a run whose opt-out links would point at
  // localhost must not start. Throws, and the notice stays as it was.
  assertUnsubscribeLinksWork();

  const product = productOf(notice);
  const productKeys = product.audienceKeys;

  /* ── is the build still there? ── */
  const withdrawn = await withdrawnNow(store, notice);
  if (withdrawn) {
    if (dryRun) {
      log.log?.(`[release-mail] DRY RUN ${key}: would be cancelled, ${withdrawn}. Nothing sent, nothing written.`);
      return { ok: true, dryRun: true, skipped: true, key, reason: "deployment-withdrawn", error: withdrawn };
    }
    const cancelled = await store.setNotice(
      key,
      { status: "cancelled", cancelledReason: `Not sent: ${withdrawn}`, lastRunAt: now() },
      OPEN_STATUSES,
    );
    log.warn?.(`[release-mail] ${key} cancelled before sending: ${withdrawn}`);
    return {
      ok: true,
      skipped: true,
      key,
      status: cancelled?.status || "cancelled",
      reason: "deployment-withdrawn",
      error: withdrawn,
      counts: await store.counts(key),
    };
  }

  if (dryRun) {
    const p = await previewRelease({
      productKey: notice.productKey,
      version: notice.version,
      displayName: notice.productName,
      notes: notice.notes,
      store,
      now,
      log,
    });
    log.log?.(
      `[release-mail] DRY RUN ${key}: would mail ${p.recipients} of ${p.matched} licence holders ` +
        `(${JSON.stringify(p.skipped)}); "${p.subject}". Nothing sent, nothing written.`,
    );
    return { ok: true, dryRun: true, key, recipients: p.recipients, skipped: p.skipped, subject: p.subject };
  }

  /* ── can SES reach customers at all? ── */
  let verdict;
  try {
    verdict = sesAccountVerdict(await sesAccount());
  } catch (err) {
    if (classifySesError(err) === "retry") {
      // SES having a moment is not a verdict on the account. Leave the notice
      // as it was; the next call asks again.
      log.warn?.(`[release-mail] ${key}: could not read the SES account (${errText(err)}); will try again`);
      return {
        ok: false,
        key,
        retryLater: true,
        code: "ses-account-unreachable",
        status: notice.status,
        sent: 0,
        error: errText(err),
        counts: await store.counts(key),
      };
    }
    verdict = { ok: false, code: "ses-account-unreadable", message: `Could not read the SES account: ${errText(err)}. Nothing was sent.` };
  }
  if (!verdict.ok) {
    await store.setNotice(
      key,
      { status: "failed", error: verdict.message, errorCode: verdict.code, failedAt: now(), lastRunAt: now() },
      OPEN_STATUSES,
    );
    log.error?.(`[release-mail] ${key} STOPPED: ${verdict.message}`);
    return {
      ok: false,
      key,
      stopped: true,
      status: "failed",
      code: verdict.code,
      error: verdict.message,
      sent: 0,
      counts: await store.counts(key),
    };
  }

  /* ── take it ── */
  const firstStart = notice.status === "pending";
  const claimed = await store.setNotice(
    key,
    { status: "sending", startedAt: notice.startedAt || now(), lastRunAt: now() },
    resume ? ["pending", "sending", "failed"] : ["pending", "sending"],
  );
  if (!claimed) return { ok: true, skipped: true, key, reason: "status-changed" };
  let working = claimed;

  // The What's New page often lands an hour after the build. If nothing has
  // been sent yet and the notes were not given with the release, look again.
  if (firstStart && working.notes?.source !== "request") {
    const fresh = await resolveNotes({ store, product, version: working.version, log });
    if (fresh.source === "changelog" || !working.notes?.source) {
      working = (await store.setNotice(key, { notes: fresh })) || { ...working, notes: fresh };
    }
  }

  /* ── write the audience down, once ── */
  if (!working.enrolledAt) {
    let users = await store.audience(productKeys, now());
    // While the build is only with firms, only their accounts are enrolled;
    // the rest are enrolled when the notice is widened to everyone.
    if (working.audience === ROLLOUT_ORGANIZATIONS) {
      const ring = new Set((await store.earlyRingUserIds(now())).map(String));
      users = users.filter((u) => ring.has(String(u._id)));
    }
    const seen = new Set();
    const rows = [];
    for (const u of users) {
      const email = String(u.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const why = classifyRecipient(u, { productKeys, now: now() });
      rows.push({
        noticeKey: key,
        userId: u._id,
        email,
        emailHash: hashRecipient(email),
        status: why === "send" ? "pending" : "skipped",
        skipReason: why === "send" ? "" : why,
      });
    }
    await store.enrol(rows);
    working = (await store.setNotice(key, { enrolledAt: now() })) || working;
    log.log?.(`[release-mail] ${key}: enrolled ${rows.length} licence holder(s)`);
  }

  /* ── send ── */
  const ratePerSecond = verdict.ratePerSecond;
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Math.ceil(ratePerSecond)));
  // About ten seconds of sending per batch, so the deadline is checked often
  // enough to be kept even at a sandbox-slow rate.
  const batchSize = Math.max(5, Math.min(BATCH_SIZE, Math.floor(ratePerSecond * 10)));
  const quotaCap = verdict.remaining24h == null ? Infinity : Math.max(0, verdict.remaining24h - 10);
  const budget = Math.max(0, Math.min(Number(limit) || 0, quotaCap));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let inDoubt = 0;
  let stop = null;

  while (!stop && sent + failed < budget && Date.now() < deadlineAt) {
    const still = await store.findNotice(key);
    if (still?.status !== "sending") {
      stop = { kind: "status", reason: `notice is ${still?.status}` };
      break;
    }

    // Pulled halfway through a mailshot: stop before the next batch.
    const pulled = await withdrawnNow(store, still);
    if (pulled) {
      await store.setNotice(
        key,
        { status: "cancelled", cancelledReason: `Stopped after ${sent} sent this run: ${pulled}` },
        "sending",
      );
      log.warn?.(`[release-mail] ${key} cancelled mid-run: ${pulled}`);
      stop = { kind: "status", reason: pulled };
      break;
    }

    const batch = await store.pendingBatch(key, Math.min(batchSize, budget - sent - failed));
    if (!batch.length) break;

    // Consent and licences are read again now, not trusted from enrolment:
    // somebody who switched these off five minutes ago has said no.
    const users = await store.usersByIds(batch.map((r) => r.userId).filter(Boolean));
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const due = [];
    for (const row of batch) {
      const user = byId.get(String(row.userId));
      let why = user ? classifyRecipient(user, { productKeys, now: now() }) : "no-address";
      // A changed address is not one this person still owns for certain.
      if (why === "send" && String(user.email).trim().toLowerCase() !== row.email) why = "address-changed";
      if (why !== "send") {
        if (await store.settle(row._id, { status: "skipped", skipReason: why }, "pending")) skipped += 1;
        continue;
      }
      due.push({ row, user });
    }

    await mapWithPool(
      due,
      async ({ row, user }) => {
        if (stop) return; // the run is stopping; leave the row in the queue
        if (!(await store.claim(row._id, now()))) return; // another run has it

        const r = await sendWithRetry(send, messageFor({ notice: working, product, user, email: row.email }), {
          pause,
        });

        if (r.ok) {
          await store.settle(row._id, { status: "sent", sentAt: now(), messageId: r.messageId, error: "" }, "sending");
          store.logSend({ email: row.email, ok: true, messageId: r.messageId });
          sent += 1;
          return;
        }

        const kind = classifySesError(r.error);
        if (kind === "account" || kind === "pause" || (kind === "retry" && neverAccepted(r.error))) {
          // SES did not take it and it is not this person's doing: back in
          // the queue, and the run stops. Still throttled after every
          // attempt, or SES unreachable, is a pause, not a failure: the
          // notice stays "sending" and the next run carries on.
          await store.settle(row._id, { status: "pending", error: errText(r.error) }, "sending");
          if (!stop) stop = { kind: kind === "retry" ? "transient" : kind, error: r.error };
          return;
        }

        if (kind === "retry") {
          // A timeout, a reset or a 5xx after the request went out: SES may
          // have accepted this one. Left in flight, exactly like a run that
          // died here, for an admin to re-queue (retry-failed with
          // includeInFlight) or not. Not a failure, and not counted towards
          // "every send refused": SES is having a moment, so the run pauses.
          await store.settle(row._id, { error: `In doubt: ${errText(r.error)}` }, "sending");
          inDoubt += 1;
          if (!stop) stop = { kind: "transient", error: r.error };
          return;
        }

        await store.settle(row._id, { status: "failed", error: errText(r.error) }, "sending");
        store.logSend({ email: row.email, ok: false });
        failed += 1;
        if (!stop && sent === 0 && failed >= REFUSALS_BEFORE_STOP) {
          stop = {
            kind: "account",
            error: Object.assign(
              new Error(`The first ${failed} sends were all refused; last: ${errText(r.error)}`),
              { name: "AllSendsRefused" },
            ),
          };
        }
      },
      { concurrency, ratePerSecond, sleep: pause },
    );
  }

  if (!stop && Number.isFinite(quotaCap) && sent + failed >= quotaCap) {
    stop = { kind: "pause", error: new Error("Daily sending quota reached; the rest go on the next run.") };
  }

  /* ── settle the notice ── */
  const counts = await store.counts(key);
  const set = { counts, lastRunAt: now() };
  let status = "sending";

  if (stop?.kind === "account") {
    status = "failed";
    Object.assign(set, {
      status,
      error: `SES refused the send: ${errText(stop.error)}. Nothing further was sent.`,
      errorCode: String(stop.error?.name || "ses-refused"),
      failedAt: now(),
    });
    log.error?.(`[release-mail] ${key} STOPPED after ${sent} sent: ${errText(stop.error)}`);
  } else if (stop?.kind === "pause") {
    set.error = errText(stop.error);
    set.errorCode = "ses-daily-quota";
    log.warn?.(`[release-mail] ${key} paused: ${errText(stop.error)}`);
  } else if (stop?.kind === "transient") {
    // Not a refusal: the notice stays "sending" and the next run (or the
    // next POST .../send) carries on from the queue.
    const throttled = neverAccepted(stop.error);
    set.error =
      `SES ${throttled ? "was throttling or could not be reached" : "did not answer"} ` +
      `(${errText(stop.error)}); paused, the rest go on the next run` +
      (inDoubt ? `. ${inDoubt} message(s) in doubt are left in flight, not sent again.` : ".");
    set.errorCode = throttled ? "ses-throttled" : "ses-unavailable";
    log.warn?.(`[release-mail] ${key} paused: ${set.error}`);
  } else if (stop?.kind === "status") {
    status = (await store.findNotice(key))?.status || "unknown";
  } else if (counts.pending === 0) {
    status = "done";
    Object.assign(set, { status, finishedAt: now() });
  }

  const statusGuard = stop?.kind === "status" ? null : "sending";
  await store.setNotice(key, set, statusGuard);

  log.log?.(
    `[release-mail] ${key}: ${sent} sent, ${failed} failed, ${skipped} skipped, ${inDoubt} in doubt this run; ` +
      `${counts.sent}/${counts.total} sent overall, ${counts.pending} still to go (${status})`,
  );

  return {
    ok: status !== "failed",
    key,
    status,
    sent,
    failed,
    skipped,
    inDoubt,
    counts,
    ...(stop?.kind === "account" ? { stopped: true, error: set.error, code: set.errorCode } : {}),
    ...(stop?.kind === "pause" ? { paused: true, error: set.error, code: set.errorCode } : {}),
    ...(stop?.kind === "transient" ? { paused: true, retryLater: true, error: set.error, code: set.errorCode } : {}),
    ...(stop?.kind === "status" && status === "cancelled" ? { cancelled: true, reason: stop.reason } : {}),
  };
}

/* ────────────────────────────────────────────────────────── the drain ── */

async function acquireJobLock(lockId, ttlMinutes) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const col = mongoose.connection.collection("job_locks");
  const upd = await col.findOneAndUpdate(
    { _id: lockId, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }] },
    { $set: { expiresAt, lockedAt: now } },
    { returnDocument: "after" },
  );
  if (upd) return true;
  try {
    await col.insertOne({ _id: lockId, expiresAt, lockedAt: now });
    return true;
  } catch {
    return false;
  }
}

async function releaseJobLock(lockId) {
  try {
    await mongoose.connection.collection("job_locks").deleteOne({ _id: lockId });
  } catch {
    /* an unreleased lock expires on its own */
  }
}

/** Five minutes by default, and never past the deadline the caller gives. */
export const DRAIN_BUDGET_MS = Number(process.env.RELEASE_DRAIN_BUDGET_MS || 5 * 60 * 1000);

/**
 * Every notice still owed a send, oldest first, until the time runs out.
 *
 * Rides on the fifteen-minute video-poll invocation (scheduled.js), so a
 * release that nobody pushed by hand still goes out within a quarter of an
 * hour, with no new schedule and no change to the AdlmApi stack. The lock TTL
 * (10 min) outlives VideoPollFn's 9-minute timeout, so a run killed mid-way
 * cannot leave the lock held against the next one for long.
 *
 * A notice still pending and younger than `holdMs` (RELEASE_HOLD_MS, ten
 * minutes) is left for a later run: the release script that recorded it may
 * still be checking the build it published, and cancels on a failed check.
 * A notice already sending (started by hand) is not held. So an unattended
 * release goes out 10 to 25 minutes after its PUT.
 */
export async function runReleaseNoticeDrain({
  store = mongoStore,
  deadlineAt,
  lock = true,
  log = console,
  holdMs = releaseHoldMs(),
  now = () => new Date(),
  ...sendOptions
} = {}) {
  const until = deadlineAt ?? Date.now() + DRAIN_BUDGET_MS;
  const LOCK = "release-notices";

  if (lock && !(await acquireJobLock(LOCK, 10))) {
    log.warn?.("[release-mail] another drain holds the lock; skipping");
    return { ok: true, skipped: true, reason: "lock-held" };
  }

  try {
    const open = await store.listOpenNotices();
    const results = [];
    const held = [];
    for (const n of open) {
      if (Date.now() >= until - 5000) break;
      const openedAt = new Date(n.openedAt || n.createdAt || 0).getTime();
      if (n.status === "pending" && holdMs > 0 && now().getTime() - openedAt < holdMs) {
        held.push(n.key);
        continue;
      }
      let r;
      try {
        r = await sendReleaseNotice(n.key, { store, deadlineAt: until, limit: 100_000, log, now, ...sendOptions });
      } catch (err) {
        r = { ok: false, error: String(err?.message || err) };
        log.error?.(`[release-mail] ${n.key} failed: ${r.error}`);
      }
      results.push({ key: n.key, ...r });
      // A refusal from SES, SES pausing us (quota, throttling, no answer), or
      // a configuration that throws, will say the same thing about every
      // other notice. Ask once per run, not once per notice.
      if (r.stopped || r.paused || r.retryLater || (!r.ok && !r.skipped)) break;
    }
    if (held.length) log.log?.(`[release-mail] held (younger than ${Math.round(holdMs / 60000)} min): ${held.join(", ")}`);
    return { ok: true, open: open.length, held, results };
  } finally {
    if (lock) await releaseJobLock(LOCK);
  }
}

/* ──────────────────────────────────────────────────────────── the store ── */

export function tallyCounts(rows = []) {
  const c = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, skippedBy: {} };
  for (const { status, skipReason, n } of rows) {
    c.total += n;
    if (status in c && status !== "skippedBy" && status !== "total") c[status] += n;
    if (status === "skipped") {
      const b = SKIP_BUCKET[skipReason] || skipReason || "other";
      c.skippedBy[b] = (c.skippedBy[b] || 0) + n;
    }
  }
  return c;
}

const isDup = (err) =>
  err?.code === 11000 ||
  (Array.isArray(err?.writeErrors) && err.writeErrors.every((e) => (e?.err?.code ?? e?.code) === 11000));

/** The Mongo half. Thin on purpose: every rule lives in the functions above. */
export const mongoStore = {
  async findNotice(idOrKey) {
    const s = String(idOrKey || "").trim();
    if (!s) return null;
    if (/^[0-9a-f]{24}$/i.test(s)) {
      const byId = await ReleaseNotice.findById(s).lean();
      if (byId) return byId;
    }
    return ReleaseNotice.findOne({ key: s }).lean();
  },

  /** Insert once; a second insert of the same key returns the first. */
  async insertNotice(doc) {
    // The unique index is the guarantee, so it must exist before the first
    // insert on a new collection, not whenever autoIndex gets round to it.
    await ReleaseNotice.init();
    try {
      const created = await ReleaseNotice.create(doc);
      return { notice: created.toObject(), created: true };
    } catch (err) {
      if (!isDup(err)) throw err;
      return { notice: await ReleaseNotice.findOne({ key: doc.key }).lean(), created: false };
    }
  },

  async lastAnnouncedVersion(productKey, { everyoneOnly = false } = {}) {
    const filter = { productKey, status: { $ne: "cancelled" } };
    if (everyoneOnly) filter.audience = { $ne: ROLLOUT_ORGANIZATIONS };
    const rows = await ReleaseNotice.find(filter)
      .select("version")
      .lean();
    return maxVersion(rows.map((r) => r.version));
  },

  /** Conditional on the notice's current status when `whereStatus` is given. */
  setNotice(key, set, whereStatus = null) {
    const filter = { key };
    if (whereStatus) filter.status = Array.isArray(whereStatus) ? { $in: whereStatus } : whereStatus;
    return ReleaseNotice.findOneAndUpdate(filter, { $set: set }, { new: true }).lean();
  },

  async closeOpenNotices(productKey, { exceptKey = "", match, set }) {
    const open = await ReleaseNotice.find({ productKey, status: { $in: OPEN_STATUSES } })
      .select("key version audience")
      .lean();
    const hit = open.filter((n) => n.key !== exceptKey && match(n.version, n));
    for (const n of hit) {
      await ReleaseNotice.updateOne({ key: n.key, status: { $in: OPEN_STATUSES } }, { $set: set });
    }
    return hit.map((n) => n.key);
  },

  listOpenNotices() {
    return ReleaseNotice.find({ status: { $in: ["pending", "sending"] } })
      .sort({ createdAt: 1 })
      .lean();
  },

  changelogFor(slug) {
    return ChangelogProduct.findOne({ slug }).lean();
  },

  /** The deployment as customers see it now; null once it is deleted. */
  deploymentFor(productKey) {
    return ProductDeployment.findOne({ productKey: String(productKey || "").trim().toLowerCase() })
      .select("productKey version enabled packageUri earlyAccess.version earlyAccess.payload.version earlyAccess.payload.packageUri earlyAccess.payload.enabled")
      .lean();
  },

  earlyRingUserIds(now) {
    return earlyRingUserIds(User, now);
  },

  audience(productKeys, now) {
    return User.find(audienceFilter(productKeys, now)).select(USER_FIELDS).lean();
  },

  usersByIds(ids) {
    if (!ids.length) return [];
    return User.find({ _id: { $in: ids } }).select(USER_FIELDS).lean();
  },

  async enrol(rows) {
    // Pending rows first, so if two accounts ever share an address the one
    // that can be mailed is the one enrolled.
    const ordered = [...rows].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
    // Same reason as insertNotice: two enrolments racing on a brand-new
    // collection must meet the unique (noticeKey, emailHash) index.
    await ReleaseNoticeRecipient.init();
    for (let i = 0; i < ordered.length; i += 500) {
      try {
        await ReleaseNoticeRecipient.insertMany(ordered.slice(i, i + 500), { ordered: false });
      } catch (err) {
        // Duplicates are the unique index doing its job on a second enrolment.
        if (!isDup(err)) throw err;
      }
    }
  },

  pendingBatch(noticeKey, limit) {
    return ReleaseNoticeRecipient.find({ noticeKey, status: "pending" })
      .sort({ _id: 1 })
      .limit(Math.max(1, limit))
      .lean();
  },

  /** pending -> sending, atomically. False when another run got there first. */
  async claim(id, at = new Date()) {
    const r = await ReleaseNoticeRecipient.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: "sending", claimedAt: at }, $inc: { attempts: 1 } },
      { new: true },
    ).lean();
    return !!r;
  },

  async settle(id, set, fromStatus) {
    const r = await ReleaseNoticeRecipient.updateOne({ _id: id, status: fromStatus }, { $set: set });
    return (r?.modifiedCount ?? 0) > 0;
  },

  async counts(noticeKey) {
    const rows = await ReleaseNoticeRecipient.aggregate([
      { $match: { noticeKey } },
      { $group: { _id: { s: "$status", r: "$skipReason" }, n: { $sum: 1 } } },
    ]);
    return tallyCounts(rows.map((r) => ({ status: r._id.s, skipReason: r._id.r, n: r.n })));
  },

  async requeue(noticeKey, { includeInFlight = false, now = new Date() } = {}) {
    const stale = new Date(now.getTime() - IN_FLIGHT_STALE_MS);
    const filter = includeInFlight
      ? { noticeKey, $or: [{ status: "failed" }, { status: "sending", claimedAt: { $lt: stale } }] }
      : { noticeKey, status: "failed" };
    const r = await ReleaseNoticeRecipient.updateMany(filter, { $set: { status: "pending", error: "" } });
    return r?.modifiedCount ?? 0;
  },

  logSend({ email, ok, messageId = "" }) {
    // Hash only, like every transactional send: this is not a tracked
    // campaign. A send that happened is not undone by a log that did not.
    EmailSend.create({
      key: TEMPLATE_KEY,
      toHash: hashRecipient(email),
      ok,
      via: "ses",
      messageId,
    }).catch(() => {});
  },
};

export default sendReleaseNotice;
