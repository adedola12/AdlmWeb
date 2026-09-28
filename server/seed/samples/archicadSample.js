// ArchiCAD samples: the duplex bill as QUIV for ArchiCAD extracts it —
// elemental (NRM) categories, itemRefs "{categoryNo}.{seq}", ArchiCAD GUIDs
// per element — plus the costed BoQ version document the ArchiCAD pages read
// (models/ArchicadBoqVersion.js). The TakeoffProject carries the same lossy
// item mapping archicad.routes.js embedLinesOnProject() writes, so the
// valuation, PM and dashboard surfaces work on it as on a live project.
//
// ArchiCAD extraction measures elements, not finishes, so the finishes lines
// of the duplex bill are left out.
//
// Pure: no database, no network.

import crypto from "crypto";
import { BUILDUPS, PRICES, netUnitCost } from "./priceBook.js";
import {
  CATEGORIES,
  buildCategories,
  buildTotals,
  computeLineAmounts,
} from "../../services/archicadCosting.js";

const r2 = (n) => Math.round(n * 100) / 100;

// ArchiCAD element GUID ("8-4-4-4-12", upper case) derived from the element id
// so re-seeding produces the same GUIDs.
export function archicadGuid(id) {
  const h = crypto.createHash("md5").update(`archicad:${id}`).digest("hex").toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Elemental category of a duplex bill line (null = not an ArchiCAD line).
export function archicadCategory(line) {
  if (line.phase === 7) return null; // finishes: not measured by the extraction
  if (line.phase === 1) return "substructure";
  const t = line.takeoffLine;
  if (t === "Columns" || t === "Beams" || t === "Lintels") return "frame";
  if (t === "Floors" || t === "Stairs") return "upperFloors";
  if (t === "Roofs" || line.phase === 5) return "roof";
  if (t === "Windows") return "windowsExternalDoors";
  if (t === "Doors") return line.key === "door-flush" ? "internalDoors" : "windowsExternalDoors";
  if (t === "Walls") return /ext|gable/.test(line.key) ? "externalWalls" : "internalWalls";
  return "frame";
}

export function archicadQuivType(line, foundation) {
  switch (line.takeoffLine) {
    case "Foundations":
      return foundation === "strip" ? "stripFooting" : foundation === "raft" ? "slab" : "padFooting";
    case "Piles":
    case "Columns":
      return "column";
    case "Ground Beams":
    case "Beams":
    case "Lintels":
      return "beam";
    case "Ground Floor Slab":
    case "Floors":
    case "Stairs":
      return "slab";
    case "Walls":
      return "wall";
    case "Roofs":
      return "roof";
    case "Doors":
      return "door";
    case "Windows":
      return "window";
    default:
      return "";
  }
}

// Lines kept for ArchiCAD, each with its category, itemRef and quivType.
export function archicadLines(lines, foundation) {
  const seq = {};
  const out = [];
  for (const l of lines) {
    const category = archicadCategory(l);
    if (!category) continue;
    const no = CATEGORIES.findIndex((c) => c.key === category) + 1;
    seq[category] = (seq[category] || 0) + 1;
    out.push({
      ...l,
      archicad: {
        category,
        categoryTitle: CATEGORIES[no - 1].title,
        itemRef: `${no}.${seq[category]}`,
        quivType: archicadQuivType(l, foundation),
      },
    });
  }
  return out;
}

// Unit cost split of a build-up by resource kind.
function unitSplit(buildupKey) {
  const out = { Material: 0, Labour: 0, Plant: 0, Consumable: 0 };
  for (const [k, coeff] of BUILDUPS[buildupKey]) {
    const [, , price, kind] = PRICES[k];
    out[kind] = (out[kind] || 0) + coeff * price;
  }
  return out;
}

// The costed BoQ version lines for an assembled ArchiCAD sample project.
export function archicadBoqLines(scheme, project) {
  return scheme.lines.map((l, i) => {
    const it = project.items[i];
    const a = l.archicad;
    const split = unitSplit(l.buildup);
    const guids = l.elements.map((e) => archicadGuid(e.id));
    const isSlabConcrete = a.quivType === "slab" && l.unit === "m3" && /concrete/.test(l.key);
    const line = {
      itemRef: a.itemRef,
      category: a.category,
      categoryTitle: a.categoryTitle,
      description: l.quiv,
      unit: l.unit,
      quantity: l.qty,
      quivType: a.quivType,
      elementGuids: guids,
      elementQuantities: l.elements.map((e, k) => ({ guid: guids[k], qty: e.qty })),
      elementQuantitiesEstimated: false,
      quantitiesBreakdown: isSlabConcrete ? { netTopArea: r2(l.qty / 0.15), thickness: 0.15 } : {},
      flags: [],
      netUnitCost: r2(netUnitCost(l.buildup)),
      overheadPercent: 10,
      profitPercent: 15,
      unitRate: it.rate,
      materialUnitCost: r2(split.Material),
      plantUnitCost: r2(split.Plant),
      otherUnitCost: r2(split.Consumable),
      marginPercent: 15,
      rateProvenance: {
        rateId: null,
        rateSource: "sample",
        section: a.categoryTitle,
        name: l.heron,
        matchScore: 1,
      },
      labourProvenance: {
        method: "rate-breakdown",
        labourUnitRate: r2(split.Labour),
        gangComposition: [],
        sourceRateId: null,
        notes: "Sample build-up",
      },
    };
    return computeLineAmounts(line);
  });
}

export function archicadVersionDoc(scheme, project) {
  const lines = archicadBoqLines(scheme, project);
  return {
    versionNumber: 1,
    isCurrent: true,
    extractedAt: project.models?.extractedAt || new Date(`${scheme.stage.start}T09:00:00.000Z`),
    modelVersion: `${scheme.design.title}.pln`,
    currency: "NGN",
    lines,
    categories: buildCategories(lines),
    totals: buildTotals(lines),
    issues: [],
    changedLineRefs: [],
    createdBy: null,
  };
}
