// server/util/releaseRollout.js
//
// Staged rollout (docs/RELEASE_GATE.md, "Rollout"). An approved plugin release
// reaches firms first and everybody else later:
//
//   1. Organisations. On approval the build goes to every account that belongs
//      to a firm holding MORE THAN 5 active organisation seats, counted across
//      all products and all of the firm's accounts. It is kept on the product's
//      deployment as `earlyAccess`; the live row, which everyone else is
//      offered, is untouched.
//   2. Everyone. Three months after stage 1 began, a "Release to everyone"
//      button unlocks for the release approver. Pressing it writes the build to
//      the live row. Nothing moves on its own.
//
// A hotfix skips stage 1: marked `rollout: "everyone"` (or `hotfix: true`) when
// it is staged, or switched at approval, it is applied to the live row at once,
// still only after the approver signs it off.
//
// A firm is the set of accounts whose organisation entitlements name it
// (models/OrgVideo.js); names are matched trimmed and case-folded, the way
// GET /admin/organizations groups them.
import dayjs from "dayjs";
import { compareVersions, normalizeVersion, parseVersion } from "./releaseVersion.js";

export const ROLLOUT_ORGANIZATIONS = "organizations";
export const ROLLOUT_EVERYONE = "everyone";

/** A firm needs MORE than this many active organisation seats to go first. */
export const EARLY_SEAT_THRESHOLD = 5;
/** How long a release stays with firms before it can go to everyone. */
export const EARLY_ACCESS_MONTHS = 3;

/** "everyone" for a hotfix, "organizations" for anything else. */
export function normalizeRollout(body = {}) {
  const raw = String(body?.rollout ?? "").trim().toLowerCase();
  if (raw === ROLLOUT_EVERYONE || raw === "hotfix") return ROLLOUT_EVERYONE;
  const hot = body?.hotfix;
  if (hot === true || /^(true|1|yes|on)$/i.test(String(hot ?? "").trim())) return ROLLOUT_EVERYONE;
  return ROLLOUT_ORGANIZATIONS;
}

const downloadable = (d) => !!d && d.enabled !== false && !!String(d.packageUri || "").trim();

/**
 * Where an approved build goes. Firms first only when there is a live,
 * downloadable build for everyone else to stay on and the new build is a
 * higher version. A first release, a product switched back on, a same-version
 * manifest fix or a rollback goes to everyone: holding those back would leave
 * single users with nothing, or on a build that was pulled.
 */
export function stageFor({ rollout, live, payload }) {
  if (rollout === ROLLOUT_EVERYONE) return ROLLOUT_EVERYONE;
  if (!downloadable(live) || !downloadable(payload)) return ROLLOUT_EVERYONE;
  const next = normalizeVersion(payload.version);
  const prev = normalizeVersion(live.version);
  if (!parseVersion(next) || !parseVersion(prev)) return ROLLOUT_EVERYONE;
  return compareVersions(next, prev) > 0 ? ROLLOUT_ORGANIZATIONS : ROLLOUT_EVERYONE;
}

/** When the "Release to everyone" button unlocks. */
export const unlockDate = (startedAt) => dayjs(startedAt).add(EARLY_ACCESS_MONTHS, "month").toDate();

export const canReleaseToEveryone = (earlyAccess, now = new Date()) =>
  !!earlyAccess?.unlocksAt && new Date(earlyAccess.unlocksAt).getTime() <= new Date(now).getTime();

/**
 * The earlyAccess record to store for a build going to firms. A newer build
 * while one is already with firms replaces it but keeps the original clock:
 * the three months are how long firms have had this line of releases, so a
 * fix during the window does not push single users back another quarter.
 */
export function earlyAccessFor({ existing, candidate, actor, now = new Date() }) {
  const startedAt = existing?.startedAt ? new Date(existing.startedAt) : now;
  return {
    version: normalizeVersion(candidate.payload?.version) || String(candidate.payload?.version || ""),
    payload: candidate.payload,
    candidateId: String(candidate._id || ""),
    approvedBy: actor || "",
    approvedAt: now,
    startedAt,
    unlocksAt: existing?.unlocksAt ? new Date(existing.unlocksAt) : unlockDate(startedAt),
    firstVersion: existing?.firstVersion || existing?.version || normalizeVersion(candidate.payload?.version) || "",
    unlockNotifiedAt: existing?.unlockNotifiedAt || null,
  };
}

/**
 * After a build is written to the live row: keep the firms' early build only
 * while it is still ahead of what everyone now has.
 */
export function earlyAccessStillAhead(earlyAccess, liveVersion) {
  if (!earlyAccess?.version) return false;
  const cmp = compareVersions(earlyAccess.version, liveVersion);
  return cmp !== null && cmp > 0;
}

/* ──────────────────────────────────────────────────────── who goes first ── */

export const orgKey = (name) => String(name || "").trim().toLowerCase();

function entitlementLive(ent, now) {
  if (String(ent?.status || "").trim().toLowerCase() !== "active") return false;
  if (!ent.expiresAt) return true;
  const end = dayjs(ent.expiresAt).endOf("day");
  return !(end.isValid() && end.isBefore(dayjs(now)));
}

const isOrgEntitlement = (ent) =>
  String(ent?.licenseType || "").trim().toLowerCase() === "organization" && !!orgKey(ent?.organizationName);

/**
 * Firms with more than EARLY_SEAT_THRESHOLD active organisation seats, from a
 * list of users (each with their entitlements). Pure, so the tests and the
 * Mongo path count the same way.
 */
export function bigOrgKeys(users = [], now = new Date()) {
  const seats = new Map();
  for (const u of users) {
    for (const e of u?.entitlements || []) {
      if (!isOrgEntitlement(e) || !entitlementLive(e, now)) continue;
      const k = orgKey(e.organizationName);
      seats.set(k, (seats.get(k) || 0) + Math.max(1, Number(e.seats) || 1));
    }
  }
  return new Set([...seats].filter(([, n]) => n > EARLY_SEAT_THRESHOLD).map(([k]) => k));
}

/** Is this account part of one of those firms? */
export function inEarlyRing(user, bigOrgs, now = new Date()) {
  if (!bigOrgs?.size) return false;
  return (user?.entitlements || []).some(
    (e) => isOrgEntitlement(e) && entitlementLive(e, now) && bigOrgs.has(orgKey(e.organizationName)),
  );
}

/** Just the entitlement fields the ring needs. */
export const RING_USER_FIELDS =
  "entitlements.status entitlements.expiresAt entitlements.licenseType " +
  "entitlements.organizationName entitlements.seats";

/** Every account holding an organisation entitlement (the ring's raw input). */
export async function loadOrgUsers(User) {
  return User.find({ "entitlements.licenseType": "organization" }).select(RING_USER_FIELDS).lean();
}

/** The ids of every account that gets builds first, now. */
export async function earlyRingUserIds(User, now = new Date()) {
  const users = await loadOrgUsers(User);
  const big = bigOrgKeys(users, now);
  return users.filter((u) => inEarlyRing(u, big, now)).map((u) => String(u._id));
}

/**
 * The build customers can currently get at the top of the rollout: the firms'
 * early build when there is one, the live row otherwise. What a release email
 * is checked against before it goes.
 */
export function newestOffered(deployment) {
  if (!deployment) return deployment;
  const early = deployment.earlyAccess;
  if (!early?.payload || !earlyAccessStillAhead(early, deployment.version)) return deployment;
  return {
    ...deployment,
    version: early.payload.version,
    packageUri: early.payload.packageUri,
    enabled: deployment.enabled !== false && early.payload.enabled !== false,
  };
}

/**
 * GET /me/deployments: swap a live row for the firms' early build when this
 * account is in the ring. `generalVersion` is what everyone else has.
 */
export function withEarlyAccess(item, { inRing }) {
  const early = item?.earlyAccess;
  // The record itself never goes to the Hub: it holds a second copy of envVars.
  // eslint-disable-next-line no-unused-vars
  const { earlyAccess, ...rest } = item || {};
  if (!inRing || !early?.payload || !earlyAccessStillAhead(early, rest.version)) return rest;
  return {
    ...rest,
    ...early.payload,
    productKey: rest.productKey,
    earlyAccess: true,
    generalVersion: rest.version || "",
  };
}

/* ────────────────────────────────────────────── the three-month reminder ── */

/**
 * Daily (scheduled.js, after the expiry job): tell the release approver about
 * each build whose "Release to everyone" button has unlocked, once per build.
 * The button is the only way it moves; this is so the date is not missed.
 */
export async function runRolloutUnlockReminders({ now = new Date() } = {}) {
  const { ProductDeployment } = await import("../models/ProductDeployment.js");
  const { gateMail, getGateConfig, ownerEmail, releasesUrl, esc } = await import("./releaseGate.js");
  const due = await ProductDeployment.find({
    "earlyAccess.unlocksAt": { $lte: now },
    "earlyAccess.unlockNotifiedAt": null,
  })
    .select("productKey displayName version earlyAccess.version earlyAccess.startedAt earlyAccess.candidateId")
    .lean();
  if (!due.length) return { ok: true, reminded: [] };

  const cfg = await getGateConfig();
  const reminded = [];
  for (const d of due) {
    // Claim first, so two runs cannot both mail.
    const claimed = await ProductDeployment.updateOne(
      { productKey: d.productKey, "earlyAccess.candidateId": d.earlyAccess.candidateId, "earlyAccess.unlockNotifiedAt": null },
      { $set: { "earlyAccess.unlockNotifiedAt": now } },
    );
    if (!claimed.modifiedCount) continue;
    const name = d.displayName || d.productKey;
    await gateMail({
      to: cfg.approverEmail || ownerEmail(),
      subject: `Ready for everyone: ${name} v${d.earlyAccess.version}`,
      title: "A release can now go to everyone",
      lines: [
        `${esc(name)} v${esc(d.earlyAccess.version)} has been with firms since ${esc(new Date(d.earlyAccess.startedAt).toDateString())}.`,
        `Single users are still on v${esc(d.version)}. Nothing moves until you press "Release to everyone".`,
      ],
      cta: { label: "Open releases", href: releasesUrl() },
    });
    reminded.push(`${d.productKey}@${d.earlyAccess.version}`);
  }
  return { ok: true, reminded };
}
