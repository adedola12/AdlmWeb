// Where a project's content came from: the Model, Drawings and Services tabs.
//
// His model() (work-proj.js:1738), drawings() (:1817) and services() (:1833).
// One module because all three answer the same question from three different
// origins, and each is small.
//
// WHAT HIS FIXTURE HAD AND WE DO NOT
//
//   p.model.versions   three kept IFC versions with a drift list between them.
//                      We store ONE model per discipline (models.architectural,
//                      .structural, .mep, .civil), each with an R2 key and a
//                      validation result. There is no version history to show,
//                      so the Model tab shows what we do have — which model is
//                      attached and whether its elements still answer the bill —
//                      rather than a version list with one row in it.
//   p.sheets           a list of PlanSwift sheets with a bill-item count each.
//                      Nothing in our data records a sheet. What every HERON
//                      line DOES record is `takeoffLine` — where on the drawings
//                      it was measured — so the Drawings tab groups by that. It
//                      is the same interaction (pick a place, see its lines) off
//                      data that actually exists, rather than an invented sheet
//                      register.
//
// Services is the one that maps straight across: linkedProjects with
// linkType "sum" is exactly his services link.

import { safeNum } from "../projects/lib/projectTotals.js";
import { amountOf, isPriced, measuredAt } from "./billModel.js";

/* ───────────────────────────── Model ───────────────────────────── */

export const DISCIPLINES = Object.freeze([
  { key: "architectural", label: "Architectural" },
  { key: "structural", label: "Structural" },
  { key: "mep", label: "Services" },
  { key: "civil", label: "Civil" },
]);

const VALIDATION = Object.freeze({
  valid: { label: "Matches the bill", tone: "ok" },
  invalid: { label: "Does not match the bill", tone: "warn" },
  "no-quantities": { label: "Nothing measured from it yet", tone: "" },
  unchecked: { label: "Not checked yet", tone: "" },
});

/** Every model attached to this project, with what its check found. */
export function attachedModels(project) {
  const models = project?.models || {};
  return DISCIPLINES.map(({ key, label }) => {
    const m = models[key] || {};
    const v = m.validation || {};
    const status = String(v.status || "unchecked").toLowerCase();
    return {
      key,
      label,
      attached: Boolean(m.sourceFile || m.url),
      sourceFile: m.sourceFile || "",
      format: m.format || "ifc",
      sizeBytes: safeNum(m.sizeBytes),
      uploadedAt: m.uploadedAt || null,
      status,
      statusLabel: VALIDATION[status]?.label || VALIDATION.unchecked.label,
      tone: VALIDATION[status]?.tone || "",
      requiredCount: safeNum(v.requiredCount),
      matchedCount: safeNum(v.matchedCount),
      missingCount: safeNum(v.missingCount),
      elementCount: safeNum(v.ifcElementCount),
      checkedAt: v.checkedAt || null,
    };
  }).filter((m) => m.attached);
}

/**
 * His drift note, from what we actually check.
 *
 * He compares two IFC versions. We compare the model against the bill: how many
 * of the element ids the quantities need are missing from it. Different
 * comparison, same warning — a bill that no longer answers to its model — so it
 * is worded for what was checked.
 */
export function modelWarning(project) {
  const bad = attachedModels(project).filter((m) => m.status === "invalid" && m.missingCount > 0);
  if (!bad.length) return null;
  const total = bad.reduce((a, m) => a + m.missingCount, 0);
  return {
    count: total,
    disciplines: bad.map((m) => m.label),
    text:
      `${total} element${total === 1 ? "" : "s"} the bill was measured from ` +
      `${total === 1 ? "is" : "are"} missing from the model`,
  };
}

export const formatSize = (bytes) => {
  const n = safeNum(bytes);
  if (n <= 0) return "";
  if (n >= 1048576) return `${Math.round(n / 1048576)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

/* ─────────────────────────── Drawings ─────────────────────────── */

/**
 * Where this bill was measured, and how much came from each place.
 *
 * His sheet register, off `takeoffLine` — the one field a HERON line carries
 * that says where on the drawings it came from. Sorted by item count, because
 * the sheet a job was mostly measured from is the one worth seeing first.
 */
export function measuredPlaces(items) {
  const list = Array.isArray(items) ? items : [];
  const byPlace = new Map();
  list.forEach((it, i) => {
    const place = measuredAt(it);
    if (!place) return;
    if (!byPlace.has(place)) byPlace.set(place, { place, indexes: [], value: 0, priced: 0 });
    const row = byPlace.get(place);
    row.indexes.push(i);
    row.value += amountOf(it);
    if (isPriced(it)) row.priced += 1;
  });
  return [...byPlace.values()].sort(
    (a, b) => b.indexes.length - a.indexes.length || a.place.localeCompare(b.place),
  );
}

/** Lines with no `takeoffLine` at all — they belong to no place. */
export function unplacedCount(items) {
  return (Array.isArray(items) ? items : []).filter((it) => !measuredAt(it)).length;
}

/* ─────────────────────────── Services ─────────────────────────── */

/**
 * The services projects rolled into this one.
 *
 * linkType "sum" is his services link: only the linked project's TOTAL comes
 * in, as a single line. "merge" is the federated container, which is a
 * different feature and is deliberately not listed here — a merged source is
 * not a service, it is part of this bill.
 */
export function linkedServices(project) {
  const links = Array.isArray(project?.linkedProjects) ? project.linkedProjects : [];
  const summaries = Array.isArray(project?.linkedSummaries) ? project.linkedSummaries : [];
  const byId = new Map(
    summaries.map((s) => [String(s?.projectId || s?.id || ""), s]),
  );

  return links
    .filter((l) => String(l?.linkType || "sum") === "sum")
    .map((l) => {
      const id = String(l?.projectId || "");
      const s = byId.get(id) || {};
      const live = s.live || {};
      const snap = l.snapshot || s.snapshot || {};
      return {
        id,
        name: l.label || s.name || snap.name || "Services project",
        discipline: l.discipline || "mep",
        // The live figure where we have one, the snapshot where we do not — and
        // `stale` says which, because a snapshot is what the total was, not
        // what it is.
        total: safeNum(live.total ?? snap.total),
        stale: live.total == null,
        itemCount: safeNum(live.itemCount ?? snap.itemCount),
        pricedPercent: Math.max(0, Math.min(100, safeNum(live.pricedPercent ?? snap.pricedPercent))),
        addedAt: l.addedAt || null,
      };
    });
}

/** What the linked services add to this project's estimate. */
export const linkedServicesTotal = (project) =>
  linkedServices(project).reduce((a, s) => a + s.total, 0);
