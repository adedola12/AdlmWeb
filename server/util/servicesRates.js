// server/util/servicesRates.js
//
// RateGen's building-services rates, for SERVIQ (Revit MEP) bills: plumbing,
// electrical, mechanical (HVAC) and fire. RateGen held none, so a SERVIQ bill
// had no rate to price from and no carbon (owner, 3 Oct 2026: "add services
// rates to RateGen for SERVIQ").
//
// UNPRICED ON PURPOSE. The owner's choice: build the rates as full build-ups
// (materials, quantities, labour constants) now, and leave the prices to ADLM's
// price team. Until they are priced these rates are not published to RateGen
// users or the plugins; they are used only by the carbon service
// (services/rateCarbon.js), which weighs a build-up by its quantities and needs
// no price. `servicesPriceList()` lists every material and trade to be priced.
//
// The labour constants are a QS's working figures for Nigerian site practice,
// marked `status: "draft"` until the price team confirms them with the prices.

const L = (componentName, quantity, unit) => ({ componentName, quantity, unit, unitPrice: 0, totalPrice: 0, refKind: "labour" });
const M = (componentName, quantity, unit) => ({ componentName, quantity, unit, unitPrice: 0, totalPrice: 0, refKind: "material" });

export const SERVICES_SECTION = { key: "services", label: "Building Services" };
export const SERVICES_TRADES = ["Plumber", "Electrician", "HVAC technician", "Duct fitter", "Mate"];

const rate = (group, description, unit, breakdown) => ({
  sectionKey: SERVICES_SECTION.key,
  sectionLabel: SERVICES_SECTION.label,
  group,
  description,
  unit,
  netCost: 0,
  status: "draft",
  breakdown,
});

const PPR = [20, 25, 32, 40, 50, 63];
const UPVC = [50, 75, 110, 160];
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
    push(rate("Plumbing", `Supply and fix ${d}mm PPR (PN20) cold water pipe in walls or ducts, including fittings and clips`, "m", [
      M(`${d}mm PPR pipe (PN20)`, 1.05, "m"),
      M("PPR fittings allowance (sockets, elbows, tees)", 0.3, "nr"),
      M("Pipe clips and fixings", 1, "nr"),
      L("Plumber", 0.15 + d / 400, "hr"),
      L("Mate", 0.15 + d / 400, "hr"),
    ]));
  }
  for (const d of UPVC) {
    push(rate("Plumbing", `Supply and fix ${d}mm uPVC soil, waste or vent pipe, including fittings, solvent cement and brackets`, "m", [
      M(`${d}mm uPVC pipe`, 1.05, "m"),
      M("uPVC fittings, solvent cement and brackets allowance", 0.4, "nr"),
      L("Plumber", 0.2 + d / 500, "hr"),
      L("Mate", 0.2 + d / 500, "hr"),
    ]));
  }
  push(rate("Plumbing", "Supply and fix vitreous china WC suite with low-level cistern, seat and cover, pan connector, flexible connector and angle valve", "nr", [
    M("Vitreous china WC suite with cistern", 1, "nr"),
    M("Flexible connector and angle valve", 1, "nr"),
    M("Pan connector and fixings", 1, "nr"),
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
    M("Sink waste and trap", 1, "nr"),
    L("Plumber", 2.5, "hr"),
    L("Mate", 2, "hr"),
  ]));
  for (const l of HEATER) {
    push(rate("Plumbing", `Supply and fix ${l} litre electric water heater with copper flexible connectors and angle valves`, "nr", [
      M(`${l} litre electric water heater`, 1, "nr"),
      M("Copper flexible connector and angle valve", 2, "nr"),
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
  return out;
}

export const SERVICES_RATES = build();

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
