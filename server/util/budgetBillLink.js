// Robust budget↔bill linker.
//
// A budget/material/labour line belongs to the bill line whose `code` it
// references (`billIdentity` / `sourceTakeoffCode`). When the plugin didn't
// stamp that code on a line — e.g. QUIV Material-module materials carry only
// `takeoffLine` + `elementIds`, while the labour line carries the code — we
// fall back to Revit element-ID overlap, then to a normalized title match.
// A second pass anchors still-un-coded materials onto the bill code of a
// resolved sibling (the work item's labour line carries the bill code), so a
// bill line's material AND labour bundle together even on legacy data.
//
// Pure (no DB / mongoose), so it unit-tests trivially like billBudgetCascade.js.

function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

// Keep bracket content (e.g. "[T:225mm Masonry]") so wall-type variants stay
// distinct; just fold punctuation/arrows to spaces and collapse whitespace.
export function normalizeTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function eidsOf(line) {
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
// which carries the bill code). Never overwrites existing bill entries.
function addAnchors(index, lines, codes) {
  lines.forEach((l, i) => {
    const code = codes[i];
    if (!code) return;
    for (const eid of eidsOf(l)) {
      const k = Number(eid);
      if (Number.isFinite(k) && !index.byElement.has(k)) index.byElement.set(k, code);
    }
    for (const t of [l?.takeoffLine, l?.description]) {
      const nt = normalizeTitle(t);
      if (nt && !index.byTitle.has(nt)) index.byTitle.set(nt, code);
    }
  });
}

export function resolveBillIdentity(line, index) {
  if (!line || !index) return "";

  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  const eids = eidsOf(line);
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
// the bill items, then — using the codes found as anchors — re-resolve whatever
// is still unlinked. Pure; does not mutate.
export function resolveAll(items, lines) {
  const list = Array.isArray(lines) ? lines : [];
  const index = buildBillIndex(items);
  const codes = new Array(list.length).fill("");
  list.forEach((l, i) => {
    codes[i] = resolveBillIdentity(l, index);
  });
  addAnchors(index, list, codes);
  list.forEach((l, i) => {
    if (!codes[i]) codes[i] = resolveBillIdentity(l, index);
  });
  return codes;
}

// Mutate budgetItems in place: set `billIdentity` to the resolved bill code
// wherever we can establish or improve the link. Returns { items, linked }.
export function backfillBudgetLinks(items, budgetItems) {
  const list = Array.isArray(budgetItems) ? budgetItems : [];
  if (!list.length) return { items: list, linked: 0 };
  const codes = resolveAll(items, list);
  let linked = 0;
  list.forEach((b, i) => {
    const resolved = codes[i];
    if (b && resolved && norm(b.billIdentity) !== resolved.toLowerCase()) {
      b.billIdentity = resolved;
      linked += 1;
    }
  });
  return { items: list, linked };
}
