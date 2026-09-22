// The arithmetic behind a rate, in one place.
//
// Three screens do the same sum — the build-up (DsWorkRate), the composition
// card and the custom-rate builder — and three copies of it is three chances
// for the screens to disagree with each other about what a rate costs. The
// figures a customer sees have to agree, so the sum lives here and each screen
// reads it.
//
// It is OUR formula, deliberately, not the prototype's: net is the sum of the
// component lines, overhead and profit are both taken ON NET (never compounded
// one on the other), and the total is net + overhead + profit. That is exactly
// what the server does in computeTotals() (server/util/rategenUserRates.js) and
// in RateGenRate's pre-save hook, so a figure typed on the website and the
// figure stored against the rate are the same figure.

export const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * What one build-up line comes to.
 *
 * The sync route sends this as `lineTotal`; the composition block sends it as
 * `totalCost`; older desktop payloads called it `totalPrice`. Reading only one
 * of the three is how every Amount on /work/rate/:id came to read NGN 0 — the
 * screen asked for a field its own endpoint has never sent. All three are
 * accepted, and quantity × unit price is the last resort.
 */
export function lineAmount(line = {}) {
  const raw =
    line.lineTotal ?? line.totalCost ?? line.totalPrice ?? line.amount ?? null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
    return toNum(raw);
  }
  return toNum(line.quantity) * toNum(line.unitPrice);
}

// The kinds the server classifies a component into (classifyComponentKind in
// server/util/rategenUserRates.js). Consumables are bought like materials and
// equipment is hired like plant, so each sits with the group it behaves like.
const KIND_GROUP = {
  material: "material",
  consumable: "material",
  labour: "labour",
  plant: "plant",
  equipment: "plant",
};

export function groupForKind(kind) {
  return KIND_GROUP[String(kind || "").trim().toLowerCase()] || "other";
}

export const GROUP_LABELS = {
  material: "Materials",
  labour: "Labour",
  plant: "Plant",
  other: "Other",
};

const GROUP_ORDER = ["material", "labour", "plant", "other"];

/**
 * The components of a rate, whichever shape they arrive in.
 *
 * `composition.components` is preferred because the server has already
 * classified each line's kind there, including the plant lines that carry no
 * explicit refKind. `breakdown` is the fallback, and its raw refKind is passed
 * through the same classifier by name so the grouping does not change
 * depending on which field the route happened to send.
 */
export function componentsOf(rate = {}) {
  const comp = rate?.composition?.components;
  if (Array.isArray(comp) && comp.length) {
    return comp.map((c) => ({
      name: c.name || c.refName || c.componentName || "",
      kind: String(c.kind || "").toLowerCase(),
      quantity: toNum(c.quantity),
      unit: c.unit || "",
      unitPrice: toNum(c.unitPrice),
      amount: lineAmount(c),
      refSn: c.refSn ?? null,
      refName: c.refName || "",
      priceAsOf: c.priceAsOf ?? null,
    }));
  }
  const rows = Array.isArray(rate.breakdown) ? rate.breakdown : [];
  return rows.map((l) => ({
    name: l.componentName || l.refName || l.description || "",
    kind: String(l.refKind || "").toLowerCase(),
    quantity: toNum(l.quantity),
    unit: l.unit || "",
    unitPrice: toNum(l.unitPrice),
    amount: lineAmount(l),
    refSn: l.refSn ?? null,
    refName: l.refName || "",
    priceAsOf: l.priceAsOf ?? null,
  }));
}

/** Components filed under Materials / Labour / Plant, empty groups dropped. */
export function groupComponents(components = []) {
  const byGroup = new Map();
  for (const c of components) {
    const g = groupForKind(c.kind);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(c);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => {
    const items = byGroup.get(g);
    return {
      id: g,
      label: GROUP_LABELS[g],
      items,
      total: items.reduce((n, c) => n + toNum(c.amount), 0),
    };
  });
}

/**
 * Net, overhead, profit and total from a set of lines and two percentages.
 * Both percentages are taken on net — our rule, and the server's.
 *
 * `carriedNet` is the part of a rate's stored net cost that no line explains
 * (see unexplainedNet). It is CARRIED, not dropped. A master rate's net cost
 * is often larger than the sum of its itemised lines, and a customer who edits
 * one quantity must not silently lose that remainder: the rate they save is
 * the rate their next bill is priced from, so it has to keep its value unless
 * they changed it themselves.
 */
export function totalsFrom(
  components = [],
  overheadPercent = 0,
  profitPercent = 0,
  carriedNet = 0,
) {
  const net = components.reduce((n, c) => n + toNum(c.amount), 0) + toNum(carriedNet);
  const oh = toNum(overheadPercent);
  const pr = toNum(profitPercent);
  const overheadValue = (net * oh) / 100;
  const profitValue = (net * pr) / 100;
  return {
    netCost: net,
    overheadPercent: oh,
    profitPercent: pr,
    overheadValue,
    profitValue,
    totalCost: net + overheadValue + profitValue,
  };
}

/**
 * What the stored net cost carries that no component explains.
 *
 * Rounded to the kobo so a float artefact never invents a line; anything that
 * survives that is a real gap between the figure a rate holds and the build-up
 * behind it, which is the thing this screen exists to show.
 */
export function unexplainedNet(storedNet, components = []) {
  const sum = components.reduce((n, c) => n + toNum(c.amount), 0);
  const v = Math.round((toNum(storedNet) - sum) * 100) / 100;
  // Normalise -0, which formats as "-₦0.00" and reads as a fault that is not
  // there.
  return v === 0 ? 0 : v;
}

/**
 * What is wrong with a typed percentage, in words, or null if nothing is.
 *
 * ONE RULE, AND BOTH SCREENS KEEP IT. The build-up used to clamp overhead and
 * profit to 60% while the box still showed what the user typed, so what was
 * saved was not what was on screen; the custom-rate builder did not clamp at
 * all, so a rate built at 80% profit silently became 60% the first time it was
 * re-saved from the build-up. There is no 60% anywhere in the server, the
 * desktop or any other screen in this app — it was invented here — so it is
 * gone. A percentage is saved exactly as it is typed.
 *
 * The only figure refused is one that cannot be a percentage of anything: text,
 * or a negative, which would price a rate below the cost of building it. A
 * refusal is said out loud and nothing is written; no figure is ever rewritten
 * behind the customer.
 *
 * A blank is not a problem here: each screen documents what blank means (the
 * build-up reads it as 0, the builder as its stated default) and shows that
 * figure in its own totals.
 */
export function percentProblem(label, value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return `${label} has to be a number`;
  if (n < 0) return `${label} cannot be less than 0%`;
  return null;
}
