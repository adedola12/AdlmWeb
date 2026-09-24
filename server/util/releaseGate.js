// server/util/releaseGate.js
//
// The release gate: nothing reaches customers until the release approver has
// signed it off. See docs/RELEASE_GATE.md for the whole picture (GitHub and AWS
// halves included); this file is the plugin-release half.
//
// Three things live here:
//   - which deployment changes count as a release (isGatedChange)
//   - the tamper-evident trail: every gate event goes to AuditLog in Mongo AND
//     to an S3 bucket under Object Lock (COMPLIANCE mode), which nobody, the
//     account root included, can edit or delete before retention runs out
//   - the mail that tells the approver what happened, sent through SES only
//
// None of the notification or audit helpers throw. A failed email must never
// be the reason a release is lost, and must never be the reason a release goes
// out unrecorded: the Mongo write and the S3 write are independent.
import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ReleaseGateConfig } from "../models/ReleaseGateConfig.js";
import { writeAudit } from "./audit.js";
import { sendViaSes } from "./sesTransport.js";
import { senderFor, replyToAddress } from "./senders.js";
import { wrapEmail } from "./emailLayout.js";

export const GATE_ID = "release-gate";
export const EMERGENCY_REVIEW_HOURS = 24;
export const MIN_EMERGENCY_REASON = 20;

// ── Config ──────────────────────────────────────────────────────────────────

export async function getGateConfig() {
  const doc = await ReleaseGateConfig.findById(GATE_ID).lean();
  return {
    approverEmail: String(doc?.approverEmail || "").toLowerCase(),
    approverName: doc?.approverName || "",
    approverGithub: doc?.approverGithub || "",
    history: doc?.history || [],
  };
}

export function ownerEmail() {
  return String(process.env.RELEASE_GATE_OWNER_EMAIL || "admin@adlmstudio.net").toLowerCase();
}

export function isApprover(cfg, email) {
  const e = String(email || "").trim().toLowerCase();
  return !!(cfg?.approverEmail && e && e === cfg.approverEmail);
}

// ── What counts as a release ────────────────────────────────────────────────

// Fields that change what a customer's machine downloads or runs. Anything
// else (display name, notes) is bookkeeping and applies straight away.
const SHIPPING_FIELDS = [
  "packageUri",
  "packageKind",
  "version",
  "sha256",
  "installArguments",
  "waitForExit",
  "markInstalledAfterLaunch",
  "requiresElevation",
  "operations",
  "envVars",
  "localRandomVars",
];

function canon(v) {
  if (v instanceof Map) v = Object.fromEntries(v);
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => JSON.parse(canon(x) || "null")));
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return JSON.stringify(Object.fromEntries(keys.map((k) => [k, JSON.parse(canon(v[k]) || "null")])));
  }
  return JSON.stringify(v);
}

/**
 * Does writing `next` over `previous` put something new in front of customers?
 *
 * Switching a product OFF is not a release: it is the safety action, and must
 * never wait for anyone. Switching it back ON is, because it re-exposes
 * whatever package is there. A brand-new product with a package is a release.
 * A field the caller omitted (normalizeDeployment leaves sha256/envVars/
 * localRandomVars out when absent) is unchanged, not cleared.
 */
export function isGatedChange(previous, next) {
  if (!next) return false;
  const turningOn = next.enabled !== false;
  if (!previous) return turningOn && !!next.packageUri;
  if (!turningOn) return false;
  if (previous.enabled === false) return true;
  return SHIPPING_FIELDS.some(
    (f) => Object.prototype.hasOwnProperty.call(next, f) && canon(previous[f]) !== canon(next[f]),
  );
}

// ── Tamper-evident trail ────────────────────────────────────────────────────

let s3;
function s3c() {
  if (!s3) s3 = new S3Client({ region: process.env.RELEASE_AUDIT_REGION || "eu-west-1" });
  return s3;
}

/** Key layout: <yyyy>/<mm>/<dd>/<iso>-<action>-<rand>.json, sortable by time. */
export function auditKey(action, at = new Date()) {
  const iso = at.toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-");
  const safe = String(action || "event").replace(/[^a-z0-9.-]+/gi, "-");
  return `web/${y}/${m}/${d}/${iso.replace(/[:.]/g, "")}-${safe}-${crypto.randomBytes(4).toString("hex")}.json`;
}

/**
 * Record a gate event in both stores. Returns { mongo, s3 } booleans so a
 * caller that must refuse on a missing trail (the emergency path) can do so.
 */
export async function recordGateEvent(action, detail = {}, req = null) {
  const at = new Date();
  const record = {
    at: at.toISOString(),
    source: "adlm-api",
    action,
    actor: String(req?.user?.email || detail.actor || "system").toLowerCase(),
    ip: req?.ip || "",
    ...detail,
  };

  const out = { mongo: false, s3: false };

  await writeAudit({
    actorEmail: record.actor,
    action: `release-gate.${action}`,
    method: req?.method || "",
    path: req?.originalUrl || "",
    productKey: detail.productKey || "",
    targetEmail: detail.approverEmail || "",
    ip: record.ip,
    userAgent: req?.headers?.["user-agent"] || "",
    meta: record,
  });
  out.mongo = true;

  const bucket = process.env.RELEASE_AUDIT_BUCKET;
  if (!bucket) {
    console.error("[release-gate] RELEASE_AUDIT_BUCKET is not set; event kept in Mongo only:", action);
    return out;
  }
  try {
    await s3c().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: auditKey(action, at),
        Body: JSON.stringify(record, null, 2),
        ContentType: "application/json",
        // Object Lock needs an integrity checksum on every PUT.
        ChecksumAlgorithm: "SHA256",
      }),
    );
    out.s3 = true;
  } catch (err) {
    console.error("[release-gate] locked audit write failed:", action, err?.name, err?.message);
  }
  return out;
}

// ── Mail (SES only, never a fallback provider) ──────────────────────────────

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function siteBase() {
  return String(process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net").replace(/\/+$/, "");
}

export function releasesUrl() {
  return `${siteBase()}/admin/releases`;
}

export async function gateMail({ to, subject, title, lines = [], cta = null }) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return false;
  const body = lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("");
  try {
    await sendViaSes({
      from: senderFor({ marketing: false }),
      replyTo: replyToAddress(),
      to: recipients,
      subject,
      html: wrapEmail({ title: title || subject, preheader: subject, body, cta }),
    });
    return true;
  } catch (err) {
    // SES refused (sandbox, unverified recipient, throttle). Report and stop;
    // there is deliberately no fallback provider for this mail.
    console.error("[release-gate] SES send failed:", subject, err?.name, err?.message);
    return false;
  }
}

export function describeCandidate(c) {
  const from = c.fromVersion ? `v${esc(c.fromVersion)}` : "not yet released";
  return `<strong>${esc(c.displayName || c.productKey)}</strong> (${esc(c.productKey)}): ${from} &rarr; <strong>v${esc(c.toVersion || "?")}</strong>`;
}

export { esc };
