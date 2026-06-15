// Client mirror of server/util/budgetBillLink.js — keep the two in sync.
//
// Resolves which bill line a budget/material/labour line belongs to so the
// Budget tab can bundle each bill line's material + labour together and lay
// them out in Bill order. Match order: explicit code → Revit element-ID
// overlap → title. A second pass anchors un-coded materials onto the bill code
// of an already-resolved sibling (the work item's labour line carries the bill
// code), so material + labour land in the SAME card even when the materials
// arrived without a code (legacy QUIV / pre-plugin-fix data).

export function normalizeTitle(s) {
  // Keep bracket content (e.g. "[T:225mm Masonry]") so wall-type variants stay
  // distinct; just fold punctuation/arrows to spaces and collapse whitespace.
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function eidsOf(line, getEids) {
  if (getEids) {
    const e = getEids(line);
    if (Array.isArray(e) && e.length) return e;
  }
  return Array.isArray(line?.elementIds) ? line.elementIds : [];
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

// Add element/title → code anchors from already-resolved lines (esp. labour,
// which carries the bill code). Lets un-coded materials bundle onto the same
// bill line via shared elements / takeoff title. Never overwrites bill entries.
function addAnchors(index, lines, codes, getEids) {
  lines.forEach((l, i) => {
    const code = codes[i];
    if (!code) return;
    for (const eid of eidsOf(l, getEids)) {
      const k = Number(eid);
      if (Number.isFinite(k) && !index.byElement.has(k)) index.byElement.set(k, code);
    }
    for (const t of [l?.takeoffLine, l?.description]) {
      const nt = normalizeTitle(t);
      if (nt && !index.byTitle.has(nt)) index.byTitle.set(nt, code);
    }
  });
}

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

// Resolve a bill code for EVERY line (parallel array). Two passes: first against
// the bill items, then — using the codes found (esp. labour's explicit code) as
// anchors — re-resolve whatever is still unlinked. Pure; does not mutate lines.
export function resolveAll(items, lines, getEids) {
  const list = Array.isArray(lines) ? lines : [];
  const index = buildBillIndex(items);
  const codes = new Array(list.length).fill("");
  // Pass 1 — against the bill.
  list.forEach((l, i) => {
    codes[i] = resolveBillIdentity(l, index, eidsOf(l, getEids));
  });
  // Anchor un-coded lines onto resolved siblings (material → its line's labour).
  addAnchors(index, list, codes, getEids);
  // Pass 2 — re-resolve the still-unlinked lines.
  list.forEach((l, i) => {
    if (!codes[i]) codes[i] = resolveBillIdentity(l, index, eidsOf(l, getEids));
  });
  return codes;
}
