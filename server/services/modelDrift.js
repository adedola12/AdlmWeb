// server/services/modelDrift.js
//
// Model drift alerts (work-board item r2-model-drift-alerts).
//
// The desktop plugin (QUIV now, QUIV for ArchiCAD later) compares the open
// model with the element IDs and quantities last saved to a cloud project and
// POSTs a summary. Everything here that decides something is a pure function
// of (project, report, now), so the rules are tested without a database:
//
//   normalizeDriftReport()  whitelist the plugin's body, field by field
//   applyDriftReport()      open / refresh / clear / ignore the project's drift
//   clearDriftOnTakeoffSave() a take-off save from the model closes it
//   dismissDrift()          "not a real change"
//
// Privacy (the take-off timing rule, privacy policy section "Take-off
// timing"): counts and bill-line codes only. The model is identified only by
// `modelRef`, a one-way code of the project's model fingerprint. Line codes
// must already be codes of this project's bill, so nothing new about the model
// is learnt from a report, and anything that is not on the whitelist (names,
// paths, element IDs, quantities) is dropped before it reaches Mongo.
import crypto from "node:crypto";

export const DRIFT_PRODUCTS = new Set(["revit", "archicad"]);
export const MAX_DRIFT_LINES = 500;
// Seven days, the window the success metric measures a re-save within.
export const RESAVE_WINDOW_MS = 7 * 86400000;

const MODEL_REF_RE = /^[0-9a-f]{64}$/;

/**
 * The one-way code a plugin sends for the model behind a project: lowercase
 * hex SHA-256 of the project's stored model fingerprint, trimmed. The server
 * recomputes it from the fingerprint it already holds, so a report made
 * against another copy of the model (another fingerprint) is refused, and the
 * fingerprint itself never travels in a drift report.
 */
export function modelRefFor(fingerprint) {
  const fp = String(fingerprint ?? "").trim();
  if (!fp) return "";
  return crypto.createHash("sha256").update(fp, "utf8").digest("hex");
}

const count = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e7) : 0;
};

function parseDate(v, fallback) {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Rebuild the plugin's report from a whitelist.
 *
 * @param raw        request body
 * @param billCodes  Set of the project's bill-line codes; a line whose code is
 *                   not on the bill is dropped (it could only carry something
 *                   the web does not already hold).
 * @param now        server clock
 * @returns {{ report } | { error }}
 */
export function normalizeDriftReport(raw, billCodes, now = new Date()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "report must be an object" };

  const modelRef = String(raw.modelRef ?? "").trim().toLowerCase();
  if (!MODEL_REF_RE.test(modelRef)) return { error: "modelRef must be a 64-character hex SHA-256" };

  const codes = billCodes instanceof Set ? billCodes : new Set();
  const byCode = new Map();
  for (const l of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!l || typeof l !== "object") continue;
    const code = String(l.code ?? "").trim();
    if (!code || !codes.has(code)) continue;
    const cur = byCode.get(code) || { code, added: 0, removed: 0, changed: 0 };
    cur.added += count(l.added);
    cur.removed += count(l.removed);
    cur.changed += count(l.changed);
    byCode.set(code, cur);
  }
  const lines = [...byCode.values()]
    .filter((l) => l.added || l.removed || l.changed)
    .sort((a, b) => b.added + b.removed + b.changed - (a.added + a.removed + a.changed) || a.code.localeCompare(b.code))
    .slice(0, MAX_DRIFT_LINES);

  // Totals are the plugin's (an element can touch several lines, so they are
  // not the sum of the lines), but never less than what the lines show.
  const c = raw.counts && typeof raw.counts === "object" ? raw.counts : {};
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const counts = {
    added: count(c.added),
    removed: count(c.removed),
    changed: count(c.changed),
    linesAffected: lines.length,
    elementsChecked: count(c.elementsChecked),
  };
  if (!counts.added && sum("added")) counts.added = sum("added");
  if (!counts.removed && sum("removed")) counts.removed = sum("removed");
  if (!counts.changed && sum("changed")) counts.changed = sum("changed");

  // Drift is what touches the bill. Elements the plugin saw change that feed
  // no saved line (a view, an annotation, a category that is not measured)
  // are not drift, however many there are: that is the false-alarm guard.
  const drifted = lines.length > 0;
  if (!drifted) {
    counts.added = 0;
    counts.removed = 0;
    counts.changed = 0;
  }

  const checkedAt = parseDate(raw.checkedAt, now);
  // A client clock in the future is read as now.
  const report = {
    modelRef,
    drifted,
    counts,
    lines,
    signature: drifted ? signatureOf(lines) : "",
    checkedAt: checkedAt > now ? now : checkedAt,
    basisVersion: count(raw.basisVersion),
    productVersion: String(raw.productVersion ?? "").trim().slice(0, 40),
  };
  return { report };
}

/** A stable digest of the per-line counts. */
export function signatureOf(lines) {
  const canon = [...(lines || [])]
    .map((l) => `${l.code}:${l.added}:${l.removed}:${l.changed}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(canon, "utf8").digest("hex").slice(0, 32);
}

const plain = (d) => (d && typeof d.toObject === "function" ? d.toObject() : d ? { ...d } : null);

/**
 * Decide what a report does to the project's current drift.
 *
 * @returns {{
 *   action: "open" | "refresh" | "clear" | "ignore",
 *   drift: object | null,   // the new project.modelDrift (null = unchanged)
 *   notify: boolean,        // email the owner (first detection only)
 *   reason?: string,
 * }}
 */
export function applyDriftReport(current, report, now = new Date()) {
  const cur = plain(current) || { status: "none" };
  const status = cur.status || "none";

  if (!report.drifted) {
    if (status !== "open") return { action: "ignore", drift: null, notify: false, reason: "no drift" };
    return {
      action: "clear",
      drift: { ...cur, status: "cleared", clearedAt: now, clearedBy: "clean-check", checkedAt: report.checkedAt },
      notify: false,
    };
  }

  // Somebody already said this exact change is not real: keep it dismissed.
  if (status === "dismissed" && cur.signature && cur.signature === report.signature) {
    return { action: "ignore", drift: null, notify: false, reason: "dismissed" };
  }

  const base = {
    modelRef: report.modelRef,
    checkedAt: report.checkedAt,
    basisVersion: report.basisVersion,
    counts: report.counts,
    lines: report.lines,
    signature: report.signature,
    productVersion: report.productVersion,
    clearedAt: null,
    clearedBy: "",
    dismissedReason: "",
  };

  if (status === "open") {
    return {
      action: "refresh",
      drift: { ...cur, ...base, status: "open", detectedAt: cur.detectedAt || report.checkedAt },
      notify: false,
    };
  }

  return {
    action: "open",
    drift: { ...base, status: "open", detectedAt: report.checkedAt, notifiedAt: null, eventId: null },
    notify: true,
  };
}

/**
 * A take-off saved from the model re-measures the bill, so it closes any open
 * drift. Returns the new drift, or null when there was nothing to close.
 */
export function clearDriftOnTakeoffSave(current, now = new Date()) {
  const cur = plain(current);
  if (!cur || cur.status !== "open") return null;
  return { ...cur, status: "cleared", clearedAt: now, clearedBy: "takeoff-save" };
}

/** "Not a real change". Returns the new drift, or null when none is open. */
export function dismissDrift(current, reason, now = new Date()) {
  const cur = plain(current);
  if (!cur || cur.status !== "open") return null;
  return {
    ...cur,
    status: "dismissed",
    clearedAt: now,
    clearedBy: "dismissed",
    dismissedReason: String(reason || "not-a-real-change").trim().slice(0, 200),
  };
}

/**
 * True when a save request is a take-off saved FROM THE MODEL. The desktop
 * plugins send the model fingerprint on every save; the web never does, so a
 * web rate or progress edit leaves an open drift alone.
 */
export function isTakeoffSaveFromModel(body) {
  if (!body || typeof body !== "object") return false;
  const fp = String(body.modelFingerprint ?? body.fingerprint ?? "").trim();
  return Boolean(fp) && (Array.isArray(body.items) || Array.isArray(body.takeoffItems));
}

/** What the client needs for a badge: small, and safe for any reader. */
export function driftForClient(drift) {
  const d = plain(drift);
  if (!d || !d.status || d.status === "none") return null;
  return {
    status: d.status,
    detectedAt: d.detectedAt || null,
    checkedAt: d.checkedAt || null,
    clearedAt: d.clearedAt || null,
    clearedBy: d.clearedBy || "",
    counts: {
      added: d.counts?.added || 0,
      removed: d.counts?.removed || 0,
      changed: d.counts?.changed || 0,
      linesAffected: d.counts?.linesAffected || 0,
    },
    lines: (d.lines || []).map((l) => ({
      code: l.code,
      added: l.added || 0,
      removed: l.removed || 0,
      changed: l.changed || 0,
    })),
  };
}
