// Client mirror of server/util/budgetBillLink.js — keep the two in sync.
//
// Resolves which bill line a budget/material/labour line belongs to so the
// Budget tab can bundle each bill line's material + labour together and lay
// them out in Bill order, even for projects saved before the server linker
// existed. Match order: explicit code → Revit element-ID overlap → title.

export function normalizeTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildBillIndex(items) {
  const byCode = new Map();
  const byElement = new Map();
  const byTitle = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const code = String(it?.code ?? "").trim();
    if (!code) continue;
    const lc = code.toLowerCase();
    if (!byCode.has(lc)) byCode.set(lc, code);
    for (const eid of Array.isArray(it?.elementIds) ? it.elementIds : []) {
      const k = Number(eid);
      if (Number.isFinite(k) && !byElement.has(k)) byElement.set(k, code);
    }
    for (const t of [it?.description, it?.takeoffLine, it?.materialName]) {
      const nt = normalizeTitle(t);
      if (nt && !byTitle.has(nt)) byTitle.set(nt, code);
    }
  }
  return { byCode, byElement, byTitle };
}

// `elementIds` may be passed explicitly (so callers can enrich a line whose own
// elementIds are empty from a sibling materialItems line).
export function resolveBillIdentity(line, index, elementIds) {
  if (!line || !index) return "";

  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  const eids = Array.isArray(elementIds) && elementIds.length
    ? elementIds
    : Array.isArray(line.elementIds)
      ? line.elementIds
      : [];
  if (eids.length && index.byElement.size) {
    const tally = new Map();
    for (const eid of eids) {
      const code = index.byElement.get(Number(eid));
      if (code) tally.set(code, (tally.get(code) || 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [code, n] of tally) {
      if (n > bestN) {
        best = code;
        bestN = n;
      }
    }
    if (best) return best;
  }

  for (const t of [line.takeoffLine, line.description, line.materialName]) {
    const nt = normalizeTitle(t);
    if (nt && index.byTitle.has(nt)) return index.byTitle.get(nt);
  }

  return explicit;
}
