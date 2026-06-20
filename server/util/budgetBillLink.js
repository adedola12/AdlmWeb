// Robust budget↔bill linker. CONSERVATIVE — never dump unrelated materials onto
// the wrong bill line. Match order, each only when confident:
//   1. exact bill code (billIdentity / sourceTakeoffCode === bill code)
//   2. exact normalized title (brackets kept — variant-safe)
//   3. bracket-stripped title, but ONLY when it maps to exactly one bill line
//      (e.g. "Strip → Blinding" ↔ "Strip – Blinding"); ambiguous titles that
//      hit several variants are skipped so nothing is mis-filed
//   4. Revit element MAJORITY (most of the line's elements in one bill line)
// Anything else stays unlinked (grouped by its own takeoff line). Labour carries
// the bill code, so its elements anchor a work item's materials in pass two.
//
// FINAL RESCUE (resolveAll only): a row STILL unlinked after every confident
// rule is adopted by the bill line that owns the PLURALITY of its elements
// (unique max, no tie). This is looser than the rule-4 majority gate, but it
// runs only on leftovers and is strictly better than the alternative — leaving a
// real concrete/blockwork breakdown (cement/sand/aggregate that arrived
// code-less with ambiguous-stripping variant titles) stranded, where
// ensureBillItemCoverage then SHADOWS it with a single synthetic "Material"
// line and hides the genuine breakdown. Plurality is safe against the old
// "35 materials dumped onto Strip–Blinding" regression: it routes each row to
// where MOST of its elements physically live, never onto a line it barely
// touches, and a real tie stays unlinked. The single-line resolveBillIdentity
// stays strictly conservative (majority) — the rescue is a whole-list decision.
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

export function strippedTitle(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
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
  const byStripped = new Map(); // stripped title -> Set<code>
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

// The bill code that owns the PLURALITY of a line's elements: the unique code
// sharing the most elements (≥1, no tie), or "". Looser than bestByElement's
// majority gate — used ONLY as the final rescue for leftovers in resolveAll.
// Safe by construction: a row whose elements mostly live in its true home goes
// there (the shared "slab" element a foundation line touches can't outvote the
// row's own elements), and an even split stays unlinked.
function pluralityByElement(eids, byElement) {
  if (!eids.length || !byElement.size) return "";
  const tally = new Map();
  for (const eid of eids) {
    const set = byElement.get(Number(eid));
    if (set) for (const code of set) tally.set(code, (tally.get(code) || 0) + 1);
  }
  let best = "";
  let bestN = 0;
  let tie = false;
  for (const [code, n] of tally) {
    if (n > bestN) {
      best = code;
      bestN = n;
      tie = false;
    } else if (n === bestN) {
      tie = true;
    }
  }
  return best && bestN >= 1 && !tie ? best : "";
}

export function resolveBillIdentity(line, index) {
  if (!line || !index) return "";

  const explicit = String(
    line.billIdentity || line.sourceTakeoffCode || line.code || "",
  ).trim();
  if (explicit && index.byCode.has(explicit.toLowerCase())) {
    return index.byCode.get(explicit.toLowerCase());
  }

  const titleSources = [line.takeoffLine, line.description, line.materialName];

  for (const t of titleSources) {
    const nt = normalizeTitle(t);
    if (nt && index.byTitle.has(nt)) return index.byTitle.get(nt);
  }

  if (index.byStripped) {
    for (const t of titleSources) {
      const st = strippedTitle(t);
      if (st && index.byStripped.has(st)) {
        const set = index.byStripped.get(st);
        if (set.size === 1) return [...set][0];
      }
    }
  }

  const eids = eidsOf(line).map(Number).filter(Number.isFinite);
  const byEl = bestByElement(eids, index.byElement);
  if (byEl) return byEl;

  return explicit;
}

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
  // Re-anchor with whatever the second pass linked, then rescue the remainder by
  // element plurality so a real-but-hard-to-link breakdown is rehomed onto its
  // bill line instead of being stranded and shadowed by a synthetic line.
  addAnchors(index, list, codes);
  list.forEach((l, i) => {
    if (codes[i]) return;
    const eids = eidsOf(l).map(Number).filter(Number.isFinite);
    const home = pluralityByElement(eids, index.byElement);
    if (home) codes[i] = home;
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
