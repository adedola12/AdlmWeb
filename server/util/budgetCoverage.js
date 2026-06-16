// Ensure every bill line's Budget is complete: it must carry a Labour line
// (qty = the work-item quantity) AND at least one Material line, all bundled.
//
// QUIV's Material module only breaks down concrete-type items (cement / sand /
// granite, …). Membrane / mesh / fill / formwork / earthwork items arrive with
// labour only (or nothing). So for any bill line missing a Labour or a Material
// line we synthesise one at the item's own quantity — a sensible, priceable
// default the QS can rate (or zero). Real breakdowns from the plugin are left
// untouched; this only fills gaps.
//
// Pure (no DB / mongoose). Synthetic `sn` is deterministic (per bill-line code)
// so user pricing/procurement edits survive re-heals via the sn|name|unit|kind
// merge key.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isLabour(b) {
  const k = String(b?.componentKind || "").trim().toLowerCase();
  return k === "labour" || k === "labor";
}

// Work items that are pure labour (no material is bought/placed) — these show
// a Labour line only. Everything else defaults to Material + Labour.
// Start-anchored stems (no trailing \b) so "excavat" matches "excavation",
// "compact" matches "compacting", etc.
const LABOUR_ONLY_RE =
  /\b(?:excavat|disposal|dispose|cart\s*away|compact|levell?ing|earthwork[\s-]?support|planking|strutting|backfill|back\s*fill|setting[\s-]?out|site\s*clearance|clearing|topsoil|ramming|grading|hand[\s-]?trim)/i;

function isLabourOnly(it) {
  return LABOUR_ONLY_RE.test(
    `${it?.description || ""} ${it?.takeoffLine || ""}`,
  );
}

// "Oversite – DPM [L:Multiple | T:Oversite]" → "Oversite – DPM"
function cleanName(s) {
  return String(s || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Stable, collision-resistant ordinal for a bill code's synthetic lines.
function codeOrdinal(code) {
  let h = 0;
  const s = String(code || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 1000000;
  }
  return 900000000 + h * 2; // material = base, labour = base + 1
}

export function ensureBillItemCoverage(items, budgetItems) {
  const list = Array.isArray(budgetItems) ? budgetItems.slice() : [];
  const billItems = Array.isArray(items) ? items : [];
  if (!billItems.length) return list;

  const byCode = new Map();
  for (const b of list) {
    const code = String(b?.billIdentity || "").trim().toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }

  const synth = (it, code, kind, name, snOffset) => ({
    billIdentity: code,
    sn: codeOrdinal(code) + snOffset,
    description: name,
    materialName: name,
    takeoffLine: cleanName(it?.description || it?.takeoffLine) || name,
    componentKind: kind,
    category: String(it?.category || "").trim(),
    trade: String(it?.trade || "").trim(),
    unit: String(it?.unit || "").trim(),
    qty: num(it?.qty),
    rate: 0,
    netUnitCost: 0,
    overheadPercent: 0,
    profitPercent: 0,
    budgetRate: 0,
    procured: false,
    procuredAt: null,
    procuredPercent: 0,
    targetDate: null,
    supplier: "",
    notes: "",
    elementIds: Array.isArray(it?.elementIds)
      ? it.elementIds.map(Number).filter(Number.isFinite)
      : [],
  });

  for (const it of billItems) {
    const code = String(it?.code || "").trim();
    if (!code || num(it?.qty) <= 0) continue;
    const lines = byCode.get(code.toLowerCase()) || [];
    if (!lines.some(isLabour)) {
      list.push(synth(it, code, "Labour", "Labour", 1));
    }
    // Material only for items that actually carry material — labour-only items
    // (excavation, disposal, compaction, earthwork support, backfill…) stay
    // labour-only.
    if (!isLabourOnly(it) && !lines.some((b) => !isLabour(b))) {
      const name = cleanName(it?.description || it?.takeoffLine) || "Material";
      list.push(synth(it, code, "Material", name, 0));
    }
  }
  return list;
}
