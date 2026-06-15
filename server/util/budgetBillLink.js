// Robust budget↔bill linker. CONSERVATIVE — it must never dump unrelated
// materials onto the wrong bill line. Match order, each only when confident:
//   1. exact bill code (billIdentity / sourceTakeoffCode === bill code)
//   2. Revit element MAJORITY (most of the line's elements live in one bill
//      line; a single shared element is not enough)
//   3. exact normalized title
// Anything else stays unlinked (grouped by its own takeoff line) rather than
// mis-filed. Labour reliably carries the bill code; its elements anchor a work
// item's materials in pass two.
//
// Pure (no DB / mongoose), so it unit-tests trivially like billBudgetCascade.js.

function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

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
  return best && bestN * 2 >= eids.length ? best : "";
}

export function resolveBillIdentity(line, index) {
  if (!line || !index) return "";

  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  const eids = eidsOf(line).map(Number).filter(Number.isFinite);
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
function addAnchors(index, lines, codes) {
  lines.forEach((l, i) => {
    const code = codes[i];
    if (!code) return;
    for (const eid of eidsOf(l)) {
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
