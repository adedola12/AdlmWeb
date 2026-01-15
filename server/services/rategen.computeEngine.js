import { RateGenMaterial } from "../models/RateGenMaterial.js";
import { RateGenLabour } from "../models/RateGenLabour.js";
import { RateGenComputeItem } from "../models/RateGenComputeItem.js";

function norm(s) {
  return (s || "").trim().toLowerCase();
}

/**
 * priceMode:
 *  - "current": always use latest library price
 *  - "cached": always use unitPriceAtBuild
 *  - "hybrid": use current when available, else fallback to cached
 */
export async function computeRate({
  section,
  name,
  overheadPercent,
  profitPercent,
  priceMode = "hybrid",
}) {
  const item = await RateGenComputeItem.findOne({
    section,
    name,
    enabled: true,
  }).lean();
  if (!item) {
    const err = new Error(`Compute item not found: ${section} / ${name}`);
    err.status = 404;
    throw err;
  }

  const oh = Number.isFinite(overheadPercent)
    ? overheadPercent
    : item.overheadPercentDefault ?? 10;

  const pf = Number.isFinite(profitPercent)
    ? profitPercent
    : item.profitPercentDefault ?? 25;

  // Fetch all referenced SNs in bulk (fast)
  const matSNs = item.lines
    .filter((l) => l.kind === "material" && l.refSn)
    .map((l) => l.refSn);
  const labSNs = item.lines
    .filter((l) => l.kind === "labour" && l.refSn)
    .map((l) => l.refSn);

  const [materials, labours] = await Promise.all([
    matSNs.length
      ? RateGenMaterial.find({ sn: { $in: matSNs }, enabled: true }).lean()
      : [],
    labSNs.length
      ? RateGenLabour.find({ sn: { $in: labSNs }, enabled: true }).lean()
      : [],
  ]);

  const matBySn = new Map(materials.map((m) => [m.sn, m]));
  const labBySn = new Map(labours.map((l) => [l.sn, l]));

  // Fallback maps by key/name (for legacy bindings)
  const matByKey = new Map(
    materials.filter((m) => m.key).map((m) => [norm(m.key), m])
  );
  const labByKey = new Map(
    labours.filter((l) => l.key).map((l) => [norm(l.key), l])
  );
  const matByName = new Map(materials.map((m) => [norm(m.name), m]));
  const labByName = new Map(labours.map((l) => [norm(l.name), l]));

  let net = 0;

  const resolvedLines = item.lines.map((line) => {
    const qty = (line.qtyPerUnit ?? 0) * (line.factor ?? 1);

    let resolvedUnitPrice = 0;
    let resolvedFrom = "cached";

    if (line.kind === "constant") {
      resolvedUnitPrice = Number(line.unitPriceAtBuild ?? 0);
      resolvedFrom = "constant";
    }

    if (line.kind === "material") {
      const lib =
        (line.refSn ? matBySn.get(line.refSn) : null) ||
        (line.refKey ? matByKey.get(norm(line.refKey)) : null) ||
        (line.refName ? matByName.get(norm(line.refName)) : null);

      const current = lib?.defaultUnitPrice;
      const cached = Number(line.unitPriceAtBuild ?? 0);

      if (priceMode === "cached") {
        resolvedUnitPrice = cached;
        resolvedFrom = "cached";
      } else if (priceMode === "current") {
        resolvedUnitPrice = Number(current ?? 0);
        resolvedFrom = "current";
      } else {
        // hybrid
        resolvedUnitPrice = Number(current ?? cached ?? 0);
        resolvedFrom = current != null ? "current" : "cached";
      }
    }

    if (line.kind === "labour") {
      const lib =
        (line.refSn ? labBySn.get(line.refSn) : null) ||
        (line.refKey ? labByKey.get(norm(line.refKey)) : null) ||
        (line.refName ? labByName.get(norm(line.refName)) : null);

      const current = lib?.defaultUnitPrice;
      const cached = Number(line.unitPriceAtBuild ?? 0);

      if (priceMode === "cached") {
        resolvedUnitPrice = cached;
        resolvedFrom = "cached";
      } else if (priceMode === "current") {
        resolvedUnitPrice = Number(current ?? 0);
        resolvedFrom = "current";
      } else {
        resolvedUnitPrice = Number(current ?? cached ?? 0);
        resolvedFrom = current != null ? "current" : "cached";
      }
    }

    const lineTotal = qty * resolvedUnitPrice;
    net += lineTotal;

    return {
      ...line,
      qtyResolved: qty,
      unitPriceResolved: resolvedUnitPrice,
      priceResolvedFrom: resolvedFrom,
      lineTotal,
    };
  });

  const overheadVal = net * (oh / 100);
  const profitVal = net * (pf / 100);
  const total = net + overheadVal + profitVal;

  return {
    section: item.section,
    name: item.name,
    outputUnit: item.outputUnit,

    overheadPercent: oh,
    profitPercent: pf,

    netCost: round2(net),
    overheadValue: round2(overheadVal),
    profitValue: round2(profitVal),
    totalCost: round2(total),

    lines: resolvedLines.map((l) => ({
      kind: l.kind,
      refSn: l.refSn,
      refKey: l.refKey,
      refName: l.refName,
      description: l.description,
      unit: l.unit,
      qtyPerUnit: l.qtyPerUnit,
      factor: l.factor,
      qtyResolved: round4(l.qtyResolved),
      unitPriceResolved: round2(l.unitPriceResolved),
      priceResolvedFrom: l.priceResolvedFrom,
      lineTotal: round2(l.lineTotal),
      unitPriceAtBuild: l.unitPriceAtBuild,
    })),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}
