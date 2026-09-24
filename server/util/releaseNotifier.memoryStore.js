// server/util/releaseNotifier.memoryStore.js
//
// TEST SUPPORT ONLY: nothing in the app imports this. The in-memory stand-in
// for mongoStore (util/releaseNotifier.js) that releaseNotifier.test.js and
// routes/admin.releaseNotifications.test.js drive the real send loop against.
//
// It keeps the same rules the Mongo store leans on: one notice per key, one
// ledger row per address per notice, a claim that only succeeds on a pending
// row, and the deployment as customers see it (`deployments`, keyed by
// productKey; absent means deleted). So "a crash halfway does not double-send",
// "SES refusing stops the run" and "a pulled build is never announced" are
// exercised end to end rather than asserted about a mock of Mongoose.

import { tallyCounts } from "./releaseNotifier.js";
import { maxVersion } from "./releaseVersion.js";

const OPEN = ["pending", "sending", "failed"];
const clone = (x) => (x == null ? x : structuredClone(x));
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function memoryStore({ users = [], changelogs = {}, deployments = {} } = {}) {
  const notices = new Map();
  const rows = [];
  const writes = [];
  const sendLog = [];
  const deps = new Map(Object.entries(deployments));
  let seq = 0;
  const id = () => `id${String((seq += 1)).padStart(6, "0")}`;
  const statusOk = (doc, where) =>
    !where || (Array.isArray(where) ? where.includes(doc.status) : doc.status === where);

  return {
    notices,
    rows,
    writes,
    sendLog,
    users,
    deployments: deps,

    async findNotice(k) {
      for (const n of notices.values()) if (n._id === k || n.key === k) return clone(n);
      return null;
    },
    async insertNotice(doc) {
      writes.push("insertNotice");
      if (notices.has(doc.key)) return { notice: clone(notices.get(doc.key)), created: false };
      const n = { _id: id(), enrolledAt: null, startedAt: null, error: "", createdAt: new Date(Date.now() + seq), ...clone(doc) };
      notices.set(doc.key, n);
      return { notice: clone(n), created: true };
    },
    async lastAnnouncedVersion(pk) {
      return maxVersion([...notices.values()].filter((n) => n.productKey === pk && n.status !== "cancelled").map((n) => n.version));
    },
    async setNotice(key, set, where = null) {
      writes.push("setNotice");
      const n = notices.get(key);
      if (!n || !statusOk(n, where)) return null;
      Object.assign(n, clone(set));
      return clone(n);
    },
    async closeOpenNotices(pk, { exceptKey = "", match, set }) {
      const hit = [];
      for (const n of notices.values()) {
        if (n.productKey === pk && OPEN.includes(n.status) && n.key !== exceptKey && match(n.version)) {
          writes.push("closeOpenNotices");
          Object.assign(n, clone(set));
          hit.push(n.key);
        }
      }
      return hit;
    },
    async listOpenNotices() {
      return [...notices.values()]
        .filter((n) => ["pending", "sending"].includes(n.status))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(clone);
    },
    async changelogFor(slug) {
      return changelogs[slug] || null;
    },
    async deploymentFor(pk) {
      return clone(deps.get(String(pk || "").trim().toLowerCase()) ?? null);
    },
    // Written independently of the code under test, to the Mongo filter's
    // meaning: not disabled, has an address, and ONE entitlement that is for
    // the product, active, and not past the start of today.
    async audience(keys, now) {
      const today = startOfDay(now);
      return users
        .filter(
          (u) =>
            u.disabled !== true &&
            u.email &&
            (u.entitlements || []).some(
              (e) => keys.includes(e.productKey) && e.status === "active" && (!e.expiresAt || new Date(e.expiresAt) >= today),
            ),
        )
        .map(clone);
    },
    async usersByIds(ids) {
      const want = new Set(ids.map(String));
      return users.filter((u) => want.has(String(u._id))).map(clone);
    },
    async enrol(newRows) {
      writes.push("enrol");
      const ordered = [...newRows].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
      for (const r of ordered) {
        if (rows.some((x) => x.noticeKey === r.noticeKey && x.emailHash === r.emailHash)) continue; // unique index
        rows.push({ _id: id(), attempts: 0, claimedAt: null, error: "", ...clone(r) });
      }
    },
    async pendingBatch(key, limit) {
      return rows.filter((r) => r.noticeKey === key && r.status === "pending").slice(0, limit).map(clone);
    },
    async claim(rowId, at) {
      const r = rows.find((x) => x._id === rowId);
      if (!r || r.status !== "pending") return false;
      r.status = "sending";
      r.claimedAt = at;
      r.attempts += 1;
      return true;
    },
    async settle(rowId, set, from) {
      const r = rows.find((x) => x._id === rowId);
      if (!r || r.status !== from) return false;
      Object.assign(r, clone(set));
      return true;
    },
    async counts(key) {
      const groups = new Map();
      for (const r of rows.filter((x) => x.noticeKey === key)) {
        const g = `${r.status}|${r.skipReason || ""}`;
        groups.set(g, (groups.get(g) || 0) + 1);
      }
      return tallyCounts(
        [...groups].map(([g, n]) => ({ status: g.split("|")[0], skipReason: g.split("|")[1], n })),
      );
    },
    async requeue(key, { includeInFlight = false } = {}) {
      let n = 0;
      for (const r of rows) {
        if (r.noticeKey !== key) continue;
        if (r.status === "failed" || (includeInFlight && r.status === "sending")) {
          r.status = "pending";
          r.error = "";
          n += 1;
        }
      }
      return n;
    },
    logSend(entry) {
      sendLog.push(entry);
    },
  };
}

/* ─────────────────────────────────────────────────── fixtures the tests share ── */

export const quiet = { log() {}, warn() {}, error() {} };
export const noPause = async () => {};

export const live = (productKey = "revit", extra = {}) => ({ productKey, status: "active", ...extra });

export function person(n, over = {}) {
  return {
    _id: `u${n}`,
    email: `user${n}@firm.test`,
    firstName: `User${n}`,
    emailVerified: true,
    emailUndeliverable: false,
    disabled: false,
    notifications: { productUpdates: true },
    entitlements: [live()],
    ...over,
  };
}

export const PRODUCTION = {
  ProductionAccessEnabled: true,
  SendingEnabled: true,
  SendQuota: { MaxSendRate: 14, Max24HourSend: 50000, SentLast24Hours: 12 },
};

/** A stub SES: records every message, returns a message id. Never reaches AWS. */
export function stubSes({ failFor = () => null } = {}) {
  const calls = [];
  const send = async (m) => {
    calls.push(m);
    const err = failFor(m, calls.length);
    if (err) throw err;
    return `msg-${calls.length}`;
  };
  return { calls, send };
}

export const sesErr = (name, message, status = 400) =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } });

/** A deployment document as the PUT writes it: switched on, with a package. */
export const put = (version, extra = {}) => ({
  productKey: "revit",
  displayName: "QUIV for Revit",
  version,
  enabled: true,
  packageUri: "https://cdn.test/quiv.zip",
  ...extra,
});
