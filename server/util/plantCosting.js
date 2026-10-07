// A machine, costed by the day from its parts and used by the hour.
//
// Richard's R2 design. A mixer, a poker vibrator, an excavator or a tipper is
// priced from what it actually costs to have on site for a day — hire (or
// ownership), fuel, operator, maintenance, transport — and that day cost is
// turned into an hourly rate at a STATED number of working hours per day.
// A rate then consumes the machine by the hour: 0.25 h of mixer per m³.
//
// Why by the hour: a per-day hire figure is the wrong unit to build a unit
// rate from. A mixer is on a cubic metre for a quarter of an hour, not a day,
// so a rate carrying "1 day of mixer" per m³ is priced several times over.
//
// NO SILENT ZERO. A machine with a part that has a quantity but no price, or
// with no working hours, has NO hourly rate (null) and says why. It is never
// priced at ₦0, and plantLine() refuses to write a line for it.
//
// Hours per day is a judgement (8? 10?), so it is stored on the machine,
// shown next to the hourly rate, and editable. There is no hidden default in
// the arithmetic: DEFAULT_HOURS_PER_DAY only pre-fills a new machine's form.
//
// Pure: no Mongo, so every figure can be tested.

export const PART_KINDS = Object.freeze([
  "hire",
  "ownership",
  "fuel",
  "operator",
  "maintenance",
  "transport",
  "other",
]);

export const PART_LABELS = Object.freeze({
  hire: "Hire",
  ownership: "Ownership",
  fuel: "Fuel",
  operator: "Operator",
  maintenance: "Maintenance",
  transport: "Transport",
  other: "Other",
});

export const DEFAULT_HOURS_PER_DAY = 8;
export const PLANT_UNIT = "hr";

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function partAmount(p) {
  const q = num(p?.quantity);
  const u = num(p?.unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return Math.max(0, q) * Math.max(0, u);
}

/**
 * The day cost, hours and hourly rate of one machine, with anything that
 * stops it being priced.
 *
 * @returns {{ dayCost:number, hoursPerDay:number|null, hourlyRate:number|null,
 *             priced:boolean, problems:string[], parts:object[] }}
 */
export function plantCosting(plant = {}) {
  const problems = [];
  const parts = (Array.isArray(plant.parts) ? plant.parts : []).map((p) => ({
    kind: PART_KINDS.includes(p?.kind) ? p.kind : "other",
    description: String(p?.description || "").trim(),
    quantity: Number.isFinite(num(p?.quantity)) ? num(p.quantity) : 0,
    unit: String(p?.unit || "").trim(),
    unitPrice: Number.isFinite(num(p?.unitPrice)) ? num(p.unitPrice) : 0,
    amount: round2(partAmount(p)),
  }));

  for (const p of parts) {
    if (p.quantity > 0 && !(p.unitPrice > 0)) {
      problems.push(`${p.description || PART_LABELS[p.kind]} has no price`);
    }
  }
  const dayCost = round2(parts.reduce((n, p) => n + p.amount, 0));
  if (!(dayCost > 0)) problems.push("No part of this machine is priced");

  const h = num(plant.hoursPerDay);
  const hoursPerDay = Number.isFinite(h) && h > 0 && h <= 24 ? h : null;
  if (hoursPerDay === null) problems.push("Say how many hours it works in a day");

  const priced = problems.length === 0;
  return {
    parts,
    dayCost,
    hoursPerDay,
    hourlyRate: priced ? round2(dayCost / hoursPerDay) : null,
    priced,
    problems,
  };
}

/** What is wrong with a machine someone is saving, or null. */
export function plantProblem(plant = {}) {
  if (!String(plant.name || "").trim()) return "Give the machine a name";
  const h = num(plant.hoursPerDay);
  if (!Number.isFinite(h) || h <= 0) return "Hours per day has to be more than 0";
  if (h > 24) return "Hours per day cannot be more than 24";
  const parts = Array.isArray(plant.parts) ? plant.parts : [];
  if (!parts.length) return "Add at least one part: hire, fuel, operator and so on";
  for (const p of parts) {
    if (p?.kind && !PART_KINDS.includes(p.kind)) return `'${p.kind}' is not a kind of part`;
    const q = num(p?.quantity);
    const u = num(p?.unitPrice);
    if (!Number.isFinite(q) || q < 0) return "A part's quantity has to be 0 or more";
    if (!Number.isFinite(u) || u < 0) return "A part's price has to be 0 or more";
  }
  return null;
}

export class PlantUnpricedError extends Error {
  constructor(name, problems) {
    super(`${name || "This machine"} has no hourly rate: ${problems.join("; ")}`);
    this.code = "PLANT_UNPRICED";
    this.problems = problems;
  }
}

/**
 * The breakdown line a rate carries for this machine: `hoursPerUnit` hours of
 * it per unit of the rate, at its hourly rate. Shaped exactly like every other
 * breakdown line (componentName / quantity / unit / unitPrice / lineTotal /
 * refKind / refSn / refName / priceAsOf) with refKind "plant" and unit "hr",
 * so buildRateComposition classifies it as plant and the plugins receive a
 * stored lineTotal (HERON reads totals only, never qty × price).
 *
 * Throws PlantUnpricedError for a machine with no hourly rate.
 */
export function plantLine(plant, hoursPerUnit) {
  const c = plantCosting(plant);
  if (!c.priced) throw new PlantUnpricedError(plant?.name, c.problems);
  const hours = num(hoursPerUnit);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error("Hours per unit has to be 0 or more");
  }
  const name = String(plant.name || "").trim();
  return {
    componentName: name,
    quantity: hours,
    unit: PLANT_UNIT,
    unitPrice: c.hourlyRate,
    lineTotal: round2(hours * c.hourlyRate),
    refKind: "plant",
    refSn: Number.isFinite(Number(plant.sn)) && plant.sn !== null ? Number(plant.sn) : null,
    refName: name,
    priceAsOf: plant.priceAsOf || plant.updatedAt || null,
  };
}

/**
 * ADLM's machines with the customer's own versions laid over them.
 *
 * A customer row with `baseSn` replaces that ADLM machine for this customer
 * (their own fuel price, their own hours); one without is a machine of their
 * own. ADLM's row is never changed by it.
 */
export function mergePlantLibrary(master = [], mine = []) {
  const byBase = new Map();
  const own = [];
  for (const m of Array.isArray(mine) ? mine : []) {
    if (m?.baseSn != null) byBase.set(Number(m.baseSn), m);
    else own.push(m);
  }
  const view = (p, source, extra = {}) => ({
    sn: p.sn ?? null,
    key: p.key || "",
    name: p.name,
    category: p.category || "",
    notes: p.notes || "",
    priceAsOf: p.priceAsOf || p.updatedAt || null,
    source,
    ...extra,
    ...plantCosting(p),
  });
  const rows = [];
  for (const p of Array.isArray(master) ? master : []) {
    if (p?.enabled === false) continue;
    const copy = byBase.get(Number(p.sn));
    rows.push(
      copy
        ? view({ ...copy, sn: p.sn, name: copy.name || p.name }, "your-copy", {
            key: copy.key,
            adlm: { hourlyRate: plantCosting(p).hourlyRate, hoursPerDay: p.hoursPerDay },
          })
        : view(p, "adlm"),
    );
  }
  for (const p of own) rows.push(view({ ...p, sn: null }, "yours"));
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** A machine as it arrives from a form, cleaned for storage. Returns { plant, problem }. */
export function cleanPlantInput(body = {}) {
  const parts = (Array.isArray(body.parts) ? body.parts : [])
    .map((p) => ({
      kind: String(p?.kind || "other").trim().toLowerCase(),
      description: String(p?.description || "").trim(),
      quantity: num(p?.quantity),
      unit: String(p?.unit || "").trim(),
      unitPrice: num(p?.unitPrice),
    }))
    // A row with nothing typed on it is an empty form row, not a part.
    .filter((p) => p.description || p.quantity > 0 || p.unitPrice > 0);
  const plant = {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    hoursPerDay: num(body.hoursPerDay),
    parts,
    notes: String(body.notes || "").trim(),
  };
  const problem = plantProblem(plant);
  return { plant, problem };
}
