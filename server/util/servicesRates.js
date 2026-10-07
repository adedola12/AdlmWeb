// server/util/servicesRates.js
//
// RateGen's building-services rates, for SERVIQ (Revit MEP) bills: plumbing,
// electrical, mechanical (HVAC) and fire. RateGen held none, so a SERVIQ bill
// had no rate to price from and no carbon (owner, 3 Oct 2026: "add services
// rates to RateGen for SERVIQ").
//
// Every line is an item of the MEPF library (util/mepfLibrary.js): the RateGen
// master's own item where it already sells it, RateGen's own trades ("Plumber
// (skilled)", the trade's mate, the pipefitter), and new items in the master's
// naming style. `pricedServicesRates()` prices them from the library; a rate is
// published (scripts/rategen-services.mjs publish) only when every line has a
// checked or master price. The owner's choices (3 Oct 2026): prices researched
// online and checked by ADLM's price team; the library goes to the RateGen master
// SERVIQ already reads; SERVIQ's auto-pricing from these rates comes later.
//
// The carbon service (services/rateCarbon.js) uses the build-ups now: it weighs a
// build-up by its quantities and needs no price. The labour constants are a QS's
// working figures for Nigerian site practice, `status: "draft"` until the price
// team confirms them with the prices.

import { mepfName, mepfPrice, mepfItem } from "./mepfLibrary.js";

// The trades are RateGen's own where it has them ("Plumber (skilled)" ...); a
// rate's mate is its own trade's mate. PPR and uPVC pipework is the pipefitter's.
const TRADE = {
  Plumber: "Plumber (skilled)",
  Electrician: "Electrician (skilled)",
  "HVAC technician": "HVAC technician (split AC installer)",
  "Duct fitter": "Duct fitter (sheet metal)",
  Pipefitter: "Pipefitter (PPR fusion and uPVC solvent welding)",
};
const MATE = { Plumbing: "Plumber mate", Electrical: "Electrician mate", Mechanical: "Electrician mate", Fire: "Electrician mate" };

const L = (trade, quantity, unit) => ({ componentName: trade, quantity, unit, unitPrice: 0, totalPrice: 0, refKind: "labour" });
const M = (componentName, quantity, unit) => ({ componentName: mepfName(componentName), quantity, unit, unitPrice: 0, totalPrice: 0, refKind: "material" });

export const SERVICES_SECTION = { key: "services", label: "Building Services" };
export const SERVICES_TRADES = [...Object.values(TRADE), ...new Set(Object.values(MATE))];

const rate = (group, description, unit, breakdown) => ({
  sectionKey: SERVICES_SECTION.key,
  sectionLabel: SERVICES_SECTION.label,
  group,
  description,
  unit,
  netCost: 0,
  status: "draft",
  breakdown: breakdown.map((b) =>
    b.refKind !== "labour" ? b
    : { ...b, componentName: b.componentName === "Mate" ? MATE[group] : TRADE[b.componentName] || b.componentName }),
});

const PPR = [20, 25, 32, 40, 50, 63];
const UPVC = [50, 75, 100, 150];
const CABLE = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
const HEATER = [15, 30, 50, 100];
const AC = [1, 1.5, 2, 2.5, 3];
const WAYS = [4, 6, 8, 12, 18, 24];
const EXTINGUISHER = [6, 9, 12];

function build() {
  const out = [];
  let n = 0;
  const push = (r) => out.push({ ...r, itemNo: ++n, code: `SRV-${String(n).padStart(3, "0")}` });

  // Plumbing
  for (const d of PPR) {
    // fittings per metre of run, where the library sells them in this size
    const fit = [20, 25, 32].includes(d)
      ? [M(`${d}mm PPR elbow`, 0.25, "nr"), M(`${d}mm PPR tee`, 0.1, "nr"), ...(d < 32 ? [M(`${d}mm PPR socket`, 0.2, "nr")] : [])]
      : [];
    push(rate("Plumbing", `Supply and fix ${d}mm PPR (PN10) cold water pipe in walls or ducts, including fittings and clips`, "m", [
      M(`${d}mm PPR pipe (PN20)`, 1.05, "m"),
      ...fit,
      M("Pipe clips and fixings", 1, "nr"),
      L("Pipefitter", 0.15 + d / 400, "hr"),
      L("Mate", 0.15 + d / 400, "hr"),
    ]));
  }
  for (const d of UPVC) {
    const pipe = d === 100 ? "uPVC soil, waste and vent pipe to BS 4514, 100mm" : `uPVC soil, waste and vent pipe, ${d}mm`;
    const bend = d === 50 || d === 100 ? [M(`uPVC bend, ${d}mm`, 0.2, "nr")] : [];
    push(rate("Plumbing", `Supply and fix ${d}mm uPVC soil, waste or vent pipe, including bends, solvent cement and brackets`, "m", [
      M(pipe, 1.05, "m"),
      ...bend,
      M("uPVC solvent cement (500ml tin)", 0.02, "nr"),
      M("Pipe clips and fixings", 1, "nr"),
      L("Pipefitter", 0.2 + d / 500, "hr"),
      L("Mate", 0.2 + d / 500, "hr"),
    ]));
  }
  push(rate("Plumbing", "Supply and fix vitreous china WC suite with low-level cistern, seat and cover, pan connector, flexible connector and angle valve", "nr", [
    M("Vitreous china WC suite with cistern", 1, "nr"),
    M("Flexible connector (braided, 40cm)", 1, "nr"),
    M("Angle valve (15mm)", 1, "nr"),
    M("WC pan connector", 1, "nr"),
    L("Plumber", 3, "hr"),
    L("Mate", 3, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix vitreous china wash hand basin with pedestal, pillar taps and 32mm bottle trap", "nr", [
    M("Vitreous china wash hand basin with pedestal", 1, "nr"),
    M("Pillar taps", 1, "set"),
    M("32mm bottle trap and waste", 1, "nr"),
    L("Plumber", 2.5, "hr"),
    L("Mate", 2.5, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix shower mixer set with head, hose and riser rail", "nr", [
    M("Shower mixer set", 1, "set"),
    L("Plumber", 2, "hr"),
    L("Mate", 1, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix stainless steel double bowl kitchen sink with mixer tap and waste", "nr", [
    M("Stainless steel double bowl sink", 1, "nr"),
    M("Kitchen sink mixer tap", 1, "set"),
    M("32mm bottle trap and waste", 1, "nr"),
    L("Plumber", 2.5, "hr"),
    L("Mate", 2, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix vitreous china urinal with flush valve and waste", "nr", [
    M("Vitreous china urinal", 1, "nr"),
    M("Angle valve (15mm)", 1, "nr"),
    L("Plumber", 2.5, "hr"),
    L("Mate", 2, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix 1700mm acrylic bath tub with mixer, waste and overflow", "nr", [
    M("Acrylic bath tub (1700mm)", 1, "nr"),
    M("Basin mixer tap", 1, "nr"),
    M("32mm bottle trap and waste", 1, "nr"),
    L("Plumber", 4, "hr"),
    L("Mate", 4, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix basin mixer tap", "nr", [
    M("Basin mixer tap", 1, "nr"),
    M("Flexible connector (braided, 40cm)", 2, "nr"),
    L("Plumber", 1, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix 100mm floor trap with grating", "nr", [
    M("Floor trap (100mm, with grating)", 1, "nr"),
    L("Plumber", 1, "hr"),
    L("Mate", 1, "hr"),
  ]));
  push(rate("Plumbing", "Supply and fix 110mm gully trap", "nr", [
    M("Gully trap (110mm)", 1, "nr"),
    L("Plumber", 1.5, "hr"),
    L("Mate", 1.5, "hr"),
  ]));
  for (const d of [20, 25, 32]) {
    push(rate("Plumbing", `Supply and fix ${d}mm brass ball valve`, "nr", [
      M(`${d}mm ball valve (brass)`, 1, "nr"),
      M("PTFE thread seal tape", 0.2, "nr"),
      L("Plumber", 0.5, "hr"),
    ]));
  }
  for (const l of [1000, 2000, 5000]) {
    push(rate("Plumbing", `Supply and install ${l} litre plastic water tank on prepared base, with connections`, "nr", [
      M(`${l} litre plastic water tank`, 1, "nr"),
      M(`25mm ball valve (brass)`, 2, "nr"),
      L("Plumber", 3 + l / 1000, "hr"),
      L("Mate", 3 + l / 1000, "hr"),
    ]));
  }
  push(rate("Plumbing", "Supply and install 1HP surface water pump with connections", "nr", [
    M("1HP surface water pump", 1, "nr"),
    M("25mm ball valve (brass)", 2, "nr"),
    L("Plumber", 4, "hr"),
    L("Electrician", 2, "hr"),
  ]));
  push(rate("Plumbing", "Supply and install 1.5HP submersible borehole pump with rising main connection", "nr", [
    M("1.5HP submersible borehole pump", 1, "nr"),
    L("Plumber", 6, "hr"),
    L("Electrician", 3, "hr"),
    L("Mate", 6, "hr"),
  ]));
  for (const l of HEATER) {
    push(rate("Plumbing", `Supply and fix ${l} litre electric water heater with copper flexible connectors and angle valves`, "nr", [
      M(`${l} litre electric water heater`, 1, "nr"),
      M("Flexible connector (braided, 40cm)", 2, "nr"),
      M("Angle valve (15mm)", 2, "nr"),
      L("Plumber", 2, "hr"),
      L("Electrician", 1, "hr"),
    ]));
  }

  // Electrical
  push(rate("Electrical", "Lighting point: 20mm PVC conduit, 1.5mm2 single core copper cable and 1-gang switch, complete", "nr", [
    M("20mm PVC conduit", 8, "m"),
    M("1.5mm2 single core copper cable", 24, "m"),
    M("1-gang 1-way switch", 1, "nr"),
    M("Conduit boxes and accessories", 2, "nr"),
    L("Electrician", 2, "hr"),
    L("Mate", 2, "hr"),
  ]));
  push(rate("Electrical", "Power point: 20mm PVC conduit, 2.5mm2 single core copper cable and 13A twin switched socket outlet, complete", "nr", [
    M("20mm PVC conduit", 8, "m"),
    M("2.5mm2 single core copper cable", 24, "m"),
    M("13A twin switched socket outlet", 1, "nr"),
    M("Conduit boxes and accessories", 2, "nr"),
    L("Electrician", 2, "hr"),
    L("Mate", 2, "hr"),
  ]));
  push(rate("Electrical", "AC point: 25mm PVC conduit, 4mm2 single core copper cable and 20A double pole switch, complete", "nr", [
    M("25mm PVC conduit", 10, "m"),
    M("4mm2 single core copper cable", 30, "m"),
    M("20A double pole switch", 1, "nr"),
    L("Electrician", 2.5, "hr"),
    L("Mate", 2.5, "hr"),
  ]));
  for (const a of CABLE) {
    push(rate("Electrical", `Supply and draw in ${a}mm2 single core copper cable in conduit or trunking`, "m", [
      M(`${a}mm2 single core copper cable`, 1.05, "m"),
      L("Electrician", 0.03 + a / 1000, "hr"),
    ]));
  }
  for (const a of [16, 25, 35, 50]) {
    push(rate("Electrical", `Supply and lay ${a}mm2 4-core armoured copper cable on tray or in trench, including glands and terminations`, "m", [
      M(`${a}mm2 4-core armoured copper cable`, 1.05, "m"),
      L("Electrician", 0.1 + a / 500, "hr"),
      L("Mate", 0.1 + a / 500, "hr"),
    ]));
  }
  push(rate("Electrical", "Supply and fix 2-gang 1-way switch", "nr", [
    M("2-gang 1-way switch", 1, "nr"),
    L("Electrician", 0.5, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix 1-gang 2-way switch", "nr", [
    M("1-gang 2-way switch", 1, "nr"),
    L("Electrician", 0.5, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix 13A single switched socket outlet", "nr", [
    M("13A single switched socket outlet", 1, "nr"),
    L("Electrician", 0.5, "hr"),
  ]));
  push(rate("Electrical", "Cooker point: 25mm PVC conduit, 6mm2 single core copper cable and 45A cooker control unit, complete", "nr", [
    M("25mm PVC conduit", 10, "m"),
    M("6mm2 single core copper cable", 30, "m"),
    M("45A cooker control unit", 1, "nr"),
    L("Electrician", 3, "hr"),
    L("Mate", 3, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix 63A 2-pole RCCB in distribution board", "nr", [
    M("63A RCCB (2-pole)", 1, "nr"),
    L("Electrician", 0.75, "hr"),
  ]));
  push(rate("Electrical", "Supply and install 100A changeover switch", "nr", [
    M("100A changeover switch", 1, "nr"),
    L("Electrician", 4, "hr"),
    L("Mate", 2, "hr"),
  ]));
  push(rate("Electrical", "Earthing: copper-bonded earth rod with clamp, 16mm2 earth cable and inspection pit", "nr", [
    M("Copper-bonded earth rod (1.2m) with clamp", 1, "nr"),
    M("16mm2 single core copper cable", 5, "m"),
    M("Earth inspection pit", 1, "nr"),
    L("Electrician", 3, "hr"),
    L("Mate", 3, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix 300x75mm galvanised ladder cable tray, including bends and supports", "m", [
    M("Ladder cable tray (300x75mm)", 1.05, "m"),
    L("Electrician", 0.4, "hr"),
    L("Mate", 0.4, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix 50x50mm PVC cable trunking", "m", [
    M("Cable trunking (50x50mm)", 1.05, "m"),
    L("Electrician", 0.2, "hr"),
  ]));
  for (const [what, name, hrs] of [
    ["12W LED downlight", "LED downlight (12W)", 0.5],
    ["4ft 18W LED batten", "LED batten (4ft, 18W)", 0.5],
    ["outdoor LED bulkhead", "LED bulkhead (outdoor)", 0.75],
    ["100W LED floodlight", "LED floodlight (100W)", 1.5],
  ]) {
    push(rate("Electrical", `Supply and fix ${what} luminaire`, "nr", [M(name, 1, "nr"), L("Electrician", hrs, "hr")]));
  }
  push(rate("Electrical", "Supply and fix 600x600 LED panel luminaire, recessed in suspended ceiling", "nr", [
    M("600x600 LED panel luminaire", 1, "nr"),
    L("Electrician", 0.75, "hr"),
  ]));
  push(rate("Electrical", "Supply and fix LED linear or pendant luminaire", "nr", [
    M("LED linear luminaire", 1, "nr"),
    L("Electrician", 1, "hr"),
  ]));
  for (const w of WAYS) {
    push(rate("Electrical", `Supply and fix ${w}-way distribution board with MCBs, surface mounted`, "nr", [
      M(`${w}-way distribution board with MCBs`, 1, "nr"),
      L("Electrician", 4 + w / 4, "hr"),
      L("Mate", 2 + w / 8, "hr"),
    ]));
  }

  // Mechanical
  for (const hp of AC) {
    push(rate("Mechanical", `Supply and install ${hp}HP split air conditioner (indoor and outdoor units) with refrigerant pipework, drain and bracket`, "nr", [
      M(`${hp}HP split air conditioner (indoor and outdoor units)`, 1, "nr"),
      M("Copper refrigerant pipe pair", 5, "m"),
      M("20mm uPVC condensate pipe", 3, "m"),
      M("Outdoor unit wall bracket and fixings", 1, "nr"),
      L("HVAC technician", 4, "hr"),
      L("Mate", 4, "hr"),
    ]));
  }
  push(rate("Mechanical", "Supply and install 5HP floor standing air conditioner with refrigerant pipework and drain", "nr", [
    M("5HP floor standing air conditioner", 1, "nr"),
    M("Copper refrigerant pipe pair", 8, "m"),
    M("Refrigerant pipe insulation (Armaflex)", 8, "m"),
    M("20mm uPVC condensate pipe", 4, "m"),
    L("HVAC technician", 8, "hr"),
    L("Mate", 8, "hr"),
  ]));
  push(rate("Mechanical", "Supply and fix 200mm flexible duct, including clips", "m", [
    M("Flexible duct (200mm)", 1.05, "m"),
    L("Duct fitter", 0.3, "hr"),
  ]));
  push(rate("Mechanical", "Supply and install 200mm inline duct fan", "nr", [
    M("Inline duct fan (200mm)", 1, "nr"),
    L("Duct fitter", 2, "hr"),
    L("Electrician", 1, "hr"),
  ]));
  for (const d of [150, 200]) {
    push(rate("Mechanical", `Supply and fix ${d}mm extractor fan, wall or window mounted`, "nr", [
      M(`${d}mm extractor fan`, 1, "nr"),
      L("Electrician", 1.5, "hr"),
    ]));
  }
  push(rate("Mechanical", "Supply and fix ceiling fan with regulator", "nr", [
    M("Ceiling fan", 1, "nr"),
    L("Electrician", 1.5, "hr"),
  ]));
  push(rate("Mechanical", "Supply and install 0.6mm galvanised sheet steel ductwork, measured on the duct surface, including joints and supports", "m2", [
    M("0.6mm galvanised steel sheet ductwork", 1.1, "m2"),
    M("Duct sealant, hangers and fixings allowance", 1, "nr"),
    L("Duct fitter", 1.2, "hr"),
    L("Mate", 1.2, "hr"),
  ]));
  push(rate("Mechanical", "Supply and fix 600x600 aluminium supply air diffuser", "nr", [
    M("600x600 aluminium supply air diffuser", 1, "nr"),
    L("Duct fitter", 1, "hr"),
  ]));
  push(rate("Mechanical", "Supply and fix 600x300 aluminium return air grille", "nr", [
    M("600x300 aluminium return air grille", 1, "nr"),
    L("Duct fitter", 0.75, "hr"),
  ]));

  // Fire
  push(rate("Fire", "Supply and fix optical smoke detector with base", "nr", [
    M("Optical smoke detector", 1, "nr"),
    L("Electrician", 0.75, "hr"),
  ]));
  push(rate("Fire", "Supply and fix heat detector with base", "nr", [
    M("Heat detector", 1, "nr"),
    L("Electrician", 0.75, "hr"),
  ]));
  for (const kg of EXTINGUISHER) {
    push(rate("Fire", `Supply and mount ${kg}kg dry powder fire extinguisher with wall bracket`, "nr", [
      M(`${kg}kg dry powder fire extinguisher`, 1, "nr"),
      M("Wall bracket and fixings", 1, "nr"),
      L("Mate", 0.5, "hr"),
    ]));
  }
  push(rate("Fire", "Supply and mount 5kg CO2 fire extinguisher with wall bracket", "nr", [
    M("5kg CO2 fire extinguisher", 1, "nr"),
    M("Wall bracket and fixings", 1, "nr"),
    L("Mate", 0.5, "hr"),
  ]));
  for (const [what, name, hrs] of [
    ["manual call point", "Manual call point", 0.75],
    ["fire alarm sounder", "Fire alarm sounder", 0.75],
    ["LED emergency light", "LED emergency light", 0.75],
    ["LED exit sign", "LED exit sign", 0.75],
    ["fire blanket", "Fire blanket", 0.25],
  ]) {
    push(rate("Fire", `Supply and fix ${what}`, "nr", [M(name, 1, "nr"), L(/blanket/.test(what) ? "Mate" : "Electrician", hrs, "hr")]));
  }
  push(rate("Fire", "Supply, install and commission 4-zone conventional fire alarm panel with batteries", "nr", [
    M("4-zone conventional fire alarm panel", 1, "nr"),
    L("Electrician", 8, "hr"),
    L("Mate", 4, "hr"),
  ]));
  push(rate("Fire", "Supply and install 30m fire hose reel in cabinet, connected to the water main", "nr", [
    M("Fire hose reel (30m) with cabinet", 1, "nr"),
    M("25mm ball valve (brass)", 1, "nr"),
    M("25mm PPR pipe (PN20)", 3, "m"),
    L("Plumber", 4, "hr"),
    L("Mate", 4, "hr"),
  ]));
  return out;
}

export const SERVICES_RATES = build();

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The services rates priced from the MEPF library (util/mepfLibrary.js).
 *   basis "published": only checked or master prices. A rate with any line still
 *                       unpriced is `priced: false` and must not be published.
 *   basis "preview":    researched prices fill the gaps, for the price team's review.
 * Labour is held per day in the library and used per hour here (8-hour day).
 */
export function pricedServicesRates({ basis = "published", overheadPercent = 10, profitPercent = 25 } = {}) {
  return SERVICES_RATES.map((r) => {
    const missing = [];
    const breakdown = r.breakdown.map((b) => {
      let p = mepfPrice(b.componentName, { basis });
      const libUnit = String(mepfItem(b.componentName)?.unit || "").toLowerCase();
      if (p != null && b.refKind === "labour" && /^hrs?$/i.test(b.unit) && libUnit === "day") p = p / 8;
      if (p == null) missing.push(b.componentName);
      const unitPrice = p == null ? 0 : r2(p);
      return { ...b, unitPrice, totalPrice: r2(unitPrice * b.quantity), priceAsOf: p == null ? null : mepfItem(b.componentName)?.checkedPrice ? null : undefined };
    });
    const netCost = r2(breakdown.reduce((s, b) => s + b.totalPrice, 0));
    const overheadValue = r2((netCost * overheadPercent) / 100);
    const profitValue = r2((netCost * profitPercent) / 100);
    return {
      ...r,
      breakdown,
      netCost,
      overheadPercent,
      profitPercent,
      overheadValue,
      profitValue,
      totalCost: r2(netCost + overheadValue + profitValue),
      priced: missing.length === 0,
      missing,
      basis,
    };
  });
}

/** Every material and trade the services rates use, for the price team to price. */
export function servicesPriceList(rates = SERVICES_RATES) {
  const seen = new Map();
  for (const r of rates) {
    for (const b of r.breakdown) {
      const k = `${b.refKind}|${b.componentName}|${b.unit}`;
      if (!seen.has(k)) seen.set(k, { kind: b.refKind, name: b.componentName, unit: b.unit, usedIn: 0, unitPrice: null });
      seen.get(k).usedIn++;
    }
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
