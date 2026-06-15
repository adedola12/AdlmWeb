// Client mirror of server/util/budgetBillLink.js — keep the two in sync.
//
// Resolves which bill line a budget/material/labour line belongs to so the
// Budget bundles each bill line's material + labour together in Bill order.
//
// CONSERVATIVE — never dump unrelated materials onto the wrong bill line.
// Match order, each only when confident:
//   1. exact bill code (billIdentity / sourceTakeoffCode === bill code)
//   2. exact normalized title (brackets kept — variant-safe)
//   3. bracket-stripped title, but ONLY when it maps to exactly one bill line
//      (e.g. "Strip → Blinding" ↔ "Strip – Blinding"); ambiguous titles that
//      hit several variants are skipped so nothing is mis-filed
//   4. Revit element MAJORITY (most of the line's elements in one bill line)
// Anything else stays unlinked (grouped by its own takeoff line). Labour
// carries the bill code, so its elements/title also anchor a work item.

export function normalizeTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Like normalizeTitle but first drops "[L:… | T:…]" qualifiers, so a coarse
// material group ("Strip → Blinding") lines up with a bracketed bill
// description ("Strip – Blinding [L:Multiple | T:Oversite]").
export function strippedTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
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
  const byElement = new Map(); // elementId -> Set<code>
  const byTitle = new Map(); // exact normalized title -> code
  const byStripped = new Map(); // bracket-stripped title -> Set<code>
  for (const it of Array.isArray(items) ? items : []) {
    const code = String(it?.code ?? "").trim();
    if (!code) continue;
    const lc = code.toLowerCase();
    if (!byCode.has(lc)) byCode.set(lc, code);
    for (const eid of Array.isArray(it?.elementIds) ? it.elementIds : []) {
      const k = Number(eid);
      if (!Number.isFinite(k)) continue;
      let set = byElement.get(k);
      if (!set) {
        set = new Set();
        byElement.set(k, set);
      }
      set.add(code);
    }
    for (const t of [it?.description, it?.takeoffLine, it?.materialName]) {
      const nt = normalizeTitle(t);
      if (nt && !byTitle.has(nt)) byTitle.set(nt, code);
      const st = strippedTitle(t);
      if (st) {
        let set = byStripped.get(st);
        if (!set) {
          set = new Set();
          byStripped.set(st, set);
        }
        set.add(code);
      }
    }
  }
  return { byCode, byElement, byTitle, byStripped };
}

// The bill code that holds the MAJORITY of the line's elements, or "".
function bestByElement(eids, byElement) {
  if (!eids.length || !byElement.size) return "";
  const tally = new Map();
  for (const eid of eids) {
    const set = byElement.get(Number(eid));
    if (set) for (const code of set) tally.set(code, (tally.get(code) || 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [code, n] of tally) {
    if (n > bestN) {
      best = code;
      bestN = n;
    }
  }
  return best && bestN * 2 >= eids.length ? best : "";
}

export function resolveBillIdentity(line, index, elementIds) {
  if (!line || !index) return "";

  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  const titleSources = [line.takeoffLine, line.description, line.materialName];

  // Exact title (variant-safe).
  for (const t of titleSources) {
    const nt = normalizeTitle(t);
    if (nt && index.byTitle.has(nt)) return index.byTitle.get(nt);
  }

  // Bracket-stripped title — only when unambiguous (one bill line).
  if (index.byStripped) {
    for (const t of titleSources) {
      const st = strippedTitle(t);
      if (st && index.byStripped.has(st)) {
        const set = index.byStripped.get(st);
        if (set.size === 1) return [...set][0];
      }
    }
  }

  // Element majority.
  const eids = (
    Array.isArray(elementIds) && elementIds.length
      ? elementIds
      : Array.isArray(line.elementIds)
        ? line.elementIds
        : []
  )
    .map(Number)
    .filter(Number.isFinite);
  const byEl = bestByElement(eids, index.byElement);
  if (byEl) return byEl;

  return explicit;
}

// Add resolved lines' elements → their code, so a work item's materials can
// anchor onto its labour line's elements (labour carries the bill code).
function addAnchors(index, lines, codes, getEids) {
  lines.forEach((l, i) => {
    const code = codes[i];
    if (!code) return;
    for (const eid of eidsOf(l, getEids)) {
      const k = Number(eid);
      if (!Number.isFinite(k)) continue;
      let set = index.byElement.get(k);
      if (!set) {
        set = new Set();
        index.byElement.set(k, set);
      }
      set.add(code);
    }
  });
}

// Resolve a bill code for EVERY line (parallel array). Two passes. Pure.
export function resolveAll(items, lines, getEids) {
  const list = Array.isArray(lines) ? lines : [];
  const index = buildBillIndex(items);
  const codes = new Array(list.length).fill("");
  list.forEach((l, i) => {
    codes[i] = resolveBillIdentity(l, index, eidsOf(l, getEids));
  });
  addAnchors(index, list, codes, getEids);
  list.forEach((l, i) => {
    if (!codes[i]) codes[i] = resolveBillIdentity(l, index, eidsOf(l, getEids));
  });
  return codes;
}
