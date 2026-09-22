// server/util/releaseDigest.js
//
// "This week's ADLM updates": the release emails, once a week, one per
// customer.
//
// THE OWNER'S RULE
//
// "Users update mail per softwares only go to them weekly if updates are
// pushed and added to the hub that week." So a release no longer mails
// anybody the moment it ships. The deployment PUT still records a
// ReleaseNotice exactly as before (util/releaseNotifier.js: only a real
// version increase, never a re-save, a rollback, a manifest-only fix, a
// disabled or pulled build; a newer version of the same product supersedes
// the older; pulling a build cancels its notice). The notice then waits here.
//
// ONCE A WEEK
//
// The fifteen-minute job that already runs (scheduled.js, riding on
// video-poll: no new schedule, no infra change) calls runReleaseDigestTick().
// Most ticks do nothing. Once the week's slot has come — Monday 09:00 in
// Lagos by default (RELEASE_DIGEST_DOW, RELEASE_DIGEST_HOUR) — the first tick
// inside the window (RELEASE_DIGEST_WINDOW_HOURS, 6 by default) starts that
// week's digest, keyed "digest@<ISO week in Lagos time>", e.g.
// "digest@2026-W40". The key is unique and recorded before anything else, so
// the week runs once however many containers race on it, and the Mongo job
// lock ("release-digest") keeps two runs from even trying at once.
//
// The window is what makes a deploy on a Monday evening safe: the Monday
// 09:00 slot has passed, but so has its window, so nothing fires until the
// next Monday. A tick that misses a whole window (an outage) sends nothing
// that week; the notices wait for the next digest, they are not lost.
//
// A DEPLOY NEVER FIRES A DIGEST
//
// The first tick this feature ever runs writes down when it did ("armed",
// collection release_digest_state). A week's digest starts only if the
// feature was armed BEFORE that week's slot. So the first deploy fires
// nothing even on a Monday morning inside the window: that week is skipped
// and the first digest is the next week's slot. After that, a deploy is not
// an event here at all: the Monday tick either has run (the week's key
// exists) or runs at its slot, whichever container answers it.
//
// A digest takes every notice still live and not yet in a digest (a
// conditional update: pending/failed -> "digesting", digestKey set), so a
// notice is in exactly one digest. Then, for every person with an active,
// unexpired licence for at least one product in it, ONE email listing only
// the updates for software they hold: the latest version of each, its notes,
// and its own update steps (util/releaseDigestEmail.js). A new Installation
// Center build (a "hub" notice) goes, inside that same email, to everybody
// with a live licence for software the Installation Center installs
// (HUB_AUDIENCE_KEYS: the products in util/releaseEmail.js PRODUCTS), not to
// a customer who only bought a course or a web-only key.
//
// A digest that has TAKEN its notices is carried on by every tick until it is
// done, window or no window: a send paused by SES throttling or the daily
// quota finishes on the next ticks. One that has not taken anything by its
// `startBy` (the end of its window; SES unreachable all that time) is closed
// as "missed" and takes nothing: the notices wait for next week's slot rather
// than going out on a Thursday with whatever is queued by then.
//
// NEVER STALE
//
// Before every batch, and in every preview, each notice a digest carries is
// read again: a build pulled since is cancelled, and a notice whose product
// has a NEWER version already mailed, or being mailed, elsewhere ("done",
// "sending", or "digesting" in another digest) is superseded. So a digest
// that SES stopped in week 40 and an admin resumes in week 42 cannot tell
// customers about QUIV 3.1.11 after week 41 told them about 3.1.12.
//
// NEVER TWICE, NEVER ON A GUESS
//
// The same ledger rules as the per-release email: one row per (digest,
// customer) and per (digest, address), written once; a row is claimed before
// its email goes out; a row whose SES answer was lost stays in flight and is
// never re-sent on a guess. SES, and only SES (sendViaSesOnce): a sandboxed or
// paused account, or access denied, stops the digest and records SES's own
// words, and nothing else is tried.
//
// FOR EMERGENCIES
//
// POST /admin/release-notifications/digest/send-now (sendDigestNow) sends the
// queued notices now, still one email per customer, and marks them as sent so
// the Monday digest does not send them again. What it would do is exactly
// what POST .../digest/preview shows (previewSendNow, the same plan):
//
//   - an unfinished digest with nothing left to send (every update pulled or
//     superseded, or nobody still owed it, or it never took anything) is
//     closed, and nobody is mailed by closing it;
//   - an unfinished digest that still holds updates is finished FIRST and
//     alone, and only when the call names it ({"digestKey": "<key>"} from the
//     preview): send-now never mails an older digest the admin did not see.
//     The one exception is a send-now digest still under way, which the next
//     call carries on without its name, so a release script can loop;
//   - otherwise a new send-now digest takes what is queued.
//
// A send-now does not make the Monday digest skip its customers: Monday mails
// whatever is queued after it, so a customer can get two emails a few days
// apart. The email says "usually once a week" for that reason. The per-release
// send (POST .../:id/send) refuses unless the body says {bypassDigest:true},
// and refuses an Installation Center notice either way (digest only).
//
// WHAT A DIGEST TAKES
//
// Notices "pending" (recorded, never mailed), "failed" ones SES refused before
// anybody was enrolled, and "sending" ones a per-release run claimed and died
// before enrolling (last run over IN_FLIGHT_STALE_MS ago): nobody has had any
// of them. Not in any digest yet. Never one the per-release send has enrolled
// (enrolledAt set) or finished ("done"): those customers have been, or are
// being, told already. The take is one conditional write on all of that
// (store.takeNoticeForDigest), so a per-release send that starts a notice
// between the digest's read and its take wins, and the digest leaves it.
// A notice a digest carried is in that digest for good; cancelled later, it is
// not queued again.
//
// RELEASE_DIGEST_ENABLED=false is the kill switch: the tick does nothing (not
// even carry on a digest under way) and send-now refuses.

import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Setting } from "../models/Setting.js";
import { EmailSend, hashRecipient } from "../models/EmailSend.js";
import { ReleaseNotice, SUPERSEDABLE_STATUSES, OPEN_STATUSES } from "../models/ReleaseNotice.js";
import {
  ReleaseDigest,
  ReleaseDigestRecipient,
  ACTIVE_DIGEST_STATUSES,
  UNFINISHED_DIGEST_STATUSES,
} from "../models/ReleaseDigest.js";
import { sendViaSesOnce, getSesAccount } from "./sesTransport.js";
import { mapWithPool } from "./sendPool.js";
import { productUpdatesUnsubscribeUrl, assertUnsubscribeLinksWork } from "./campaigns.js";
import { compareVersions, normalizeVersion, parseVersion } from "./releaseVersion.js";
import { PRODUCTS, productFor } from "./releaseEmail.js";
import { HUB_PRODUCT, buildDigestMessage, DIGEST_TEMPLATE_KEY } from "./releaseDigestEmail.js";
import {
  BATCH_SIZE,
  IN_FLIGHT_STALE_MS,
  MAX_CONCURRENCY,
  REFUSALS_BEFORE_STOP,
  USER_FIELDS,
  acquireJobLock,
  audienceFilter,
  classifySesError,
  errText,
  fromAddress,
  isDryRun,
  isEntitlementLive,
  isHubNotice,
  mongoStore as noticeMongoStore,
  neverAccepted,
  noticeKeyFor,
  releaseHoldMs,
  releaseJobLock,
  replyToAddress,
  resolveNotes,
  sendWithRetry,
  sesAccountVerdict,
  sleep,
  tallyCounts,
  withdrawnReason,
} from "./releaseNotifier.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ───────────────────────────────────────────────────────────── settings ── */

/** The digest's clock. Lagos keeps WAT (UTC+1) all year, with no DST. */
export const DIGEST_TZ = "Africa/Lagos";

/** The Mongo job lock both the tick and send-now take. */
export const DIGEST_LOCK = "release-digest";

/** RELEASE_DIGEST_ENABLED: on unless set to 0/false/no/off. Read at call time. */
export function isDigestEnabled(env = process.env) {
  return !/^(0|false|no|off)$/i.test(String(env.RELEASE_DIGEST_ENABLED ?? "").trim());
}

/**
 * When the week's digest runs, read at call time:
 *   RELEASE_DIGEST_DOW           0-6, Sunday = 0; default 1 (Monday)
 *   RELEASE_DIGEST_HOUR          0-23, Lagos time; default 9
 *   RELEASE_DIGEST_WINDOW_HOURS  how long after the slot a tick may still
 *                                START the digest; default 6, at most 48
 * Anything unreadable falls back to the default rather than to "now".
 */
export function digestSchedule(env = process.env) {
  const dowRaw = String(env.RELEASE_DIGEST_DOW ?? "").trim();
  const hourRaw = String(env.RELEASE_DIGEST_HOUR ?? "").trim();
  const winRaw = String(env.RELEASE_DIGEST_WINDOW_HOURS ?? "").trim();
  const dow = /^[0-6]$/.test(dowRaw) ? Number(dowRaw) : 1;
  const hour = /^\d{1,2}$/.test(hourRaw) && Number(hourRaw) <= 23 ? Number(hourRaw) : 9;
  const w = Number(winRaw);
  const windowHours = winRaw !== "" && Number.isFinite(w) && w > 0 && w <= 48 ? w : 6;
  return { dow, hour, windowHours, tz: DIGEST_TZ };
}

/* ─────────────────────────────────────────────────────────── the clock ── */

const lagosParts = new Intl.DateTimeFormat("en-US", {
  timeZone: DIGEST_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Lagos minus UTC at this instant, in ms (+3,600,000). Asked of the tz database, not assumed. */
export function tzOffsetMs(date) {
  const p = Object.fromEntries(lagosParts.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** A Date whose UTC fields read as the Lagos wall clock. */
const wallOf = (date) => new Date(date.getTime() + tzOffsetMs(date));

/** The instant at which Lagos wall-clock time `wallMs` (as UTC fields) happens. */
function fromWall(wallMs) {
  const guess = wallMs - tzOffsetMs(new Date(wallMs));
  return wallMs - tzOffsetMs(new Date(guess));
}

/** ISO 8601 week of a wall-clock date: "2026-W39". */
export function isoWeekLabel(wall) {
  const d = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * This week's slot, as seen at `now`. The week is the ISO week (Monday to
 * Sunday) in Lagos, so every week has exactly one slot whatever the day.
 *
 *   key            "digest@2026-W39"
 *   slotAt         the slot, as an instant
 *   windowEndsAt   slotAt + windowHours; a digest is only STARTED in between
 *   open           slotAt <= now < windowEndsAt
 *   before         now < slotAt
 */
export function digestWindow(now = new Date(), schedule = digestSchedule()) {
  const wall = wallOf(now);
  const isoDow = wall.getUTCDay() || 7; // Monday 1 .. Sunday 7
  const mondayWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - (isoDow - 1));
  const targetIso = schedule.dow === 0 ? 7 : schedule.dow;
  const slotWall = mondayWall + (targetIso - 1) * DAY + schedule.hour * HOUR;
  const slotAt = new Date(fromWall(slotWall));
  const windowEndsAt = new Date(slotAt.getTime() + schedule.windowHours * HOUR);
  const week = isoWeekLabel(new Date(slotWall));
  return {
    week,
    key: `digest@${week}`,
    slotAt,
    windowEndsAt,
    open: now >= slotAt && now < windowEndsAt,
    before: now < slotAt,
  };
}

/** The slot a week later than this one. */
export const followingWindow = (w, schedule = digestSchedule()) =>
  digestWindow(new Date(w.slotAt.getTime() + 7 * DAY), schedule);

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 28 Sep 2026, 09:00 WAT". */
export function formatLagos(date) {
  if (!date) return "";
  const w = wallOf(new Date(date));
  const hh = String(w.getUTCHours()).padStart(2, "0");
  const mm = String(w.getUTCMinutes()).padStart(2, "0");
  return `${WD[w.getUTCDay()]} ${w.getUTCDate()} ${MON[w.getUTCMonth()]} ${w.getUTCFullYear()}, ${hh}:${mm} WAT`;
}

/**
 * Was the feature live before this week's slot? Only then may the week's
 * digest start. `armedAt` null means no tick has run yet: the first one will
 * arm it, at the earliest now.
 */
export const armedBeforeSlot = (w, armedAt, now = new Date()) =>
  (armedAt ? new Date(armedAt) : now).getTime() < w.slotAt.getTime();

/**
 * When the next scheduled digest will start, given whether this week's has
 * and when the feature was armed (see "A DEPLOY NEVER FIRES A DIGEST").
 * `dueNow` when the window is open and it has not: the next tick starts it.
 */
export function nextDigestAt(
  now = new Date(),
  { thisWeekStarted = false, schedule = digestSchedule(), armedAt = new Date(0) } = {},
) {
  const w = digestWindow(now, schedule);
  const eligible = !thisWeekStarted && armedBeforeSlot(w, armedAt, now);
  if (w.before && eligible) return { at: w.slotAt, week: w.week, dueNow: false };
  if (w.open && eligible) return { at: now, week: w.week, dueNow: true };
  const n = followingWindow(w, schedule);
  return { at: n.slotAt, week: n.week, dueNow: false };
}

/* ─────────────────────────────────────────────────── the Installation Center ── */

export const HUB_KEY = "hub";

// Defined in util/releaseNotifier.js, which must also recognise one (its
// per-release send leaves hub notices to the digest).
export { isHubNotice };

/**
 * Whose licence makes an Installation Center worth hearing about: software it
 * installs, i.e. the products the release email knows (util/releaseEmail.js
 * PRODUCTS), through each one's audience keys. Not a course (routes/admin.js
 * grants those as entitlements too) and not a web-only key (boq-import, ai):
 * the customer dashboard shows neither a Hub button (Dashboard.jsx counts
 * only non-course subscriptions), and they have nothing to install with it.
 */
export const HUB_AUDIENCE_KEYS = Object.freeze([
  ...new Set(Object.keys(PRODUCTS).flatMap((k) => productFor(k).audienceKeys)),
]);

/** What the email calls the thing a notice announces. */
export const productOfNotice = (n) => (isHubNotice(n) ? HUB_PRODUCT : productFor(n.productKey, n.productName));

/**
 * The version in an Installation Center setup file's name, or "".
 *
 * The Hub's build script names it ADLMInstallerHub-v<version>.zip
 * (ADLMInstallerHub Scripts/build-hub-package.ps1). The admin pastes a link to
 * it into Setting.installerHubUrl; the upload route may have turned the dots
 * of its folder into hyphens (routes/admin.deployments.js sanitizeBaseName),
 * so "ADLMInstallerHub-v1-0-3" reads as 1.0.3 too. Anything else is "".
 */
export function hubVersionFromUrl(url) {
  let s = String(url || "").trim().split(/[?#]/)[0];
  if (!s) return "";
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep it as it is */
  }
  for (const seg of s.split("/").filter(Boolean).reverse()) {
    const m = /ADLM[-_ ]?Installer[-_ ]?Hub[-_ ]?v?(\d+(?:[._-]\d+){0,3})(?!\d)/i.exec(seg);
    if (!m) continue;
    const v = m[1].replace(/[_-]/g, ".");
    if (parseVersion(v)) return normalizeVersion(v);
  }
  return "";
}

/**
 * Why a hub notice for `version` must not go out given the dashboard's
 * download link now, or "" when it may. Removed, or pointing at an older
 * versioned file, is withdrawn. An unversioned file cannot be compared, so
 * the admin who announced it is taken at their word.
 */
export function hubWithdrawnReason(url, version) {
  if (!String(url || "").trim()) return "the Installation Center download on the dashboard was removed";
  const current = hubVersionFromUrl(url);
  if (!current) return "";
  if (compareVersions(current, version) < 0) {
    return `the dashboard now offers Installation Center ${current}, below ${normalizeVersion(version)}`;
  }
  return "";
}

/**
 * Does a change of Setting.installerHubUrl announce a new Installation
 * Center? Pure. Only a new versioned file whose version is above the one it
 * replaced (or replaces an unversioned link) and above anything already
 * announced. The first link ever set, an unversioned file, the same version
 * again and a rollback are silence, as for products.
 */
export function decideHubNotice({ previousUrl = "", nextUrl = "", lastAnnounced = "", demoMode = false }) {
  if (demoMode) return { notify: false, reason: "demo-mode" };
  const prev = String(previousUrl || "").trim();
  const next = String(nextUrl || "").trim();
  if (next === prev) return { notify: false, reason: "unchanged" };
  if (!next) return { notify: false, reason: "removed" };
  const version = hubVersionFromUrl(next);
  if (!version) return { notify: false, reason: "unversioned-file" };
  if (!prev) return { notify: false, reason: "first-setting", version };
  const previousVersion = hubVersionFromUrl(prev);
  if (previousVersion) {
    const cmp = compareVersions(version, previousVersion);
    if (cmp === 0) return { notify: false, reason: "same-version", version, previousVersion };
    if (cmp < 0) return { notify: false, reason: "rollback", version, previousVersion };
  }
  if (lastAnnounced && compareVersions(version, lastAnnounced) <= 0) {
    return { notify: false, reason: "already-announced", version, previousVersion };
  }
  return { notify: true, reason: previousVersion ? "version-increased" : "now-versioned", version, previousVersion };
}

// As for products (util/releaseNotifier.js): a notice a digest carried stays
// cancelled, since some customers may already have had it.
const reopenIfCancelled = async (store, key, notice, now) =>
  notice?.status !== "cancelled" || notice.digestKey
    ? notice
    : (await store.setNotice(key, { status: "pending", cancelledReason: "", openedAt: now() }, "cancelled")) || notice;

async function insertHubNotice({ version, previousVersion = "", releaseNotes, downloadUrl = "", source, actor, store, log, now }) {
  const v = normalizeVersion(version);
  const key = noticeKeyFor(HUB_KEY, v);
  const notes = await resolveNotes({ store, product: HUB_PRODUCT, version: v, releaseNotes, log });
  const { notice, created } = await store.insertNotice({
    key,
    productKey: HUB_KEY,
    kind: "hub",
    version: v,
    previousVersion,
    productName: HUB_PRODUCT.name,
    notes,
    status: "pending",
    source,
    downloadUrl: String(downloadUrl || ""),
    createdBy: actor,
    openedAt: now(),
  });
  const current = created ? notice : await reopenIfCancelled(store, key, notice, now);
  if (current?.status === "cancelled" && current?.digestKey) {
    log.log?.(`[release-digest] ${key}: was in ${current.digestKey} and cancelled; not queued again`);
    return {
      created: false,
      key,
      id: current?._id ? String(current._id) : "",
      status: "cancelled",
      reason: "already-in-digest",
      digestKey: current.digestKey,
      superseded: [],
      notesSource: notes.source,
    };
  }
  const superseded = await store.closeOpenNotices(HUB_KEY, {
    exceptKey: key,
    statuses: SUPERSEDABLE_STATUSES,
    match: (x) => compareVersions(x, v) < 0,
    set: { status: "superseded", supersededBy: key },
  });
  log.log?.(`[release-digest] ${key}: ${created ? "recorded" : "already recorded"} (${current?.status}), notes from ${notes.source}`);
  return {
    created,
    key,
    id: current?._id ? String(current._id) : "",
    status: current?.status || "pending",
    superseded,
    notesSource: notes.source,
    deliveredBy: "weekly-digest",
  };
}

/**
 * Called by POST /admin/settings/installer-hub when installerHubUrl changes
 * (routes/admin.settings.js). Records at most one hub notice, never sends, and
 * never throws into the save. Emptying the link cancels unfinished hub
 * notices; pointing it at an older versioned file cancels the ones above it.
 */
export async function recordInstallerHubChange({
  previousUrl = "",
  nextUrl = "",
  actor = "",
  demoMode = false,
  store = digestMongoStore,
  log = console,
  now = () => new Date(),
}) {
  if (demoMode) return { created: false, reason: "demo-mode" };
  const next = String(nextUrl || "").trim();
  const nextVersion = hubVersionFromUrl(next);
  const out = { created: false };

  if (!next) {
    out.cancelled = await store.closeOpenNotices(HUB_KEY, {
      match: () => true,
      set: { status: "cancelled", cancelledReason: "The Installation Center download was removed from the dashboard" },
    });
  } else if (nextVersion) {
    out.cancelled = await store.closeOpenNotices(HUB_KEY, {
      match: (v) => compareVersions(v, nextVersion) > 0,
      set: { status: "cancelled", cancelledReason: `The dashboard went back to Installation Center ${nextVersion}` },
    });
  }

  const lastAnnounced = await store.lastAnnouncedVersion(HUB_KEY);
  const d = decideHubNotice({ previousUrl, nextUrl: next, lastAnnounced });
  out.reason = d.reason;
  out.version = d.version || "";
  if (!d.notify) return out;

  const made = await insertHubNotice({
    version: d.version,
    previousVersion: d.previousVersion || "",
    downloadUrl: next,
    source: "installer-hub-setting",
    actor,
    store,
    log,
    now,
  });
  return { ...out, ...made };
}

const conflict = (message, details = {}) => Object.assign(new Error(message), { status: 409, details });

/**
 * An admin adding a new Installation Center to the digest by hand
 * (POST /admin/release-notifications/digest/hub). Same rules as the setting
 * change: a version above anything already announced, and not below what the
 * dashboard offers now.
 */
export async function createManualHubNotice({
  version,
  releaseNotes,
  downloadUrl = "",
  actor = "",
  store = digestMongoStore,
  log = console,
  now = () => new Date(),
}) {
  const v = normalizeVersion(version);
  if (!parseVersion(v)) {
    throw Object.assign(new Error(`"${version ?? ""}" is not a version (expected e.g. 1.0.3)`), { status: 400 });
  }
  const lastAnnounced = await store.lastAnnouncedVersion(HUB_KEY);
  if (lastAnnounced && compareVersions(v, lastAnnounced) <= 0) {
    const existingKey = noticeKeyFor(HUB_KEY, lastAnnounced);
    throw conflict(
      `Installation Center ${lastAnnounced} is already announced (${existingKey}), which is not older than ${v}. Nothing was created.`,
      { code: "already-announced", key: existingKey, lastAnnounced },
    );
  }
  const hub = await store.hubState();
  const withdrawn = hubWithdrawnReason(hub?.url, v);
  if (withdrawn) {
    throw conflict(`Customers cannot download Installation Center ${v}: ${withdrawn}. Nothing was created.`, {
      code: "not-downloadable",
      key: noticeKeyFor(HUB_KEY, v),
    });
  }
  const made = await insertHubNotice({
    version: v,
    releaseNotes,
    downloadUrl: downloadUrl || hub?.url || "",
    source: "manual",
    actor,
    store,
    log,
    now,
  });
  if (made.reason === "already-in-digest") {
    throw conflict(
      `Installation Center ${v} was in ${made.digestKey} and then cancelled, so some customers may already have it. ` +
        "It is not queued again. Nothing was created.",
      { code: "already-in-digest", key: made.key, digestKey: made.digestKey },
    );
  }
  return made;
}

/* ────────────────────────────────────────────────────────── who gets what ── */

/** An active, unexpired licence for something, read as the per-release email reads it. */
const licenceLive = (ent, now) => {
  const key = String(ent?.productKey || "").trim().toLowerCase();
  return !!key && isEntitlementLive(ent, [key], now);
};

/**
 * The updates in `notices` this person should hear about: a product's when
 * they hold a live licence for it (its audienceKeys), the Installation
 * Center's when they hold a live licence for software it installs
 * (HUB_AUDIENCE_KEYS).
 */
export function updatesFor(user, notices = [], now = new Date()) {
  const keys = new Set(
    (user?.entitlements || []).filter((e) => licenceLive(e, now)).map((e) => String(e.productKey).trim().toLowerCase()),
  );
  if (!keys.size) return [];
  const installsSoftware = HUB_AUDIENCE_KEYS.some((k) => keys.has(k));
  return notices.filter((n) =>
    isHubNotice(n) ? installsSoftware : productOfNotice(n).audienceKeys.some((k) => keys.has(k)),
  );
}

/**
 * Why this person does or does not get the week's email, given the updates
 * they hold. The same order as the per-release email (classifyRecipient):
 * address, account, licence, deliverable, consent.
 */
export function classifyDigestRecipient(user, updates = []) {
  const email = String(user?.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "no-address";
  if (user.disabled) return "disabled";
  if (!updates.length) return "no-entitlement";
  if (user.emailUndeliverable) return "undeliverable";
  if (user.notifications?.productUpdates === false) return "opted-out";
  return "send";
}

/**
 * The Mongo filter for the audience: a live licence for one of `productKeys`
 * (a week with a new Installation Center adds HUB_AUDIENCE_KEYS to them,
 * audienceRows). The per-release filter itself (audienceFilter): the
 * productKey condition always stays, so a course or a web-only key never
 * brings anybody in.
 */
export function digestAudienceFilter(productKeys, now = new Date()) {
  return audienceFilter(productKeys ?? [...HUB_AUDIENCE_KEYS], now);
}

const SKIP_BUCKET = {
  "opted-out": "optedOut",
  undeliverable: "undeliverable",
  "no-entitlement": "noEntitlement",
  disabled: "disabled",
  "no-address": "noAddress",
  "address-changed": "addressChanged",
};

/** A digest nothing more can happen to. */
const FINISHED_DIGEST_STATUSES = ["done", "empty", "missed"];

/* ────────────────────────────────────────────────────────── the notices ── */

async function noticeWithdrawn(store, n, cache) {
  if (isHubNotice(n)) {
    if (!cache.hub) cache.hub = (await store.hubState()) || { url: "" };
    return hubWithdrawnReason(cache.hub.url, n.version);
  }
  return withdrawnReason(await store.deploymentFor(n.productKey), n.version);
}

/** A per-release run that claimed a notice this long ago and never enrolled it is dead. */
const staleBefore = (now) => new Date(new Date(now).getTime() - IN_FLIGHT_STALE_MS);

/** Mailed, or being mailed, somewhere other than `digestKey`. */
const mailedElsewhere = (x, digestKey) =>
  x.status === "done" || x.status === "sending" || (x.status === "digesting" && x.digestKey !== digestKey);

/**
 * The newest version of `n`'s product that customers have been, or are being,
 * told about outside `digestKey` ("" for none), when it is newer than `n`:
 * then `n` is stale and must not go out. null when `n` is still news.
 */
async function newerAnnounced(store, n, digestKey, cache) {
  const pk = String(n.productKey || "");
  if (!cache.byProduct) cache.byProduct = new Map();
  if (!cache.byProduct.has(pk)) cache.byProduct.set(pk, (await store.noticesForProduct(pk)) || []);
  let best = null;
  for (const x of cache.byProduct.get(pk)) {
    if (x.key === n.key || !mailedElsewhere(x, digestKey)) continue;
    if (compareVersions(x.version, n.version) > 0 && (!best || compareVersions(x.version, best.version) > 0)) best = x;
  }
  return best;
}

/**
 * What a digest starting now would take, without writing: every notice still
 * pending (or refused by SES before anybody was enrolled, or claimed by a
 * per-release run that died before enrolling) and not in a digest, less the
 * withdrawn, less those still inside their release hold, keeping only the
 * latest version of each product, and none older than a version already
 * mailed or being mailed.
 */
export async function evaluateCandidates(store, { now = new Date(), holdMs = 0 } = {}) {
  const cands = await store.digestCandidates({ staleBefore: staleBefore(now) });
  const cache = {};
  const withdrawn = [];
  const held = [];
  const live = [];
  const superseded = [];
  for (const n of cands) {
    const why = await noticeWithdrawn(store, n, cache);
    if (why) {
      withdrawn.push({ notice: n, why });
      continue;
    }
    const newer = await newerAnnounced(store, n, "", cache);
    if (newer) {
      superseded.push({ notice: n, by: newer.key });
      continue;
    }
    const openedAt = new Date(n.openedAt || n.createdAt || 0).getTime();
    if (holdMs > 0 && n.status === "pending" && now.getTime() - openedAt < holdMs) {
      held.push(n);
      continue;
    }
    live.push(n);
  }
  const best = new Map();
  for (const n of live) {
    const cur = best.get(n.productKey);
    if (!cur || compareVersions(n.version, cur.version) > 0) best.set(n.productKey, n);
  }
  const chosen = [...best.values()];
  for (const n of live) {
    if (best.get(n.productKey) !== n) superseded.push({ notice: n, by: best.get(n.productKey).key });
  }
  return { chosen, held, withdrawn, superseded };
}

/** A candidate's own statuses: what a take, a cancel or a supersede may move it from. */
const CANDIDATE_STATUSES = ["pending", "failed", "sending"];

/** Take the week's notices into `digestKey`. Each is taken by one digest at most. */
async function takeNotices(store, digestKey, { now, holdMs, log }) {
  const ev = await evaluateCandidates(store, { now, holdMs });
  for (const { notice, why } of ev.withdrawn) {
    await store.setNotice(notice.key, { status: "cancelled", cancelledReason: `Not sent: ${why}` }, CANDIDATE_STATUSES);
    log.warn?.(`[release-digest] ${notice.key} cancelled, not in ${digestKey}: ${why}`);
  }
  for (const { notice, by } of ev.superseded) {
    await store.setNotice(notice.key, { status: "superseded", supersededBy: by }, CANDIDATE_STATUSES);
  }
  for (const n of ev.chosen) {
    // One conditional write on everything that made it a candidate (never
    // enrolled by a per-release send, in no digest), not on its status alone:
    // a per-release send that started it since the read above has it.
    const t = await store.takeNoticeForDigest(
      n.key,
      { status: "digesting", digestKey, digestedAt: now },
      { staleBefore: staleBefore(now) },
    );
    if (!t) {
      log.warn?.(`[release-digest] ${n.key}: started elsewhere a moment ago; not in ${digestKey}`);
      continue;
    }
    // The What's New page often lands after the build. Look again unless the
    // notes came with the release.
    if (t.notes?.source !== "request") {
      const fresh = await resolveNotes({ store, product: productOfNotice(t), version: t.version, log });
      if (fresh.source === "changelog" || !t.notes?.source) await store.setNotice(t.key, { notes: fresh });
    }
  }
  if (ev.held.length) {
    log.log?.(`[release-digest] held for next week (recorded moments ago): ${ev.held.map((n) => n.key).join(", ")}`);
  }
  return ev;
}

const summarise = (n) => ({
  key: n.key,
  kind: isHubNotice(n) ? "hub" : "product",
  productKey: n.productKey,
  productName: productOfNotice(n).name,
  version: n.version,
});

/* ───────────────────────────────────────────────────────── the message ── */

const toItem = (n) => ({
  key: n.key,
  kind: isHubNotice(n) ? "hub" : "product",
  product: productOfNotice(n),
  version: n.version,
  notes: n.notes,
});

function digestMessageFor({ user, email, updates, unsubscribeUserId }) {
  const unsubscribeUrl = productUpdatesUnsubscribeUrl(unsubscribeUserId ?? user._id);
  const replyTo = replyToAddress();
  const m = buildDigestMessage({ firstName: user.firstName, items: updates.map(toItem), unsubscribeUrl, replyTo });
  return {
    from: fromAddress(),
    to: [email],
    ...(replyTo ? { replyTo } : {}),
    subject: m.subject,
    html: m.html,
    text: m.text,
    listUnsubscribe: unsubscribeUrl,
  };
}

/* ────────────────────────────────────────────────────────── the audience ── */

/** Rows for the ledger: one per address, the sendable account first. */
async function audienceRows(store, digestKey, notices, now) {
  const hasHub = notices.some(isHubNotice);
  const keys = [
    ...new Set([
      ...notices.filter((n) => !isHubNotice(n)).flatMap((n) => productOfNotice(n).audienceKeys),
      ...(hasHub ? HUB_AUDIENCE_KEYS : []),
    ]),
  ];
  const users = await store.digestAudience(keys, now);
  const byEmail = new Map();
  for (const u of users) {
    const email = String(u.email || "").trim().toLowerCase();
    if (!email) continue;
    const updates = updatesFor(u, notices, now);
    const why = classifyDigestRecipient(u, updates);
    const row = {
      digestKey,
      userId: u._id,
      email,
      emailHash: hashRecipient(email),
      noticeKeys: updates.map((n) => n.key),
      status: why === "send" ? "pending" : "skipped",
      skipReason: why === "send" ? "" : why,
    };
    const prev = byEmail.get(email);
    if (!prev || (prev.status !== "pending" && row.status === "pending")) byEmail.set(email, row);
  }
  return { users, rows: [...byEmail.values()] };
}

/* ─────────────────────────────────────────────── a digest, as it stands ── */

/**
 * A digest's updates as they stand now, without writing: the ones it still
 * announces, and the ones the next batch would drop (the build pulled, or a
 * newer version of the product already mailed or being mailed elsewhere).
 * `counts` is its ledger once enrolled. `hasWork`: resuming it would mail
 * somebody (a live update and, once enrolled, somebody still owed it).
 */
async function inspectDigest(store, digest, cache = {}) {
  const live = [];
  const withdrawn = [];
  const superseded = [];
  for (const n of await store.noticesInDigest(digest.key)) {
    if (n.status !== "digesting") continue;
    const why = await noticeWithdrawn(store, n, cache);
    if (why) {
      withdrawn.push({ notice: n, why });
      continue;
    }
    const newer = await newerAnnounced(store, n, digest.key, cache);
    if (newer) {
      superseded.push({ notice: n, by: newer.key });
      continue;
    }
    live.push(n);
  }
  const counts = digest.enrolledAt ? await store.digestCounts(digest.key) : null;
  return { live, withdrawn, superseded, counts, hasWork: live.length > 0 && (!counts || counts.pending > 0) };
}

/* ────────────────────────────────────────────────────────── the preview ── */

/** The most rows a preview reads from a digest's ledger. */
const PREVIEW_ROW_CAP = 100_000;

/**
 * The next digest (or `digestKey`'s, once it has taken its notices), without
 * sending or writing: what it lists, who gets it, who is skipped and why, and
 * one email rendered for `userId` or the first recipient. For a digest that
 * has written its audience down, "who gets it" is its ledger's rows still
 * owed the email, not a fresh audience: exactly who resuming it would mail.
 * The unsubscribe link in the sample is a placeholder's: an admin clicking
 * around a preview must not switch a real customer's mail off.
 *
 * What POST /digest/preview shows is previewSendNow (below), which picks the
 * digest send-now would act on and previews that.
 */
export async function previewDigest({
  store = digestMongoStore,
  now = () => new Date(),
  holdMs = 0,
  digestKey = "",
  userId = "",
  log = console,
} = {}) {
  let notices;
  let held = [];
  let withdrawn = [];
  let superseded = [];
  let owed = null; // the ledger's pending rows, for an enrolled digest
  let counts = null;
  const digest = digestKey ? await store.findDigest(digestKey) : null;
  if (digest?.claimedAt) {
    const ins = await inspectDigest(store, digest);
    ({ withdrawn, superseded, counts } = ins);
    notices = ins.live;
    if (digest.enrolledAt) owed = await store.pendingDigestBatch(digest.key, PREVIEW_ROW_CAP);
  } else {
    const ev = await evaluateCandidates(store, { now: now(), holdMs });
    ({ held, withdrawn, superseded } = ev);
    notices = ev.chosen;
  }

  const base = {
    digestKey: digest?.key || "",
    ...(digest ? { digestStatus: digest.status, digestTrigger: digest.trigger || "" } : {}),
    ...(counts ? { counts } : {}),
    updates: notices.map((n) => ({
      ...summarise(n),
      status: n.status,
      openedAt: n.openedAt || n.createdAt || null,
      notesSource: n.notes?.source || "",
    })),
    held: held.map((n) => n.key),
    withdrawn: withdrawn.map(({ notice, why }) => ({ key: notice.key, why })),
    superseded: superseded.map(({ notice, by }) => ({ key: notice.key, by })),
  };
  if (!notices.length) {
    return {
      ...base,
      matched: 0,
      recipients: 0,
      skipped: {},
      perUpdate: {},
      sample: null,
      note: digest?.claimedAt ? `${digest.key} has nothing left to announce.` : "Nothing is queued for the digest.",
    };
  }

  let users;
  let rows;
  if (owed) {
    // Its audience is written down: the rows still owed it, each listing only
    // the updates it still carries.
    const liveKeys = new Set(notices.map((n) => n.key));
    users = await store.usersByIds(owed.map((r) => r.userId).filter(Boolean));
    rows = owed.map((r) => {
      const keys = (r.noticeKeys || []).filter((k) => liveKeys.has(k));
      return { ...r, noticeKeys: keys, status: keys.length ? "pending" : "skipped", skipReason: keys.length ? "" : "withdrawn" };
    });
  } else {
    ({ users, rows } = await audienceRows(store, "preview", notices, now()));
  }
  const skipped = owed ? { ...(counts?.skippedBy || {}) } : {};
  const perUpdate = {};
  let recipients = 0;
  let first = null;
  for (const r of rows) {
    if (r.status !== "pending") {
      const b = SKIP_BUCKET[r.skipReason] || r.skipReason;
      skipped[b] = (skipped[b] || 0) + 1;
      continue;
    }
    recipients += 1;
    if (!first) first = r;
    for (const k of r.noticeKeys) perUpdate[k] = (perUpdate[k] || 0) + 1;
  }

  let sample = null;
  let sampleNote = "";
  let who = null;
  let listed = notices;
  if (userId) {
    try {
      who = (await store.usersByIds([userId]))[0] || null;
    } catch {
      who = null; // not an id at all (Mongo cannot cast it): the same answer
    }
    if (!who) sampleNote = `No user ${userId}.`;
    if (who && owed) {
      const row = rows.find((r) => String(r.userId) === String(who._id) && r.status === "pending");
      if (!row) {
        sampleNote = `${who.email || userId} is not still owed ${digest.key}.`;
        who = null;
      } else {
        listed = notices.filter((n) => row.noticeKeys.includes(n.key));
      }
    }
  } else if (first) {
    who = users.find((u) => String(u._id) === String(first.userId)) || null;
    if (owed) listed = notices.filter((n) => first.noticeKeys.includes(n.key));
  }
  if (who) {
    const updates = updatesFor(who, listed, now());
    const why = classifyDigestRecipient(who, updates);
    if (!updates.length) {
      sampleNote = `${who.email || userId} holds no live licence for anything in this digest.`;
    } else {
      const m = digestMessageFor({
        user: who,
        email: String(who.email || "").trim().toLowerCase(),
        updates,
        unsubscribeUserId: "000000000000000000000000",
      });
      sample = {
        userId: String(who._id),
        to: m.to[0],
        wouldSend: why === "send",
        ...(why === "send" ? {} : { skipReason: why }),
        lists: updates.map((n) => n.key),
        subject: m.subject,
        from: m.from,
        html: m.html,
        text: m.text,
        listUnsubscribe: m.listUnsubscribe,
      };
    }
  }
  log.log?.(`[release-digest] preview: ${recipients} recipient(s) for ${base.updates.map((u) => u.key).join(", ")}`);
  return { ...base, matched: users.length, recipients, skipped, perUpdate, sample, ...(sampleNote ? { sampleNote } : {}) };
}

/* ─────────────────────────────────────────────────────────── the send ── */

/**
 * Work through one digest: take its notices (once), write its audience down
 * (once), then send at most `limit` emails before `deadlineAt`. Safe to call
 * again and again, from anywhere, at the same time: every row is claimed
 * before its email goes out.
 *
 * `resume` lets a failed digest (SES refused) go again: send-now passes it,
 * the fifteen-minute job does not, so a sandboxed account is not asked every
 * quarter of an hour. Before every batch each notice's build is read again;
 * one pulled since is cancelled, and one whose product has a newer version
 * already mailed or being mailed elsewhere is superseded, and either is
 * dropped from every email not yet sent.
 */
export async function sendDigest(
  digestKey,
  {
    store = digestMongoStore,
    send = sendViaSesOnce,
    sesAccount = getSesAccount,
    limit = 100_000,
    deadlineAt = Date.now() + 40_000,
    resume = false,
    dryRun = isDryRun(),
    holdMs = 0,
    now = () => new Date(),
    log = console,
    pause = sleep,
  } = {},
) {
  const digest = await store.findDigest(digestKey);
  if (!digest) return { ok: false, error: "not-found" };
  const key = digest.key;

  if (FINISHED_DIGEST_STATUSES.includes(digest.status)) {
    return { ok: true, skipped: true, key, reason: `already-${digest.status}`, counts: await store.digestCounts(key) };
  }
  if (digest.status === "failed" && !resume) {
    return { ok: true, skipped: true, key, reason: "failed-needs-resume", error: digest.error };
  }

  // A run whose opt-out links would point at localhost must not start.
  assertUnsubscribeLinksWork();

  if (dryRun) {
    const p = await previewDigest({ store, now, holdMs, digestKey: key, log });
    log.log?.(
      `[release-digest] DRY RUN ${key}: would mail ${p.recipients} customer(s) about ` +
        `${p.updates.map((u) => u.key).join(", ") || "nothing"} (${JSON.stringify(p.skipped)}). Nothing sent, nothing written.`,
    );
    return { ok: true, dryRun: true, key, recipients: p.recipients, skipped: p.skipped, updates: p.updates };
  }

  /* ── can SES reach customers at all? ── */
  let verdict;
  try {
    verdict = sesAccountVerdict(await sesAccount());
  } catch (err) {
    if (classifySesError(err) === "retry") {
      log.warn?.(`[release-digest] ${key}: could not read the SES account (${errText(err)}); will try again`);
      return {
        ok: false,
        key,
        retryLater: true,
        code: "ses-account-unreachable",
        status: digest.status,
        sent: 0,
        error: errText(err),
        counts: await store.digestCounts(key),
      };
    }
    verdict = { ok: false, code: "ses-account-unreadable", message: `Could not read the SES account: ${errText(err)}. Nothing was sent.` };
  }
  if (!verdict.ok) {
    await store.setDigest(
      key,
      { status: "failed", error: verdict.message, errorCode: verdict.code, failedAt: now(), lastRunAt: now() },
      UNFINISHED_DIGEST_STATUSES,
    );
    log.error?.(`[release-digest] ${key} STOPPED: ${verdict.message}`);
    return {
      ok: false,
      key,
      stopped: true,
      status: "failed",
      code: verdict.code,
      error: verdict.message,
      sent: 0,
      counts: await store.digestCounts(key),
    };
  }

  /* ── take it ── */
  const claimed = await store.setDigest(
    key,
    { status: digest.enrolledAt ? "sending" : "enrolling", startedAt: digest.startedAt || now(), lastRunAt: now() },
    resume ? UNFINISHED_DIGEST_STATUSES : ACTIVE_DIGEST_STATUSES,
  );
  if (!claimed) return { ok: true, skipped: true, key, reason: "status-changed" };
  let working = claimed;

  /* ── the week's notices, taken once ── */
  if (!working.claimedAt) {
    await takeNotices(store, key, { now: now(), holdMs, log });
    const mine = await store.noticesInDigest(key);
    working =
      (await store.setDigest(key, { claimedAt: now(), noticeKeys: mine.map((n) => n.key), items: mine.map(summarise) })) ||
      working;
    log.log?.(`[release-digest] ${key}: took ${mine.map((n) => n.key).join(", ") || "nothing"}`);
  }

  /* ── the audience, written down once ── */
  if (!working.enrolledAt) {
    const mine = (await store.noticesInDigest(key)).filter((n) => n.status === "digesting");
    if (!mine.length) {
      await store.setDigest(
        key,
        { status: "empty", enrolledAt: now(), finishedAt: now(), lastRunAt: now() },
        ["enrolling", "sending"],
      );
      log.log?.(`[release-digest] ${key}: nothing to announce this week; nothing sent`);
      return { ok: true, key, status: "empty", sent: 0, failed: 0, skipped: 0, inDoubt: 0, counts: await store.digestCounts(key) };
    }
    const { rows } = await audienceRows(store, key, mine, now());
    await store.enrolDigest(rows);
    working = (await store.setDigest(key, { enrolledAt: now(), status: "sending" }, ["enrolling", "sending"])) || working;
    log.log?.(`[release-digest] ${key}: enrolled ${rows.length} customer(s)`);
  }

  /* ── send ── */
  const ratePerSecond = verdict.ratePerSecond;
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Math.ceil(ratePerSecond)));
  const batchSize = Math.max(5, Math.min(BATCH_SIZE, Math.floor(ratePerSecond * 10)));
  const quotaCap = verdict.remaining24h == null ? Infinity : Math.max(0, verdict.remaining24h - 10);
  const budget = Math.max(0, Math.min(Number(limit) || 0, quotaCap));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let inDoubt = 0;
  let stop = null;

  /**
   * The notices this digest still announces, each read again now: a build
   * pulled since is cancelled, and one a newer version already mailed (or
   * being mailed) elsewhere makes stale is superseded. `gone` says why each
   * other notice of this digest is not live: "withdrawn" or "superseded".
   */
  const liveNotices = async () => {
    const ins = await inspectDigest(store, { key, enrolledAt: null });
    for (const { notice, why } of ins.withdrawn) {
      await store.setNotice(notice.key, { status: "cancelled", cancelledReason: `Dropped from ${key}: ${why}` }, "digesting");
      log.warn?.(`[release-digest] ${notice.key} dropped from ${key}: ${why}`);
    }
    for (const { notice, by } of ins.superseded) {
      await store.setNotice(notice.key, { status: "superseded", supersededBy: by }, "digesting");
      log.warn?.(`[release-digest] ${notice.key} dropped from ${key}: ${by} has already been announced`);
    }
    const gone = new Map();
    for (const n of await store.noticesInDigest(key)) {
      if (n.status === "superseded") gone.set(n.key, "superseded");
      else if (n.status !== "digesting") gone.set(n.key, "withdrawn");
    }
    return { live: new Map(ins.live.map((n) => [n.key, n])), gone };
  };

  while (!stop && sent + failed < budget && Date.now() < deadlineAt) {
    const still = await store.findDigest(key);
    if (still?.status !== "sending") {
      stop = { kind: "status", reason: `digest is ${still?.status}` };
      break;
    }

    const { live, gone } = await liveNotices();
    const batch = await store.pendingDigestBatch(key, Math.min(batchSize, budget - sent - failed));
    if (!batch.length) break;

    // Consent and licences are read again now, not trusted from enrolment.
    const users = await store.usersByIds(batch.map((r) => r.userId).filter(Boolean));
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const due = [];
    for (const row of batch) {
      const user = byId.get(String(row.userId));
      const listed = (row.noticeKeys || []).map((k) => live.get(k)).filter(Boolean);
      const updates = user ? updatesFor(user, listed, now()) : [];
      let why = user ? classifyDigestRecipient(user, updates) : "no-address";
      if (why === "no-entitlement" && !listed.length && (row.noticeKeys || []).length) {
        // Everything it listed has gone: "superseded" only when all of it was.
        why = row.noticeKeys.every((k) => gone.get(k) === "superseded") ? "superseded" : "withdrawn";
      }
      if (why === "send" && String(user.email).trim().toLowerCase() !== row.email) why = "address-changed";
      if (why !== "send") {
        if (await store.settleDigestRow(row._id, { status: "skipped", skipReason: why }, "pending")) skipped += 1;
        continue;
      }
      due.push({ row, user, updates });
    }

    await mapWithPool(
      due,
      async ({ row, user, updates }) => {
        if (stop) return;
        if (!(await store.claimDigestRow(row._id, now()))) return; // another run has it

        const r = await sendWithRetry(send, digestMessageFor({ user, email: row.email, updates }), { pause });

        if (r.ok) {
          await store.settleDigestRow(
            row._id,
            { status: "sent", sentAt: now(), messageId: r.messageId, error: "", sentNoticeKeys: updates.map((n) => n.key) },
            "sending",
          );
          store.logDigestSend({ email: row.email, ok: true, messageId: r.messageId });
          sent += 1;
          return;
        }

        const kind = classifySesError(r.error);
        if (kind === "account" || kind === "pause" || (kind === "retry" && neverAccepted(r.error))) {
          // SES did not take it: back in the queue, and the run stops.
          await store.settleDigestRow(row._id, { status: "pending", error: errText(r.error) }, "sending");
          if (!stop) stop = { kind: kind === "retry" ? "transient" : kind, error: r.error };
          return;
        }
        if (kind === "retry") {
          // SES may have taken it and lost only the answer: left in flight.
          await store.settleDigestRow(row._id, { error: `In doubt: ${errText(r.error)}` }, "sending");
          inDoubt += 1;
          if (!stop) stop = { kind: "transient", error: r.error };
          return;
        }
        await store.settleDigestRow(row._id, { status: "failed", error: errText(r.error) }, "sending");
        store.logDigestSend({ email: row.email, ok: false });
        failed += 1;
        if (!stop && sent === 0 && failed >= REFUSALS_BEFORE_STOP) {
          stop = {
            kind: "account",
            error: Object.assign(new Error(`The first ${failed} sends were all refused; last: ${errText(r.error)}`), {
              name: "AllSendsRefused",
            }),
          };
        }
      },
      { concurrency, ratePerSecond, sleep: pause },
    );
  }

  if (!stop && Number.isFinite(quotaCap) && sent + failed >= quotaCap) {
    stop = { kind: "pause", error: new Error("Daily sending quota reached; the rest go on the next run.") };
  }

  /* ── settle the digest ── */
  const counts = await store.digestCounts(key);
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
    log.error?.(`[release-digest] ${key} STOPPED after ${sent} sent: ${errText(stop.error)}`);
  } else if (stop?.kind === "pause") {
    set.error = errText(stop.error);
    set.errorCode = "ses-daily-quota";
    log.warn?.(`[release-digest] ${key} paused: ${errText(stop.error)}`);
  } else if (stop?.kind === "transient") {
    const throttled = neverAccepted(stop.error);
    set.error =
      `SES ${throttled ? "was throttling or could not be reached" : "did not answer"} ` +
      `(${errText(stop.error)}); paused, the rest go on the next run` +
      (inDoubt ? `. ${inDoubt} email(s) in doubt are left in flight, not sent again.` : ".");
    set.errorCode = throttled ? "ses-throttled" : "ses-unavailable";
    log.warn?.(`[release-digest] ${key} paused: ${set.error}`);
  } else if (stop?.kind === "status") {
    status = (await store.findDigest(key))?.status || "unknown";
  } else if (counts.pending === 0) {
    status = "done";
    Object.assign(set, { status, finishedAt: now() });
  }

  await store.setDigest(key, set, stop?.kind === "status" ? null : "sending");

  if (status === "done") {
    // Every notice it carried is finished; the next digest will not see them.
    for (const n of await store.noticesInDigest(key)) {
      if (n.status === "digesting") await store.setNotice(n.key, { status: "done", finishedAt: now() }, "digesting");
    }
  }

  log.log?.(
    `[release-digest] ${key}: ${sent} sent, ${failed} failed, ${skipped} skipped, ${inDoubt} in doubt this run; ` +
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
  };
}

/* ─────────────────────────────────────────────────────────── the tick ── */

/** Five minutes by default, and never past the deadline the caller gives. */
export const DIGEST_BUDGET_MS = Number(process.env.RELEASE_DRAIN_BUDGET_MS || 5 * 60 * 1000);

/** How long after an admin presses send-now its digest may still take the queue. */
export const SEND_NOW_START_MS = HOUR;

/**
 * The latest a digest may still TAKE its updates (ReleaseDigest.startBy): the
 * end of its slot's window for a scheduled one, an hour after the press for
 * send-now. Read from the digest when it says; worked out otherwise.
 */
export function startByOf(d, schedule = digestSchedule()) {
  if (d?.startBy) return new Date(d.startBy);
  if (d?.trigger !== "send-now" && d?.scheduledFor) {
    return new Date(new Date(d.scheduledFor).getTime() + schedule.windowHours * HOUR);
  }
  return new Date(new Date(d?.createdAt || 0).getTime() + SEND_NOW_START_MS);
}

/**
 * What the fifteen-minute job does (scheduled.js, after video-poll, and by
 * hand with { "job": "release-digest" }). In order:
 *
 *   1. RELEASE_DIGEST_ENABLED off: nothing.
 *   2. The first tick ever arms the digest (writes down when it went live).
 *   3. A digest already under way (enrolling or sending, scheduled or
 *      send-now) that has taken its updates: carry on with it, window or no
 *      window. One that has not taken anything by its startBy (SES could not
 *      be reached all through its window) is closed as "missed" and takes
 *      nothing; its updates wait for the next slot.
 *   4. Outside this week's window, or this week's digest already recorded:
 *      nothing.
 *   5. Armed at or after this week's slot (deployed, or first switched on,
 *      after the slot had come): nothing this week. A deploy never fires.
 *   6. A notice recorded moments ago, still inside RELEASE_HOLD_MS, and time
 *      left in the window to wait it out: wait for the next tick, so a
 *      release script that is still checking its build can cancel it.
 *   7. Otherwise record "digest@<week>" (unique; a racing run loses here) and
 *      run it.
 *
 * DRY_RUN: says what it would send and writes nothing, not even the week or
 * the arming.
 */
export async function runReleaseDigestTick({
  store = digestMongoStore,
  deadlineAt,
  lock = true,
  log = console,
  now = () => new Date(),
  holdMs = releaseHoldMs(),
  enabled = isDigestEnabled(),
  schedule = digestSchedule(),
  dryRun = isDryRun(),
  ...sendOptions
} = {}) {
  if (!enabled) {
    log.log?.("[release-digest] RELEASE_DIGEST_ENABLED is off; nothing checked, nothing sent");
    return { ok: true, skipped: true, reason: "disabled" };
  }
  const until = deadlineAt ?? Date.now() + DIGEST_BUDGET_MS;

  if (lock && !(await acquireJobLock(DIGEST_LOCK, 10))) {
    log.warn?.("[release-digest] another run holds the lock; skipping");
    return { ok: true, skipped: true, reason: "lock-held" };
  }

  try {
    const t = now();
    // Written once, by the first tick after the feature is deployed; read-only
    // under DRY_RUN (no marker yet means "now", the moment it would be written).
    const armedAt = dryRun ? (await store.peekArmedAt()) || t : await store.armDigest(t);

    // A digest under way is carried on, window or no window, once it has
    // taken its updates. One that has not, and whose start window has
    // passed (SES unreachable all that time), is closed: it must not take,
    // days later, whatever is queued by then. Its updates wait for the
    // next slot.
    const missed = [];
    let active = null;
    for (const d of await store.unfinishedDigests()) {
      if (!ACTIVE_DIGEST_STATUSES.includes(d.status)) continue;
      if (!d.claimedAt && t.getTime() >= startByOf(d, schedule).getTime()) {
        if (dryRun) {
          missed.push(d.key);
          continue;
        }
        const closed = await store.closeUnclaimedDigest(
          d.key,
          {
            status: "missed",
            closedReason: `It had not taken any update by ${formatLagos(startByOf(d, schedule))}; they wait for the next digest.`,
            finishedAt: t,
            lastRunAt: t,
          },
          ACTIVE_DIGEST_STATUSES,
        );
        if (closed) {
          missed.push(d.key);
          log.warn?.(`[release-digest] ${d.key}: missed (nothing taken before ${formatLagos(startByOf(d, schedule))}); nothing sent`);
        }
        continue;
      }
      active = d;
      break;
    }
    if (active) {
      const r = await sendDigest(active.key, { ...sendOptions, store, deadlineAt: until, log, now, holdMs, dryRun });
      return { ...r, continued: active.key, ...(missed.length ? { missed } : {}) };
    }

    const w = digestWindow(t, schedule);
    if (!w.open) {
      const next = w.before ? w.slotAt : followingWindow(w, schedule).slotAt;
      return {
        ok: true,
        skipped: true,
        reason: w.before ? "before-window" : "window-passed",
        week: w.week,
        nextAt: next.toISOString(),
        nextAtLagos: formatLagos(next),
        ...(missed.length ? { missed } : {}),
      };
    }

    const existing = await store.findDigest(w.key);
    if (existing) {
      return { ok: true, skipped: true, reason: `already-${existing.status}`, key: w.key, ...(missed.length ? { missed } : {}) };
    }

    if (!armedBeforeSlot(w, armedAt, t)) {
      const next = followingWindow(w, schedule).slotAt;
      log.log?.(
        `[release-digest] ${w.key}: skipped, the digest went live (${formatLagos(armedAt)}) after this week's slot; ` +
          `first digest ${formatLagos(next)}`,
      );
      return {
        ok: true,
        skipped: true,
        reason: "armed-after-slot",
        week: w.week,
        armedAt: new Date(armedAt).toISOString(),
        nextAt: next.toISOString(),
        nextAtLagos: formatLagos(next),
      };
    }

    if (holdMs > 0) {
      const young = (await store.digestCandidates({ staleBefore: staleBefore(t) })).filter(
        (n) => n.status === "pending" && t.getTime() - new Date(n.openedAt || n.createdAt || 0).getTime() < holdMs,
      );
      if (young.length && t.getTime() + holdMs < w.windowEndsAt.getTime()) {
        log.log?.(`[release-digest] ${w.key}: waiting a tick for ${young.map((n) => n.key).join(", ")} (release hold)`);
        return { ok: true, skipped: true, reason: "release-hold", key: w.key, held: young.map((n) => n.key) };
      }
    }

    if (dryRun) {
      const p = await previewDigest({ store, now, holdMs, log });
      log.log?.(
        `[release-digest] DRY RUN ${w.key}: would mail ${p.recipients} customer(s) about ` +
          `${p.updates.map((u) => u.key).join(", ") || "nothing"}. Nothing sent, nothing written.`,
      );
      return { ok: true, dryRun: true, key: w.key, recipients: p.recipients, skipped: p.skipped, updates: p.updates };
    }

    const { created } = await store.insertDigest({
      key: w.key,
      week: w.week,
      trigger: "schedule",
      status: "enrolling",
      scheduledFor: w.slotAt,
      startBy: w.windowEndsAt,
    });
    if (!created) return { ok: true, skipped: true, reason: "started-elsewhere", key: w.key };
    log.log?.(`[release-digest] ${w.key}: starting (slot ${formatLagos(w.slotAt)})`);

    const r = await sendDigest(w.key, { ...sendOptions, store, deadlineAt: until, log, now, holdMs, dryRun: false });
    return { ...r, started: w.key };
  } finally {
    if (lock) await releaseJobLock(DIGEST_LOCK);
  }
}

/* ───────────────────────────────────────────────────────── send-now ── */

const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/**
 * What send-now would do now, read-only. The preview (previewSendNow) and the
 * send (sendDigestNow) both ask this, so what an admin confirms against is
 * what goes out.
 *
 *   close    unfinished digests with nothing left to send: one that never
 *            took anything (its updates are still queued), one whose every
 *            update was pulled or superseded since, or one nobody is still
 *            owed. Closing mails nobody.
 *   target   the oldest unfinished digest that still holds updates: send-now
 *            finishes it, alone, before anything new. Only when the call
 *            names it (requiresDigestKey), unless it is a send-now digest
 *            still under way (the next call of a release script's loop).
 *   neither  a new send-now digest takes what is queued.
 */
async function sendNowPlan(store, { now, schedule = digestSchedule() }) {
  const cache = {};
  const close = [];
  let target = null;
  for (const d of await store.unfinishedDigests()) {
    const sendNowUnderWay = d.trigger === "send-now" && ACTIVE_DIGEST_STATUSES.includes(d.status);
    if (!d.claimedAt) {
      // Holds nothing: what it would take is the queue itself.
      if (!target && sendNowUnderWay && now.getTime() < startByOf(d, schedule).getTime()) {
        target = { digest: d, inspect: null, requiresDigestKey: false };
      } else {
        close.push({ digest: d, kind: "missed", why: "it had not taken any update, so they are still queued" });
      }
      continue;
    }
    const ins = await inspectDigest(store, d, cache);
    if (!ins.hasWork) {
      close.push({
        digest: d,
        kind: "finished",
        inspect: ins,
        why: ins.live.length ? "nobody is still owed it" : "every update it held has been pulled or superseded since",
      });
      continue;
    }
    if (!target) target = { digest: d, inspect: ins, requiresDigestKey: !sendNowUnderWay };
  }
  return { close, target };
}

/**
 * Close a digest that has nothing left to send (sendNowPlan's `close`),
 * mailing nobody: one that took nothing is "missed" (its updates stay
 * queued); one that did has its dead updates dropped, whoever is still owed
 * it skipped, and is finished. Returns what it did, or null when the digest
 * had moved on meanwhile.
 */
async function closeDigest(store, { digest: d, kind, inspect, why }, { now, log, actor = "" }) {
  const reason = `Closed by send-now${actor ? ` (${actor})` : ""}: ${why}. Nobody was mailed by closing it.`;
  if (kind === "missed") {
    const out = await store.closeUnclaimedDigest(
      d.key,
      { status: "missed", closedReason: reason, finishedAt: now, lastRunAt: now },
      UNFINISHED_DIGEST_STATUSES,
    );
    if (!out) return null;
    log.log?.(`[release-digest] ${d.key}: ${reason}`);
    return { key: d.key, status: "missed", was: d.status, why };
  }

  for (const { notice, why: w } of inspect.withdrawn) {
    await store.setNotice(notice.key, { status: "cancelled", cancelledReason: `Dropped from ${d.key}: ${w}` }, "digesting");
  }
  for (const { notice, by } of inspect.superseded) {
    await store.setNotice(notice.key, { status: "superseded", supersededBy: by }, "digesting");
  }
  const all = await store.noticesInDigest(d.key);
  const skipReason = all.length && all.every((n) => n.status === "superseded") ? "superseded" : "withdrawn";
  for (;;) {
    const rows = await store.pendingDigestBatch(d.key, 500);
    let moved = 0;
    for (const r of rows) {
      if (await store.settleDigestRow(r._id, { status: "skipped", skipReason }, "pending")) moved += 1;
    }
    if (!rows.length || !moved) break;
  }
  const status = d.enrolledAt ? "done" : "empty";
  const out = await store.setDigest(
    d.key,
    {
      status,
      counts: await store.digestCounts(d.key),
      closedReason: reason,
      finishedAt: now,
      lastRunAt: now,
      ...(d.enrolledAt ? {} : { enrolledAt: now }),
    },
    UNFINISHED_DIGEST_STATUSES,
  );
  if (!out) return null;
  // Anything still live in it was mailed to everybody it was owed to.
  for (const n of inspect.live) await store.setNotice(n.key, { status: "done", finishedAt: now }, "digesting");
  log.log?.(`[release-digest] ${d.key}: ${reason}`);
  return { key: d.key, status, was: d.status, why };
}

const listOf = (updates = []) => updates.map((u) => `${u.productName} ${u.version}`).join(", ") || "nothing";

/**
 * POST /admin/release-notifications/digest/preview: what send-now would do,
 * as a dry run, and one email as it would go out. When an unfinished digest
 * holds updates, that digest is what is shown (and what send-now sends), with
 * the customers still owed it; `digestKey` and `requiresDigestKey` say what a
 * send-now call must name to send it. Writes nothing.
 */
export async function previewSendNow({
  store = digestMongoStore,
  now = () => new Date(),
  userId = "",
  schedule = digestSchedule(),
  log = console,
} = {}) {
  const t = now();
  const plan = await sendNowPlan(store, { now: t, schedule });
  const closes = plan.close.map(({ digest: d, why }) => ({ key: d.key, status: d.status, trigger: d.trigger || "", why }));
  const closing = closes.length
    ? ` First it closes ${closes.map((c) => `${c.key} (${c.status}: ${c.why})`).join("; ")}, mailing nobody.`
    : "";

  if (plan.target) {
    const d = plan.target.digest;
    const p = await previewDigest({ store, now, holdMs: 0, digestKey: d.key, userId, log });
    const stillQueued = d.claimedAt ? (await evaluateCandidates(store, { now: t, holdMs: 0 })).chosen.map((n) => n.key) : [];
    const requires = plan.target.requiresDigestKey;
    const plain =
      `send-now would ${requires ? "finish" : "carry on"} ${d.key} (${d.status}${d.error ? `: ${d.error}` : ""}), ` +
      `and nothing else: ${p.recipients} customer(s) still owed it, about ${listOf(p.updates)}.` +
      closing +
      (requires ? ` It is sent only when the call names it: {"confirm":"SEND","digestKey":"${d.key}"}.` : "") +
      (stillQueued.length ? ` Still queued after it, for the weekly digest or another send-now: ${stillQueued.join(", ")}.` : "");
    return {
      ...p,
      action: requires ? "resume" : "continue",
      digestKey: d.key,
      digestStatus: d.status,
      digestTrigger: d.trigger || "",
      digestError: d.error || "",
      requiresDigestKey: requires,
      closes,
      stillQueued,
      plan: plain,
    };
  }

  const p = await previewDigest({ store, now, holdMs: 0, userId, log });
  return {
    ...p,
    action: p.updates.length ? "start" : "nothing",
    digestKey: "",
    requiresDigestKey: false,
    closes,
    stillQueued: [],
    plan: p.updates.length
      ? `send-now would start a new digest: ${p.recipients} customer(s), one email each, about ${listOf(p.updates)}.${closing}`
      : `Nothing is queued; send-now would send nothing.${closing}`,
  };
}

/**
 * The emergency path: send what is queued now, one email per customer, and
 * mark it so the Monday digest does not send it again (its notices leave the
 * queue the moment this digest takes them). What it does is sendNowPlan's,
 * the same plan the preview shows:
 *
 *   1. closes every unfinished digest with nothing left to send (no mail);
 *   2. finishes the oldest unfinished digest that still holds updates, and
 *      nothing else, when `digestKey` names it (one SES refused included:
 *      naming it is the decision to try again), or without the name when it
 *      is a send-now digest still under way; otherwise refuses (409
 *      "unfinished-digest"), sending nothing;
 *   3. otherwise starts a new send-now digest with what is queued.
 *
 * `digestKey` naming a digest that has finished answers "already-<status>"
 * (the last call of a loop). Takes the same lock as the tick; a busy lock
 * answers "busy". Refused while RELEASE_DIGEST_ENABLED is off: the kill switch
 * stops every digest email.
 */
export async function sendDigestNow({
  store = digestMongoStore,
  actor = "",
  digestKey = "",
  lock = true,
  deadlineAt = Date.now() + 40_000,
  limit = 200,
  dryRun = isDryRun(),
  enabled = isDigestEnabled(),
  schedule = digestSchedule(),
  now = () => new Date(),
  log = console,
  ...sendOptions
} = {}) {
  if (!enabled) {
    return {
      ok: false,
      disabled: true,
      code: "digest-disabled",
      error:
        "RELEASE_DIGEST_ENABLED is off, so no digest email is sent, send-now included. Nothing was sent. " +
        "Switch it back on (unset it, or set it to true) to send.",
    };
  }
  if (lock && !(await acquireJobLock(DIGEST_LOCK, 10))) {
    return { ok: false, busy: true, code: "digest-busy", error: "A digest run is in progress. Try again in a minute." };
  }
  try {
    const wanted = String(digestKey || "").trim();

    if (dryRun) {
      const p = await previewSendNow({ store, now, schedule, log });
      return {
        ok: true,
        dryRun: true,
        action: p.action,
        digestKey: p.digestKey,
        requiresDigestKey: p.requiresDigestKey,
        closes: p.closes,
        recipients: p.recipients,
        skipped: p.skipped,
        updates: p.updates,
        stillQueued: p.stillQueued,
      };
    }

    const t0 = now();
    const plan = await sendNowPlan(store, { now: t0, schedule });

    // 1. Nothing left to send in these: closed, and nobody is mailed.
    const closed = [];
    for (const c of plan.close) {
      const out = await closeDigest(store, c, { now: t0, log, actor });
      if (out) closed.push(out);
    }
    const extra = closed.length ? { closed } : {};
    const queuedNow = async () => (await evaluateCandidates(store, { now: now(), holdMs: 0 })).chosen.map((n) => n.key);

    // 2. An unfinished digest that still holds updates goes first, and alone.
    const target = plan.target;
    if (target) {
      const d = target.digest;
      const updates = target.inspect ? target.inspect.live.map(summarise) : [];
      if (wanted && wanted !== d.key) {
        return {
          ok: false,
          refused: true,
          code: "digest-mismatch",
          digestKey: d.key,
          digestStatus: d.status,
          updates,
          ...extra,
          error: `send-now would finish ${d.key} (${d.status}), not ${wanted}. POST /digest/preview again to see it. Nothing was sent.`,
        };
      }
      if (target.requiresDigestKey && wanted !== d.key) {
        return {
          ok: false,
          refused: true,
          code: "unfinished-digest",
          digestKey: d.key,
          digestStatus: d.status,
          trigger: d.trigger || "",
          digestError: d.error || "",
          updates,
          counts: target.inspect?.counts || (await store.digestCounts(d.key)),
          ...extra,
          error:
            `${d.key} is ${d.status}${d.error ? ` (${d.error})` : ""} and still holds ${listOf(updates)}. ` +
            "send-now finishes it before anything else, and only when asked to by name: POST /digest/preview " +
            `to see who it would mail, then send {"confirm":"SEND","digestKey":"${d.key}"}. Nothing was sent.`,
        };
      }
      const r = await sendDigest(d.key, { ...sendOptions, store, deadlineAt, limit, resume: true, dryRun: false, now, log });
      return { ...r, continued: d.key, digestKey: d.key, stillQueued: await queuedNow(), ...extra };
    }

    if (wanted) {
      const d = await store.findDigest(wanted);
      if (!d) {
        return { ok: false, notFound: true, code: "digest-not-found", digestKey: wanted, ...extra, error: `No digest "${wanted}". Nothing was sent.` };
      }
      if (UNFINISHED_DIGEST_STATUSES.includes(d.status)) {
        return {
          ok: false,
          refused: true,
          code: "digest-mismatch",
          digestKey: wanted,
          digestStatus: d.status,
          ...extra,
          error: `${wanted} is ${d.status} but not what send-now would act on now. POST /digest/preview again. Nothing was sent.`,
        };
      }
      // Finished: by the last call of a loop, by the job, or closed just now.
      return {
        ok: true,
        skipped: true,
        reason: `already-${d.status}`,
        key: d.key,
        digestKey: d.key,
        counts: await store.digestCounts(d.key),
        stillQueued: await queuedNow(),
        ...extra,
      };
    }

    // 3. A new send-now digest, with what is queued.
    const ev = await evaluateCandidates(store, { now: t0, holdMs: 0 });
    if (!ev.chosen.length) {
      return {
        ok: true,
        skipped: true,
        reason: "nothing-queued",
        withdrawn: ev.withdrawn.map(({ notice, why }) => ({ key: notice.key, why })),
        ...extra,
      };
    }

    const t = now();
    const w = digestWindow(t, schedule);
    const key = `digest@${w.week}-now-${stamp(t)}`;
    const { created } = await store.insertDigest({
      key,
      week: w.week,
      trigger: "send-now",
      createdBy: actor,
      status: "enrolling",
      startBy: new Date(t.getTime() + SEND_NOW_START_MS),
    });
    if (!created) return { ok: false, busy: true, code: "digest-busy", error: `${key} already exists. Try again.`, ...extra };
    log.log?.(`[release-digest] ${key}: send-now by ${actor || "admin"}`);
    const r = await sendDigest(key, { ...sendOptions, store, deadlineAt, limit, resume: true, holdMs: 0, dryRun: false, now, log });
    return { ...r, started: key, digestKey: key, stillQueued: await queuedNow(), ...extra };
  } finally {
    if (lock) await releaseJobLock(DIGEST_LOCK);
  }
}

/* ────────────────────────────────────────────────────────── status, cancel ── */

/** When the next scheduled digest starts, reading whether this week's has. */
export async function nextDigestRun({ store = digestMongoStore, now = () => new Date(), schedule = digestSchedule() } = {}) {
  const t = now();
  const w = digestWindow(t, schedule);
  const [existing, armedAt] = await Promise.all([store.findDigest(w.key), store.peekArmedAt()]);
  const n = nextDigestAt(t, { thisWeekStarted: !!existing, schedule, armedAt });
  return { at: n.at.toISOString(), lagos: formatLagos(n.at), week: n.week, dueNow: n.dueNow };
}

/**
 * A release notice as recordDeploymentRelease returned it, with when the
 * weekly digest will mail it (nextDigestAt, nextDigestLagos) when it is
 * queued for one. Used by every path that records a release: the deployment
 * PUT (routes/admin.deployments.js) and the release gate's approve and
 * emergency (util/releaseGateFlow.js applyCandidate), so a release script and
 * the approver are told the same date. Never throws: a missing date never
 * fails a release.
 */
export async function withNextDigest(releaseNotice, { next = () => nextDigestRun() } = {}) {
  if (!releaseNotice?.key || releaseNotice.status !== "pending") return releaseNotice;
  try {
    const n = await next();
    return {
      ...releaseNotice,
      nextDigestAt: n.at,
      nextDigestLagos: n.dueNow ? "at the next 15-minute tick" : n.lagos,
    };
  } catch {
    return releaseNotice;
  }
}

/**
 * GET /admin/release-notifications/digest: when it runs next, what it will
 * list, roughly how many people get it, and anything stuck.
 */
export async function digestStatus({
  store = digestMongoStore,
  now = () => new Date(),
  holdMs = releaseHoldMs(),
  schedule = digestSchedule(),
  log = console,
} = {}) {
  const t = now();
  const w = digestWindow(t, schedule);
  const [thisWeek, armedAt] = await Promise.all([store.findDigest(w.key), store.peekArmedAt()]);
  const next = nextDigestAt(t, { thisWeekStarted: !!thisWeek, schedule, armedAt });
  const [unfinished, recent, legacy] = await Promise.all([
    store.unfinishedDigests(),
    store.recentDigests(5),
    store.legacyInProgress({ staleBefore: staleBefore(t) }),
  ]);
  const withCounts = async (d) => ({ ...d, counts: await store.digestCounts(d.key) });
  const p = await previewDigest({ store, now, holdMs, log });
  // What POST /digest/send-now would do right now (the preview's plan).
  const s = await previewSendNow({ store, now, schedule, log });
  return {
    enabled: isDigestEnabled(),
    dryRun: isDryRun(),
    schedule: {
      ...schedule,
      says: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dow]} ` +
        `${String(schedule.hour).padStart(2, "0")}:00 Lagos time (WAT), started within ${schedule.windowHours} h`,
    },
    now: t.toISOString(),
    // When the first tick ran; null until one has (see "A DEPLOY NEVER FIRES A DIGEST").
    armedAt: armedAt ? new Date(armedAt).toISOString() : null,
    thisWeek: {
      key: w.key,
      slotAt: w.slotAt.toISOString(),
      slotLagos: formatLagos(w.slotAt),
      windowEndsAt: w.windowEndsAt.toISOString(),
      status: thisWeek?.status || null,
    },
    nextRunAt: next.at.toISOString(),
    nextRunLagos: next.dueNow ? "at the next 15-minute tick" : formatLagos(next.at),
    nextRunWeek: next.week,
    queued: p.updates,
    held: p.held,
    withdrawnIfRunNow: p.withdrawn,
    recipientsEstimate: p.recipients,
    skippedEstimate: p.skipped,
    perUpdateEstimate: p.perUpdate,
    sendNow: {
      action: s.action,
      digestKey: s.digestKey,
      requiresDigestKey: s.requiresDigestKey,
      updates: s.updates,
      recipients: s.recipients,
      closes: s.closes,
      stillQueued: s.stillQueued,
      plan: s.plan,
    },
    unfinished: await Promise.all(unfinished.map(withCounts)),
    recent: await Promise.all(recent.map(withCounts)),
    legacyInProgress: legacy.map((n) => ({ key: n.key, status: n.status, enrolled: !!n.enrolledAt })),
    ...(legacy.length
      ? {
          legacyNote:
            "These per-release emails were started outside the weekly digest (before it, or with bypassDigest) " +
            "and are not in any digest, and the fifteen-minute job no longer finishes them. Finish one with " +
            "POST /admin/release-notifications/<key>/send and {\"bypassDigest\":true}, or cancel it. " +
            "One not yet enrolled (\"enrolled\": false) has mailed nobody; left alone for " +
            `${Math.round(IN_FLIGHT_STALE_MS / 60000)} minutes, the next digest takes it.`,
        }
      : {}),
  };
}

/**
 * Take a notice out of the queue (POST .../digest/cancel). A pending one never
 * goes; one a digest is sending now is dropped from every email not yet sent.
 */
export async function cancelQueuedNotice({ idOrKey, actor = "", store = digestMongoStore }) {
  const notice = await store.findNotice(idOrKey);
  if (!notice) return { ok: false, status: 404, error: `No release notification "${idOrKey}"` };
  const out = await store.setNotice(
    notice.key,
    { status: "cancelled", cancelledReason: `Cancelled by ${actor || "admin"}` },
    OPEN_STATUSES,
  );
  if (!out) return { ok: false, status: 409, error: `This notice is already ${notice.status}.` };
  return { ok: true, key: notice.key, status: out.status, wasIn: notice.digestKey || "" };
}

/* ──────────────────────────────────────────────────────────── the store ── */

const isDup = (err) =>
  err?.code === 11000 ||
  (Array.isArray(err?.writeErrors) && err.writeErrors.every((e) => (e?.err?.code ?? e?.code) === 11000));

/**
 * The Mongo filter for a notice a digest may take (the memory store's
 * `takeable` says the same): in no digest, never enrolled by the per-release
 * send, and pending, refused before enrolment, or claimed by a per-release run
 * that died before enrolling (last run before `staleBefore`).
 */
export function takeableFilter(staleBefore = new Date(0)) {
  return {
    digestKey: { $in: ["", null] },
    enrolledAt: null,
    $or: [
      { status: { $in: ["pending", "failed"] } },
      { status: "sending", $or: [{ lastRunAt: null }, { lastRunAt: { $lt: staleBefore } }] },
    ],
  };
}

/** The Mongo half: the per-release store plus the digest's own. Thin on purpose. */
export const digestMongoStore = {
  ...noticeMongoStore,

  findDigest(key) {
    return ReleaseDigest.findOne({ key: String(key || "").trim() }).lean();
  },

  async insertDigest(doc) {
    // The unique key is the week's guarantee, so the index must exist first.
    await ReleaseDigest.init();
    try {
      const created = await ReleaseDigest.create(doc);
      return { digest: created.toObject(), created: true };
    } catch (err) {
      if (!isDup(err)) throw err;
      return { digest: await ReleaseDigest.findOne({ key: doc.key }).lean(), created: false };
    }
  },

  setDigest(key, set, whereStatus = null) {
    const filter = { key };
    if (whereStatus) filter.status = Array.isArray(whereStatus) ? { $in: whereStatus } : whereStatus;
    return ReleaseDigest.findOneAndUpdate(filter, { $set: set }, { new: true }).lean();
  },

  /** The same, only while the digest has taken nothing (claimedAt null). */
  closeUnclaimedDigest(key, set, whereStatus) {
    return ReleaseDigest.findOneAndUpdate(
      { key, claimedAt: null, status: { $in: [].concat(whereStatus) } },
      { $set: set },
      { new: true },
    ).lean();
  },

  unfinishedDigests() {
    return ReleaseDigest.find({ status: { $in: UNFINISHED_DIGEST_STATUSES } }).sort({ createdAt: 1 }).lean();
  },

  recentDigests(limit = 5) {
    return ReleaseDigest.find({}).select("-items").sort({ createdAt: -1 }).limit(limit).lean();
  },

  /** Live notices not yet in a digest and never started by the per-release send. */
  digestCandidates({ staleBefore = new Date(0) } = {}) {
    return ReleaseNotice.find(takeableFilter(staleBefore)).sort({ createdAt: 1 }).lean();
  },

  /**
   * pending/failed (or dead-in-flight "sending") -> "digesting", in ONE write
   * whose filter is everything that makes a notice a candidate: in no digest,
   * never enrolled by the per-release send. null when that is no longer true
   * (a per-release send started it since the candidates were read).
   */
  takeNoticeForDigest(key, set, { staleBefore = new Date(0) } = {}) {
    return ReleaseNotice.findOneAndUpdate({ key, ...takeableFilter(staleBefore) }, { $set: set }, { new: true }).lean();
  },

  noticesInDigest(digestKey) {
    return ReleaseNotice.find({ digestKey }).sort({ createdAt: 1 }).lean();
  },

  /** Every notice of one product, for "has a newer version already gone out?". */
  noticesForProduct(productKey) {
    return ReleaseNotice.find({ productKey }).select("key version status digestKey enrolledAt").lean();
  },

  /**
   * Per-release sends started before the digest (or with bypassDigest), not
   * finished, and in no digest. "pending" too: one reopened after a cancel.
   * And one a per-release run claimed less than IN_FLIGHT_STALE_MS ago and
   * has not enrolled yet (older than that, the next digest takes it).
   */
  legacyInProgress({ staleBefore = new Date(0) } = {}) {
    return ReleaseNotice.find({
      digestKey: { $in: ["", null] },
      $or: [
        { status: { $in: ["pending", "sending", "failed"] }, enrolledAt: { $ne: null } },
        { status: "sending", enrolledAt: null, lastRunAt: { $gte: staleBefore } },
      ],
    })
      .select("key status enrolledAt")
      .lean();
  },

  /**
   * When the digest went live: the first tick's time, written once
   * ($setOnInsert on a fixed _id) and never changed. Two first ticks racing
   * on the upsert: the loser reads the winner's.
   */
  async armDigest(at = new Date()) {
    const col = mongoose.connection.collection("release_digest_state");
    try {
      const doc = await col.findOneAndUpdate(
        { _id: "armed" },
        { $setOnInsert: { at } },
        { upsert: true, returnDocument: "after" },
      );
      if (doc?.at) return new Date(doc.at);
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    const doc = await col.findOne({ _id: "armed" });
    return doc?.at ? new Date(doc.at) : at;
  },

  /** The same, read only: null until a tick has run. */
  async peekArmedAt() {
    const doc = await mongoose.connection.collection("release_digest_state").findOne({ _id: "armed" });
    return doc?.at ? new Date(doc.at) : null;
  },

  async hubState() {
    const s = await Setting.findOne({ key: "global" }).select("installerHubUrl").lean();
    return { url: String(s?.installerHubUrl || "") };
  },

  digestAudience(productKeys, now) {
    return User.find(digestAudienceFilter(productKeys, now)).select(USER_FIELDS).lean();
  },

  async enrolDigest(rows) {
    const ordered = [...rows].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
    await ReleaseDigestRecipient.init();
    for (let i = 0; i < ordered.length; i += 500) {
      try {
        await ReleaseDigestRecipient.insertMany(ordered.slice(i, i + 500), { ordered: false });
      } catch (err) {
        if (!isDup(err)) throw err; // a second enrolment meeting the unique indexes
      }
    }
  },

  pendingDigestBatch(digestKey, limit) {
    return ReleaseDigestRecipient.find({ digestKey, status: "pending" })
      .sort({ _id: 1 })
      .limit(Math.max(1, limit))
      .lean();
  },

  async claimDigestRow(id, at = new Date()) {
    const r = await ReleaseDigestRecipient.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: "sending", claimedAt: at }, $inc: { attempts: 1 } },
      { new: true },
    ).lean();
    return !!r;
  },

  async settleDigestRow(id, set, fromStatus) {
    const r = await ReleaseDigestRecipient.updateOne({ _id: id, status: fromStatus }, { $set: set });
    return (r?.modifiedCount ?? 0) > 0;
  },

  async digestCounts(digestKey) {
    const rows = await ReleaseDigestRecipient.aggregate([
      { $match: { digestKey } },
      { $group: { _id: { s: "$status", r: "$skipReason" }, n: { $sum: 1 } } },
    ]);
    return tallyCounts(rows.map((r) => ({ status: r._id.s, skipReason: r._id.r, n: r.n })));
  },

  logDigestSend({ email, ok, messageId = "" }) {
    EmailSend.create({ key: DIGEST_TEMPLATE_KEY, toHash: hashRecipient(email), ok, via: "ses", messageId }).catch(() => {});
  },
};

export default runReleaseDigestTick;
