// server/util/archicadMoney.js
//
// The shared-project money rule, applied to QUIV for ArchiCAD.
//
// ArchiCAD projects are TakeoffProject documents a collaborator can reach
// (routes/archicad.routes.js accessFilter / findAccessibleProject), but their
// priced BoQ lives in ArchicadBoqVersion and is served by routes of its own,
// outside routes/projects.js resolveProjectAccess → maskRates. So the same
// rule is asked here:
//
//   owner                          → money, always
//   sample (read-only, owner-less) → money (as on every other product)
//   collaborator, owner said off   → no money, whatever they subscribe to
//   collaborator, owner said on    → money only with an active RateGen
//
// "No money" is done by the server: every figure reads 0 (never null — the
// connector's C# models are non-nullable doubles), the document says
// moneyHidden, and priced exports are refused.
import { ownerAllowsMoney } from "./ownerMoney.js";
import { readerMaySeeRates } from "./sharedMoney.js";

/**
 * May `userId` see the money on this ArchiCAD project?
 * → { canSeeMoney, hiddenBy: null | "owner" | "rategen" }
 *
 * `maySeeRates` lets a list route look the reader's RateGen up once for every
 * row; when omitted it is looked up here, and only when it can matter.
 */
export async function archicadMoneyAccess(project, userId, maySeeRates) {
  const SHOW = { canSeeMoney: true, hiddenBy: null };
  if (!project || !userId) return SHOW;
  if (project.isSample) return SHOW;
  if (project.userId != null && String(project.userId) === String(userId)) return SHOW;
  if (!ownerAllowsMoney(project, userId)) return { canSeeMoney: false, hiddenBy: "owner" };
  const rategen =
    typeof maySeeRates === "function"
      ? await maySeeRates()
      : maySeeRates === undefined
        ? await readerMaySeeRates(userId)
        : !!maySeeRates;
  return rategen ? SHOW : { canSeeMoney: false, hiddenBy: "rategen" };
}

// The 403 body for a route that needs money the reader may not see. Same codes
// and wording as routes/projects.js moneyBlocked: RateGen is something the
// reader can buy, the owner's switch only the owner can change.
export function archicadMoneyBlocked(hiddenBy, what) {
  return hiddenBy === "owner"
    ? {
        error: `The project owner has hidden this project's money from you, so you cannot ${what}.`,
        code: "MONEY_HIDDEN_BY_OWNER",
      }
    : {
        error: `A RateGen subscription is required to ${what}.`,
        code: "RATEGEN_REQUIRED",
      };
}

// Every money figure on a costed line (services/archicadCosting.js costLine +
// computeLineAmounts). Quantities, units, GUIDs, flags and which rate matched
// stay: a collaborator is meant to see what was measured.
export const ARCHICAD_LINE_MONEY_FIELDS = Object.freeze([
  "unitRate",
  "netUnitCost",
  "overheadPercent",
  "profitPercent",
  "marginPercent",
  "materialUnitCost",
  "plantUnitCost",
  "otherUnitCost",
  "materialAmount",
  "labourAmount",
  "plantAmount",
  "otherAmount",
  "totalAmount",
  "marginAmount",
]);

export const ARCHICAD_CATEGORY_MONEY_FIELDS = Object.freeze([
  "materialAmount",
  "labourAmount",
  "plantAmount",
  "otherAmount",
  "totalAmount",
  "marginAmount",
]);

// buildTotals: everything but floorArea is money.
export const ARCHICAD_TOTALS_MONEY_FIELDS = Object.freeze([
  "materialAmount",
  "labourAmount",
  "plantAmount",
  "otherAmount",
  "directCost",
  "marginAmount",
  "grandTotal",
  "costPerM2",
]);

function zeroFields(obj, fields) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (f in out) out[f] = 0;
  }
  return out;
}

function maskLabourProvenance(lp) {
  if (!lp || typeof lp !== "object") return lp;
  return {
    ...lp,
    labourUnitRate: 0,
    gangComposition: Array.isArray(lp.gangComposition)
      ? lp.gangComposition.map((g) => (g && typeof g === "object" ? { ...g, unitPrice: 0 } : g))
      : lp.gangComposition,
  };
}

export function maskArchicadLine(line) {
  if (!line || typeof line !== "object") return line;
  const out = zeroFields(line, ARCHICAD_LINE_MONEY_FIELDS);
  if ("labourProvenance" in out) out.labourProvenance = maskLabourProvenance(out.labourProvenance);
  return out;
}

/**
 * A BoQ document (archicad.routes.js buildBoqDocument) with its money zeroed.
 * Same keys as the unmasked document, plus moneyHidden / moneyHiddenBy.
 * Returns a copy; the input (often a live version document's arrays) is
 * never mutated.
 */
export function maskArchicadBoqDocument(doc, hiddenBy) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    ...doc,
    lines: (doc.lines || []).map(maskArchicadLine),
    categories: (doc.categories || []).map((c) => zeroFields(c, ARCHICAD_CATEGORY_MONEY_FIELDS)),
    totals: zeroFields(doc.totals || {}, ARCHICAD_TOTALS_MONEY_FIELDS),
    targetBudget: 0,
    moneyHidden: true,
    moneyHiddenBy: hiddenBy || "rategen",
  };
}
