// Client mirror of server/util/budgetBillLink.js — keep the two in sync.
//
// Resolves which bill line a budget/material/labour line belongs to so the
// Budget can bundle each bill line's material + labour together in Bill order.
//
// CONSERVATIVE by design — it must NEVER dump unrelated materials onto the wrong
// bill line. Match order, each only when confident:
//   1. exact bill code (billIdentity / sourceTakeoffCode === bill code)
//   2. Revit element MAJORITY (most of the line's elements live in one bill
//      line; a single shared element is not enough)
//   3. exact normalized title
// Anything else stays unlinked (grouped by its own takeoff line) rather than
// being mis-filed. Labour reliably carries the bill code, so its elements
// anchor a work item's materials in pass two.

export function normalizeTitle(s) {
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
  const byElement = new Map(); // elementId -> Set<code>
  const byTitle = new Map();
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
    }
  }
  return { byCode, byElement, byTitle };
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
  // Majority of the line's own elements must fall in that bill line.
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

  for (const t of [line.takeoffLine, line.description, line.materialName]) {
    const nt = normalizeTitle(t);
    if (nt && index.byTitle.has(nt)) return index.byTitle.get(nt);
  }

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

// Resolve a bill code for EVERY line (parallel array). Two passes: against the
// bill, then — using resolved lines' elements as anchors — re-resolve the rest.
// Pure; does not mutate lines.
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
