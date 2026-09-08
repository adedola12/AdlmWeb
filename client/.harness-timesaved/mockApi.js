// Throwaway mock of client/src/api.js for viewing DsAdminTimeSaved without a
// server or a login. Deterministic fake data in the exact response shapes of
// server/routes/admin.takeoff.js. Not committed.

const RATES = {
  sheetSetupMinutes: 8,
  areaItemMinutes: 4,
  linearItemMinutes: 2.5,
  countItemMinutes: 1,
  mixedItemMinutes: 3,
  revitElementMinutes: 1.5,
  elementTypeMinutes: 5,
  boqLineMinutes: 3,
};
const ACTIVE = {
  version: "2026.09-assumed",
  rates: RATES,
  notes:
    "Initial working assumptions set by ADLM Studio in September 2026 for the launch of the Takeoff Time Log. Not measured. Replace with timed manual takeoffs by creating a new version.",
  activatedAt: "2026-09-01T08:00:00Z",
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRMS = [
  ["lekki-build-and-co", "Lekki Build & Co", ["seed.ade@example.invalid", "seed.chioma@example.invalid", "seed.musa@example.invalid"]],
  ["northgate-quantity-surveyors", "Northgate Quantity Surveyors", ["seed.tunde@example.invalid", "seed.ngozi@example.invalid"]],
  ["abuja-cost-partners", "Abuja Cost Partners", ["seed.kemi@example.invalid", "seed.ibrahim@example.invalid"]],
  [null, "", ["seed.solo1@example.invalid", "seed.solo2@example.invalid"]],
];

function sessions() {
  const r = rng(7);
  const out = [];
  const now = Date.now();
  for (let i = 0; i < 200; i++) {
    const f = FIRMS[Math.floor(r() * FIRMS.length)];
    const email = f[2][Math.floor(r() * f[2].length)];
    const product = r() < 0.6 ? "HERON" : "QUIV";
    const startedAt = new Date(now - r() * 90 * 86400000);
    const items = Math.max(1, Math.round(30 * Math.exp(r() * 2 - 0.5)));
    const active = Math.round(items * (product === "HERON" ? 14 : 4) * (0.7 + r() * 0.8)) + 120;
    const est = Math.round(items * (product === "HERON" ? 3 : 1.5) * 60 + 5 * 60 * 4 + 3 * 60 * 12);
    const cancelled = r() < 0.06;
    out.push({
      email, firmId: f[0], firmName: f[1], product, startedAt, items,
      activeSeconds: active, est, saved: Math.max(0, est - active), cancelled,
      version: r() < 0.85 ? "2026.09-assumed" : "2026.09-assumed",
      method: r() < 0.15 ? "user_calibration" : "admin_rate_table",
    });
  }
  return out;
}
const ALL = sessions();

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const monday = (d) => {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
};

function shape(list) {
  return {
    sessions: list.length,
    activeSeconds: list.reduce((n, s) => n + s.activeSeconds, 0),
    estimatedManualSeconds: list.reduce((n, s) => n + s.est, 0),
    savedSeconds: list.reduce((n, s) => n + s.saved, 0),
    items: list.reduce((n, s) => n + s.items, 0),
    medianActiveSeconds: median(list.map((s) => s.activeSeconds)),
    medianEstimatedManualSeconds: median(list.map((s) => s.est)),
    users: new Set(list.map((s) => s.email)).size,
    lastAt: list.length ? new Date(Math.max(...list.map((s) => s.startedAt.getTime()))) : null,
  };
}

function summary(params) {
  const from = new Date(params.get("from"));
  const to = new Date(params.get("to"));
  const product = params.get("product") || "";
  const firmId = params.get("firmId") || "";
  const seeded = params.get("includeSeeded") === "1";
  const groupBy = params.get("groupBy") || "week";
  let live = ALL.filter((s) => s.startedAt >= from && s.startedAt <= to);
  if (product) live = live.filter((s) => s.product === product);
  if (firmId) live = live.filter((s) => s.firmId === firmId);
  const cancelled = live.filter((s) => s.cancelled).length;
  const seededCount = 0;
  const kept = live.filter((s) => !s.cancelled);
  const keyOf = (s) =>
    groupBy === "week" ? monday(s.startedAt) : groupBy === "firm" ? s.firmId || "" : groupBy === "user" ? s.email : s.product;
  const groups = {};
  for (const s of kept) (groups[keyOf(s)] ||= []).push(s);
  let list = Object.entries(groups).map(([key, l]) => ({
    key,
    label: groupBy === "user" ? key : groupBy === "firm" ? l[0].firmName || "Personal licences" : key,
    firmName: l[0].firmName,
    products: [...new Set(l.map((s) => s.product))],
    ...shape(l),
  }));
  list.sort((a, b) => (groupBy === "week" ? a.key.localeCompare(b.key) : b.savedSeconds - a.savedSeconds));
  const versions = {};
  for (const s of kept) {
    const k = `${s.version}|${s.method}`;
    versions[k] ||= { version: s.version, method: s.method, sessions: 0, savedSeconds: 0 };
    versions[k].sessions++;
    versions[k].savedSeconds += s.saved;
  }
  return {
    from, to, groupBy,
    filters: { product, firmId, includeSeeded: seeded, includeCancelled: false },
    totals: { ...shape(kept), cancelledSessions: cancelled, seededSessions: seededCount },
    groups: list,
    baselineVersions: Object.values(versions),
    activeBaseline: ACTIVE,
    methodology: { idleGapSeconds: 120 },
  };
}

export async function apiAuthed(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const [p, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");
  if (p === "/admin/takeoff/summary") return summary(params);
  if (p === "/admin/takeoff/firms")
    return { rows: FIRMS.filter((f) => f[0]).map((f) => ({ firmId: f[0], firmName: f[1], sessions: ALL.filter((s) => s.firmId === f[0]).length })) };
  if (p === "/admin/takeoff/baselines")
    return {
      rateKeys: Object.keys(RATES),
      rows: [
        { id: "b1", version: ACTIVE.version, rates: RATES, notes: ACTIVE.notes, active: true, createdAt: "2026-09-01T08:00:00Z", activatedAt: ACTIVE.activatedAt, sessions: 188 },
      ],
    };
  if (p.startsWith("/admin/takeoff/baselines") && opts.method === "POST") return { ok: true };
  throw new Error("unmocked " + path);
}
export const api = apiAuthed;
