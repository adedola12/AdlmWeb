// Project resources — the gang and plant detail behind a Budget line.
//
// The Budget carries ONE Labour row and ONE Plant row per item (the owner's
// rule, 23 Sep 2026). The detail underneath — three masons, two labourers, a
// mixer and its operator, at their day rates and outputs — belongs here.
//
// WHY THIS IS A SEPARATE ARRAY, AND NOT MORE budgetItems ROWS.
//
// deriveBillRatesFromBudget sums EVERY budget row under a billIdentity to get
// the line's net, and then drives the bill rate from it — on save AND on a
// plain GET. Gang rows sitting in budgetItems would therefore be added to the
// Labour row that already carries their total, double-counting the labour and
// raising the client's bill by roughly 20% the next time anyone merely OPENED
// the project. Nothing would be shown, nothing clicked, and the bill would be
// wrong.
//
// So these rows live in `resourceItems`, which deriveBillRates.js,
// budgetCoverage.js and budgetBillLink.js never read — they are handed
// `budgetItems` explicitly and have no other route to a project's arrays.
// projectResources.test.js asserts exactly that.
//
// They are also kept off projectForClient's payload and served by their own
// endpoint, so no route a desktop plugin calls changes shape.
//
// Pure (no DB / mongoose).

import { classifyResourceKind, kindLabel, KIND } from "./resourceKind.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
}

function txt(v, max = 200) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** Where a resource row came from, for the same replace-only-my-own rule. */
export const RESOURCE_SOURCE_RATE = "rategen-rate";

/**
 * Clean a client-supplied resources array.
 *
 * Deliberately narrow: quantities, rates and names, and nothing that could be
 * mistaken for a budget row. There is no billIdentity-free path in or out, so
 * a row can always be traced to the bill line whose Labour it explains.
 */
export function sanitizeResourceItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const r of list.slice(0, 20000)) {
    if (!r || typeof r !== "object") continue;
    const billIdentity = txt(r.billIdentity || r.sourceTakeoffCode, 200);
    const name = txt(r.name || r.description || r.resourceName, 300);
    if (!billIdentity || !name) continue;
    out.push({
      billIdentity,
      sn: num(r.sn),
      name,
      componentKind: kindLabel(classifyResourceKind(name, r.componentKind), "Labour"),
      trade: txt(r.trade),
      unit: txt(r.unit, 50),
      // How many of this resource the gang has (3 masons), and for how long
      // (0.4 days per m³). Kept apart so a QS can tune either.
      quantity: round(num(r.quantity), 4),
      duration: round(num(r.duration), 4),
      rate: round(num(r.rate)),
      notes: txt(r.notes, 1000),
      rateSource: txt(r.rateSource, 40),
    });
  }
  return out;
}

/** What one resource row costs: how many × how long × the rate. */
export function resourceCost(r) {
  const spans = num(r?.duration) > 0 ? num(r.duration) : 1;
  return num(r?.quantity) * spans * num(r?.rate);
}

/**
 * The gang detail implied by a rate's build-up, for one bill line.
 *
 * Every labour and plant component of the rate becomes a resource row, scaled
 * onto the bill quantity. These rows EXPLAIN the Budget's Labour and Plant
 * rows; they never add to them.
 */
export function buildResourcesFromRate(item, rate, opts = {}) {
  const billIdentity = txt(item?.code, 200);
  const billQty = num(item?.qty);
  if (!billIdentity || billQty <= 0) return [];

  const components = Array.isArray(rate?.composition?.components)
    ? rate.composition.components
    : Array.isArray(rate?.breakdown)
      ? rate.breakdown.map((l) => ({
          name: l?.componentName || l?.refName || l?.description,
          kind: l?.refKind ?? l?.rateType,
          quantity: l?.quantity,
          unit: l?.unit,
          unitPrice: l?.unitPrice,
        }))
      : [];

  const scale = num(opts.scale) > 0 ? num(opts.scale) : 1;
  const out = [];
  let sn = 0;
  for (const c of components) {
    const kind = classifyResourceKind(c?.name, c?.kind);
    if (kind !== KIND.LABOUR && kind !== KIND.PLANT && kind !== KIND.EQUIPMENT) continue;
    const name = txt(c?.name, 300);
    if (!name) continue;
    sn += 1;
    out.push({
      billIdentity,
      sn,
      name,
      componentKind: kindLabel(kind),
      trade: txt(item?.trade),
      unit: txt(c?.unit, 50),
      quantity: round(num(c?.quantity) * billQty * scale, 4),
      duration: 0,
      rate: round(num(c?.unitPrice)),
      notes: "",
      rateSource: RESOURCE_SOURCE_RATE,
    });
  }
  return out;
}

/**
 * Replace one bill line's rate-written resource rows.
 *
 * The same rule the Budget uses: only rows this code wrote for THIS line go;
 * a row the QS typed stays. Without the stamp a QS who added a night-shift
 * gang would lose it the next time the rate was re-picked.
 */
export function applyResourceRows(existing, code, rows) {
  const billCode = txt(code, 200).toLowerCase();
  const list = Array.isArray(existing) ? existing : [];
  if (!billCode) return list.slice();
  const mine = (r) =>
    String(r?.billIdentity || "").trim().toLowerCase() === billCode &&
    r?.rateSource === RESOURCE_SOURCE_RATE;
  return list.filter((r) => !mine(r)).concat(Array.isArray(rows) ? rows : []);
}

/**
 * What the gang for a bill line comes to, by resource class.
 *
 * For a reconciliation panel: the QS can see whether the gang they described
 * actually comes to the Labour row the Budget is pricing. A difference is
 * information, not an error — the Budget's figure is the one that bills.
 */
export function summariseResources(resourceItems, code) {
  const billCode = txt(code, 200).toLowerCase();
  const out = { labour: 0, plant: 0, total: 0, rows: 0 };
  for (const r of Array.isArray(resourceItems) ? resourceItems : []) {
    if (billCode && String(r?.billIdentity || "").trim().toLowerCase() !== billCode) continue;
    const cost = resourceCost(r);
    const kind = classifyResourceKind(r?.name, r?.componentKind);
    if (kind === KIND.PLANT || kind === KIND.EQUIPMENT) out.plant += cost;
    else out.labour += cost;
    out.total += cost;
    out.rows += 1;
  }
  out.labour = round(out.labour);
  out.plant = round(out.plant);
  out.total = round(out.total);
  return out;
}
