// Robust budget↔bill linker.
//
// A budget/material/labour line belongs to the bill line whose `code` it
// references (`billIdentity` / `sourceTakeoffCode`). When the plugin didn't
// stamp that code on a line — e.g. QUIV Material-module materials carry only
// `takeoffLine` + `elementIds`, while the labour line carries the code — we
// fall back to Revit element-ID overlap, then to a normalized title match, so
// each bill line's material AND labour still bundle to the same line.
//
// Pure (no DB / mongoose), so it unit-tests trivially like billBudgetCascade.js.

function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

// Normalize a title for fuzzy matching: drop "[L:All Floors | T:…]" qualifiers,
// turn arrows/punctuation into spaces, collapse whitespace.
export function normalizeTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Build lookup maps from the bill items[]: code, element-id, and title → code.
// First occurrence wins so the order of items[] (= the Bill order) is honoured.
export function buildBillIndex(items) {
  const byCode = new Map(); // lowercased code -> original code
  const byElement = new Map(); // elementId -> original code
  const byTitle = new Map(); // normalized title -> original code
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

// Resolve the bill code a single budget line belongs to. Returns the original
// bill code, or "" when nothing matches.
export function resolveBillIdentity(line, index) {
  if (!line || !index) return "";

  // 1) Explicit code that exists in the bill.
  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  // 2) Revit element-ID overlap (the bill line sharing the most elements wins).
  const eids = Array.isArray(line.elementIds) ? line.elementIds : [];
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

  // 3) Normalized title (takeoffLine, then description, then materialName).
  for (const t of [line.takeoffLine, line.description, line.materialName]) {
    const nt = normalizeTitle(t);
    if (nt && index.byTitle.has(nt)) return index.byTitle.get(nt);
  }

  // 4) Keep an explicit code even when the bill has no matching line, so we
  //    never lose linkage the plugin already provided.
  return explicit;
}

// Mutate budgetItems in place: set `billIdentity` to the resolved bill code
// wherever we can establish or improve the link. Returns { items, linked }.
export function backfillBudgetLinks(items, budgetItems) {
  const list = Array.isArray(budgetItems) ? budgetItems : [];
  const index = buildBillIndex(items);
  if (index.byCode.size === 0) return { items: list, linked: 0 };
  let linked = 0;
  for (const b of list) {
    if (!b) continue;
    const resolved = resolveBillIdentity(b, index);
    if (resolved && norm(b.billIdentity) !== resolved.toLowerCase()) {
      b.billIdentity = resolved;
      linked += 1;
    }
  }
  return { items: list, linked };
}
