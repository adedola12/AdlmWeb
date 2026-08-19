// server/util/followUps.js
//
// Builds the renewal call list from live data.
//
// Two sources, one row per person:
//   • User.entitlements whose expiry has passed  → reason "expired"
//   • Purchase.status === "pending"              → reason "pending"
//
// The rebuild is IDEMPOTENT and non-destructive. It refreshes the snapshot a
// caller reads off the screen (which products, how overdue, what they tried to
// buy) and never touches the work state — status, assignment, notes and the
// call log all survive. That matters because this list is rebuilt often: a
// rebuild that reset "already called, waiting for their accountant" back to
// "to call" would make the whole thing untrustworthy within a day.
//
// A person who no longer matches either reason is not deleted. They are marked
// active:false, so the call history that explains WHY they renewed is still
// there next quarter.
import dayjs from "dayjs";
import { User } from "../models/User.js";
import { Product } from "../models/Product.js";
import { Purchase } from "../models/Purchase.js";
import { FollowUp } from "../models/FollowUp.js";

/**
 * Effective status of one entitlement, resolving `status` against `expiresAt`.
 *
 * The stored status alone is not enough: nothing rewrites "active" to
 * "expired" the moment a date passes, so an entitlement can sit at "active"
 * with an expiry two months in the past. This is the same rule
 * admin.usersLite.js applies, kept in step deliberately — the two screens
 * disagreeing about who is expired would be worse than the duplication.
 */
export function effectiveStatus(ent, now = dayjs()) {
  const raw = String(ent?.status || "inactive").toLowerCase();
  const exp = ent?.expiresAt ? dayjs(ent.expiresAt) : null;

  if (raw === "disabled") return "disabled";
  if (!exp || !exp.isValid()) return raw === "active" ? "active" : "inactive";
  if (exp.isAfter(now)) return raw === "active" ? "active" : "inactive";
  // Expiry has passed. An entitlement that was never activated is "inactive"
  // rather than churn — nobody lost anything, so it is not a renewal call.
  return raw === "active" ? "expired" : "inactive";
}

const fullNameOf = (u) =>
  [u?.firstName, u?.lastName].map((s) => String(s || "").trim()).filter(Boolean);

/** Human summary of what a pending purchase was for. */
function purchaseItems(p) {
  const lines = Array.isArray(p?.lines) ? p.lines : [];
  const names = lines
    .map((ln) => {
      const base = String(ln?.name || ln?.productKey || "").trim();
      if (!base) return "";
      const qty = Number(ln?.qty || 1);
      const periods = Number(ln?.periods || 1);
      const bits = [];
      if (qty > 1) bits.push(`${qty} seats`);
      if (periods > 1) bits.push(`${periods}×${ln?.billingInterval || "period"}`);
      return bits.length ? `${base} (${bits.join(", ")})` : base;
    })
    .filter(Boolean);

  if (names.length) return names.join(" · ");
  return String(p?.productKey || "").trim() || "—";
}

/** productKey → display name, so the caller sees "QUIV", not "revit". */
async function productNameMap() {
  const rows = await Product.find({}, { key: 1, name: 1 }).lean();
  const map = new Map();
  for (const p of rows || []) {
    const k = String(p?.key || "").trim().toLowerCase();
    if (k) map.set(k, String(p?.name || k).trim());
  }
  return map;
}

/**
 * Gather everyone who currently qualifies, keyed by lowercased email.
 *
 * @param {object} opts
 * @param {number} opts.expiredWithinDays  Only count entitlements that lapsed
 *   within this many days. 0 / null = no limit. Stops a rebuild from dragging
 *   in accounts that went cold three years ago.
 * @param {number} opts.pendingMinAgeHours Ignore purchases newer than this —
 *   somebody mid-checkout is not a follow-up call, they are a live customer.
 */
export async function collectCandidates({
  expiredWithinDays = 0,
  pendingMinAgeHours = 24,
} = {}) {
  const now = dayjs();
  const names = await productNameMap();
  const byEmail = new Map();

  const rowFor = (email) => {
    const key = String(email || "").trim().toLowerCase();
    if (!key) return null;
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: key,
        userId: null,
        firstName: "",
        lastName: "",
        phone: "",
        firmName: "",
        location: "",
        reasons: new Set(),
        products: [],
        purchases: [],
        hasActiveOther: false,
        accountDisabled: false,
      });
    }
    return byEmail.get(key);
  };

  /* ── expired entitlements ──────────────────────────────────────────── */
  const users = await User.find(
    { "entitlements.0": { $exists: true } },
    {
      email: 1,
      firstName: 1,
      lastName: 1,
      whatsapp: 1,
      firmName: 1,
      location: 1,
      disabled: 1,
      entitlements: 1,
    },
  ).lean();

  for (const u of users || []) {
    const ents = Array.isArray(u?.entitlements) ? u.entitlements : [];
    const expired = [];
    let anyActive = false;

    for (const e of ents) {
      const st = effectiveStatus(e, now);
      if (st === "active") {
        anyActive = true;
        continue;
      }
      if (st !== "expired") continue;

      const daysOverdue = Math.max(
        0,
        now.startOf("day").diff(dayjs(e.expiresAt).startOf("day"), "day"),
      );
      if (expiredWithinDays > 0 && daysOverdue > expiredWithinDays) continue;

      const key = String(e.productKey || "").trim().toLowerCase();
      expired.push({
        productKey: key,
        productName: names.get(key) || key || "—",
        expiresAt: e.expiresAt || null,
        daysOverdue,
        seats: Number(e.seats || 1),
        licenseType: String(e.licenseType || "personal"),
        organizationName: String(e.organizationName || ""),
      });
    }

    if (!expired.length) continue;

    const row = rowFor(u.email);
    if (!row) continue;

    row.userId = u._id;
    row.firstName = String(u.firstName || "").trim();
    row.lastName = String(u.lastName || "").trim();
    row.phone = String(u.whatsapp || "").trim();
    row.firmName = String(u.firmName || "").trim();
    row.location = String(u.location || "").trim();
    row.accountDisabled = !!u.disabled;
    row.hasActiveOther = anyActive;
    row.products = expired.sort((a, b) => b.daysOverdue - a.daysOverdue);
    row.reasons.add("expired");
  }

  /* ── pending purchases ─────────────────────────────────────────────── */
  const cutoff = now.subtract(Math.max(0, pendingMinAgeHours), "hour").toDate();
  const pending = await Purchase.find(
    { status: "pending", createdAt: { $lte: cutoff } },
    {
      email: 1,
      userId: 1,
      lines: 1,
      productKey: 1,
      totalAmount: 1,
      currency: 1,
      createdAt: 1,
      paymentProof: 1,
      organization: 1,
    },
  )
    .sort({ createdAt: -1 })
    .lean();

  for (const p of pending || []) {
    const row = rowFor(p?.email);
    if (!row) continue;

    if (!row.userId && p.userId) row.userId = p.userId;
    if (!row.firmName && p?.organization?.name) {
      row.firmName = String(p.organization.name).trim();
    }
    // Only fall back to the order's phone — the user's own WhatsApp number is
    // the one they answer, and it is set above when an account exists.
    if (!row.phone && p?.organization?.phone) {
      row.phone = String(p.organization.phone).trim();
    }

    row.purchases.push({
      purchaseId: p._id,
      items: purchaseItems(p),
      total: Number(p.totalAmount || 0),
      currency: String(p.currency || "NGN"),
      createdAt: p.createdAt || null,
      ageDays: p.createdAt ? now.diff(dayjs(p.createdAt), "day") : 0,
      hasReceipt: !!p?.paymentProof?.url,
    });
    row.reasons.add("pending");
  }

  /* ── fill in names for purchase-only rows ──────────────────────────── */
  const missing = Array.from(byEmail.values()).filter((r) => !r.firstName && !r.lastName);
  if (missing.length) {
    const docs = await User.find(
      { email: { $in: missing.map((r) => r.email) } },
      { email: 1, firstName: 1, lastName: 1, whatsapp: 1, firmName: 1, location: 1, disabled: 1 },
    ).lean();
    const map = new Map(
      (docs || []).map((d) => [String(d.email || "").toLowerCase(), d]),
    );
    for (const r of missing) {
      const d = map.get(r.email);
      if (!d) continue;
      r.userId = r.userId || d._id;
      r.firstName = String(d.firstName || "").trim();
      r.lastName = String(d.lastName || "").trim();
      if (!r.phone) r.phone = String(d.whatsapp || "").trim();
      if (!r.firmName) r.firmName = String(d.firmName || "").trim();
      if (!r.location) r.location = String(d.location || "").trim();
      r.accountDisabled = !!d.disabled;
    }
  }

  return Array.from(byEmail.values()).map((r) => {
    const maxDaysOverdue = r.products.reduce(
      (m, p) => Math.max(m, Number(p.daysOverdue || 0)),
      0,
    );
    const lastExpiredAt = r.products
      .map((p) => (p.expiresAt ? new Date(p.expiresAt).getTime() : 0))
      .reduce((m, t) => Math.max(m, t), 0);

    return {
      ...r,
      reasons: Array.from(r.reasons),
      maxDaysOverdue,
      lastExpiredAt: lastExpiredAt ? new Date(lastExpiredAt) : null,
    };
  });
}

/**
 * Rebuild the call list. Upserts every current candidate and retires rows that
 * no longer qualify. Returns counts for the "last rebuild" line in the UI.
 */
export async function rebuildFollowUps(opts = {}) {
  const startedAt = new Date();
  const candidates = await collectCandidates(opts);

  let created = 0;
  let updated = 0;

  for (const c of candidates) {
    // Snapshot only. Work state (status, assignment, note, calls, notion) is
    // untouched, and $setOnInsert seeds it for a genuinely new row.
    const res = await FollowUp.updateOne(
      { email: c.email },
      {
        $set: {
          userId: c.userId || null,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          firmName: c.firmName,
          location: c.location,
          reasons: c.reasons,
          products: c.products,
          purchases: c.purchases,
          maxDaysOverdue: c.maxDaysOverdue,
          lastExpiredAt: c.lastExpiredAt,
          hasActiveOther: c.hasActiveOther,
          accountDisabled: c.accountDisabled,
          active: true,
          resolvedAt: null,
          lastRebuiltAt: startedAt,
        },
        $setOnInsert: { status: "to_call", calls: [], callCount: 0 },
      },
      { upsert: true },
    );

    if (res.upsertedCount) created += 1;
    else updated += 1;
  }

  // Anything the rebuild did not touch no longer qualifies: they renewed, the
  // purchase was approved, or the expiry window moved past them.
  const emails = candidates.map((c) => c.email);
  const retired = await FollowUp.updateMany(
    { active: true, email: { $nin: emails } },
    { $set: { active: false, resolvedAt: startedAt } },
  );

  return {
    created,
    updated,
    retired: retired?.modifiedCount || 0,
    total: candidates.length,
    ranAt: startedAt,
  };
}

export default rebuildFollowUps;
