// ── Services build-up engine (MEP) ─────────────────────────────────────────
// Pure + dependency-free so it can be unit-tested and called from BOTH the web
// `/rategen-v2/services/compute` endpoint and (later) the desktop MEP plugin via
// an identical port — one source of truth for the math, no divergence.
//
// Given a measured services item (a pipe/duct/cable RUN, or a COUNT of fixtures)
// + per-type constants + resolved RateGen rates, it returns the material +
// labour build-up lines and the derived unit rate — the exact shape the
// budget→bill pipeline (deriveBillRatesFromBudget) already consumes.
//
// Pricing policy (documented so it can be reasoned about / tuned):
//   • Length runs are bought in whole STANDARD LENGTHS ("sticks"/bundles):
//       sticks = ceil(qty / standardLength)   (waste of the part-stick is paid)
//     Material is therefore priced on sticks × standardLength, not the raw qty.
//   • Connectors follow a per-type rule (default: one per joint = sticks − 1).
//   • Labour is installation per measured unit (per metre / per nr).
//   • Fittings support BOTH models at once ("mix of both"): discrete line
//     items (count × rate) AND a % uplift on the run's material.
//   • Derived rate = net × (1 + (overhead% + profit%)/100) / qty.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(num(n) * 100) / 100;
}

// Editable seed defaults per service type. The Constants view lets a firm
// override standardLength / connectorRule per type; these are just the starting
// point so the engine is usable out of the box.
export const SERVICE_TYPE_DEFAULTS = Object.freeze({
  pipe: { measure: "length", standardLength: 6, connectorRule: "perBreak", unit: "m" },
  duct: { measure: "length", standardLength: 1.2, connectorRule: "perBreak", unit: "m" },
  cable: { measure: "length", standardLength: 100, connectorRule: "none", unit: "m" },
  conduit: { measure: "length", standardLength: 3, connectorRule: "perBreak", unit: "m" },
  tray: { measure: "length", standardLength: 3, connectorRule: "perBreak", unit: "m" },
  fixture: { measure: "count", standardLength: 0, connectorRule: "none", unit: "Nr" },
  equipment: { measure: "count", standardLength: 0, connectorRule: "none", unit: "Nr" },
});

// Whole standard lengths ("sticks"/bundles) needed for a run.
// standardLength <= 0 → continuous (no bundling): sticks = qty.
export function computeBundles(qty, standardLength) {
  const q = num(qty);
  const s = num(standardLength);
  if (q <= 0) return 0;
  if (s <= 0) return q;
  return Math.ceil(q / s);
}

// Connectors for a run of `sticks` whole lengths, per the per-type rule:
//   "perBreak" (default) → a connector at each joint between sticks → sticks − 1
//   "perStick"           → one connector per stick                  → sticks
//   "none"               → no connectors
// `connectorsPerJoint` (default 1) multiplies the joint count for assemblies
// that need more than one connector per break.
export function computeConnectors(sticks, rule = "perBreak", connectorsPerJoint = 1) {
  const n = Math.max(0, Math.floor(num(sticks)));
  const k = num(connectorsPerJoint) || 1;
  if (n <= 0) return 0;
  switch (String(rule || "perBreak")) {
    case "none":
      return 0;
    case "perStick":
      return Math.round(n * k);
    case "perBreak":
    default:
      return Math.round((n - 1) * k);
  }
}

// Build the material + labour breakdown for one services line.
// Returns { lines:[{componentKind, description, qty, unit, rate}], net, sticks,
//           connectors, rate } where `rate` is per measured unit (incl. O&P).
export function computeServiceBuildup(input = {}) {
  const {
    measure = "length", // "length" | "count"
    qty = 0,
    unit,
    description = "",
    constants = {},
    rates = {},
    fittings = [],
    overheadPercent = 0,
    profitPercent = 0,
  } = input;

  const q = num(qty);
  const measureUnit = unit || (measure === "length" ? "m" : "Nr");
  const {
    standardLength = 0,
    connectorRule = "perBreak",
    connectorsPerJoint = 1,
    fittingUpliftPercent = 0,
  } = constants;
  const {
    materialRate = 0, // per metre (length) or per nr (count)
    labourRate = 0, // per metre (length) or per nr (count)
    connectorRate = 0, // per connector (material + labour combined)
  } = rates;

  const lines = [];
  let sticks = 0;
  let connectors = 0;

  if (measure === "length") {
    sticks = computeBundles(q, standardLength);
    connectors = computeConnectors(sticks, connectorRule, connectorsPerJoint);

    // Material: whole sticks (waste included) when a standard length is set,
    // else the raw measured length.
    if (num(materialRate) > 0 && q > 0) {
      if (num(standardLength) > 0) {
        lines.push({
          componentKind: "Material",
          description: description || "Run material",
          qty: sticks,
          unit: "Nr",
          rate: round2(num(standardLength) * num(materialRate)),
        });
      } else {
        lines.push({
          componentKind: "Material",
          description: description || "Run material",
          qty: q,
          unit: measureUnit,
          rate: num(materialRate),
        });
      }
    }

    if (connectors > 0 && num(connectorRate) > 0) {
      lines.push({
        componentKind: "Material",
        description: "Connectors",
        qty: connectors,
        unit: "Nr",
        rate: num(connectorRate),
      });
    }

    if (num(labourRate) > 0 && q > 0) {
      lines.push({
        componentKind: "Labour",
        description: "Installation",
        qty: q,
        unit: measureUnit,
        rate: num(labourRate),
      });
    }
  } else {
    // Count-based (fixtures / equipment / terminals).
    if (num(materialRate) > 0 && q > 0) {
      lines.push({
        componentKind: "Material",
        description: description || "Material",
        qty: q,
        unit: "Nr",
        rate: num(materialRate),
      });
    }
    if (num(labourRate) > 0 && q > 0) {
      lines.push({
        componentKind: "Labour",
        description: "Installation",
        qty: q,
        unit: "Nr",
        rate: num(labourRate),
      });
    }
  }

  // Discrete fittings (mix-of-both #1): explicit line items.
  for (const f of Array.isArray(fittings) ? fittings : []) {
    const count = num(f?.count);
    if (count <= 0) continue;
    if (num(f?.materialRate) > 0) {
      lines.push({
        componentKind: "Material",
        description: f?.name || "Fitting",
        qty: count,
        unit: "Nr",
        rate: num(f.materialRate),
      });
    }
    if (num(f?.labourRate) > 0) {
      lines.push({
        componentKind: "Labour",
        description: `${f?.name || "Fitting"} (install)`,
        qty: count,
        unit: "Nr",
        rate: num(f.labourRate),
      });
    }
  }

  let net = lines.reduce((a, l) => a + num(l.qty) * num(l.rate), 0);

  // Fitting uplift (mix-of-both #2): % allowance on the material subtotal.
  const up = num(fittingUpliftPercent);
  if (up > 0) {
    const materialNet = lines
      .filter((l) => l.componentKind === "Material")
      .reduce((a, l) => a + num(l.qty) * num(l.rate), 0);
    const upliftAmount = round2((materialNet * up) / 100);
    if (upliftAmount > 0) {
      lines.push({
        componentKind: "Material",
        description: "Fittings allowance",
        qty: 1,
        unit: "item",
        rate: upliftAmount,
      });
      net += upliftAmount;
    }
  }

  const amount = net * (1 + (num(overheadPercent) + num(profitPercent)) / 100);
  const rate = q > 0 ? amount / q : amount;

  return {
    lines,
    net: round2(net),
    sticks,
    connectors,
    rate: round2(rate),
  };
}
