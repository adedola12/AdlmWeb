// A machine's day cost, working day and hourly rate, as the plant editor
// shows it while it is being typed.
//
// The same arithmetic as server/util/plantCosting.js plantCosting(), which is
// what the server stores and serves; the client cannot import server code, so
// this mirror is kept small and tested against the same worked figures. The
// server's figure is the one that counts: a saved machine is re-read from it.

import { toNum } from "./rateMath.js";

export const PART_KINDS = [
  { value: "hire", label: "Hire" },
  { value: "ownership", label: "Ownership" },
  { value: "fuel", label: "Fuel" },
  { value: "operator", label: "Operator" },
  { value: "maintenance", label: "Maintenance" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

export const DEFAULT_HOURS_PER_DAY = 8;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function partAmount(p) {
  return Math.max(0, toNum(p?.quantity)) * Math.max(0, toNum(p?.unitPrice));
}

/** { dayCost, hoursPerDay, hourlyRate|null, problems[] } — never a silent ₦0. */
export function plantFigures(plant = {}) {
  const parts = Array.isArray(plant.parts) ? plant.parts : [];
  const problems = [];
  for (const p of parts) {
    if (toNum(p.quantity) > 0 && !(toNum(p.unitPrice) > 0)) {
      problems.push(`${p.description || "A part"} has no price`);
    }
  }
  const dayCost = round2(parts.reduce((n, p) => n + partAmount(p), 0));
  if (!(dayCost > 0)) problems.push("No part of this machine is priced");
  const h = toNum(plant.hoursPerDay);
  const hoursPerDay = h > 0 && h <= 24 ? h : null;
  if (hoursPerDay === null) problems.push("Say how many hours it works in a day");
  return {
    dayCost,
    hoursPerDay,
    hourlyRate: problems.length ? null : round2(dayCost / hoursPerDay),
    problems,
  };
}

/** An editable copy of a machine (the server's row), or a blank one. */
export function plantDraft(p = null) {
  return {
    name: p?.name || "",
    category: p?.category || "",
    hoursPerDay: String(p?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY),
    notes: p?.notes || "",
    parts: (p?.parts?.length ? p.parts : [{ kind: "hire", description: "", quantity: 1, unit: "day", unitPrice: "" }]).map(
      (x) => ({
        kind: x.kind || "other",
        description: x.description || "",
        quantity: x.quantity ?? "",
        unit: x.unit || "",
        unitPrice: x.unitPrice ?? "",
      }),
    ),
  };
}

/** What stops this draft being saved, in words, or null. */
export function plantDraftProblem(d) {
  if (!String(d.name || "").trim()) return "Give the machine a name";
  const h = toNum(d.hoursPerDay);
  if (!(h > 0)) return "Hours per day has to be more than 0";
  if (h > 24) return "Hours per day cannot be more than 24";
  const f = plantFigures(d);
  return f.problems[0] || null;
}
