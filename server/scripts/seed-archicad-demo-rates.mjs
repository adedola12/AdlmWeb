// Seeds a RateGen library of priced custom rates (NGN, realistic Nigerian
// build-ups) for a user account, in the exact production customRates shape.
// Usage: node server/scripts/seed-archicad-demo-rates.mjs <email>
import "dotenv/config";
import crypto from "node:crypto";
import { connectDB } from "../db.js";
import { User } from "../models/User.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";

const email = process.argv[2] || "admin@adlmstudio.net";

const mat = (description, quantity, unit, unitPrice) => ({
  rateType: "material", description, quantity, unit, unitPrice,
  totalCost: Math.round(quantity * unitPrice), category: "", refSn: null, refName: "",
});
const lab = (description, quantity, unit, unitPrice) => ({
  rateType: "labour", description, quantity, unit, unitPrice,
  totalCost: Math.round(quantity * unitPrice), category: "", refSn: null, refName: "",
});

function rate({ sectionKey, sectionLabel, title, description, unit, materials, labour, oh = 10, profit = 15 }) {
  const net = [...materials, ...labour].reduce((s, c) => s + c.totalCost, 0);
  const overheadValue = Math.round(net * oh / 100);
  const profitValue = Math.round(net * profit / 100);
  const now = new Date();
  return {
    customRateId: crypto.randomUUID(),
    sectionKey, sectionLabel, title, description, unit,
    materials, labour,
    breakdown: [...materials, ...labour].map((c) => ({
      componentName: c.description, quantity: c.quantity, unit: c.unit,
      unitPrice: c.unitPrice, lineTotal: c.totalCost,
      refKind: c.rateType, refSn: null, refName: c.description,
    })),
    netCost: net, overheadPercent: oh, profitPercent: profit,
    overheadValue, profitValue, totalCost: net + overheadValue + profitValue,
    createdAt: now, updatedAt: now,
  };
}

const RATES = [
  rate({
    sectionKey: "concrete", sectionLabel: "Concrete Work",
    title: "Concrete 1:2:4 in strip foundation footing",
    description: "Plain concrete 1:2:4 in strip foundation footing", unit: "m3",
    materials: [mat("Cement (50kg bag)", 6.3, "Bag", 10200), mat("Sharp sand", 0.46, "Ton", 9000), mat("Granite 3/4", 0.92, "Ton", 28000)],
    labour: [lab("Mason", 1.2, "No/Day", 9000), lab("Labourer", 2.0, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "concrete", sectionLabel: "Concrete Work",
    title: "Concrete 1:2:4 in pad foundation footing",
    description: "Plain concrete 1:2:4 in pad foundation base", unit: "m3",
    materials: [mat("Cement (50kg bag)", 6.3, "Bag", 10200), mat("Sharp sand", 0.46, "Ton", 9000), mat("Granite 3/4", 0.92, "Ton", 28000)],
    labour: [lab("Mason", 1.0, "No/Day", 9000), lab("Labourer", 1.8, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "concrete", sectionLabel: "Concrete Work",
    title: "Reinforced concrete grade 25 in slab",
    description: "Reinforced concrete grade 25 in suspended floor slab, thick slab", unit: "m3",
    materials: [mat("Cement (50kg bag)", 7.0, "Bag", 10200), mat("Sharp sand", 0.45, "Ton", 9000), mat("Granite 3/4", 0.9, "Ton", 28000), mat("High yield reinforcement steel", 90, "Kg", 1500), mat("Marine board formwork + props", 1.0, "m2", 4500)],
    labour: [lab("Mason", 1.4, "No/Day", 9000), lab("Iron bender", 0.8, "No/Day", 9000), lab("Carpenter", 0.8, "No/Day", 9000), lab("Labourer", 2.2, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "concrete", sectionLabel: "Concrete Work",
    title: "Reinforced concrete column",
    description: "Reinforced concrete grade 25 in column, formwork included", unit: "m3",
    materials: [mat("Cement (50kg bag)", 7.0, "Bag", 10200), mat("Sharp sand", 0.45, "Ton", 9000), mat("Granite 3/4", 0.9, "Ton", 28000), mat("High yield reinforcement steel", 160, "Kg", 1500), mat("Formwork to column", 6.5, "m2", 5000)],
    labour: [lab("Mason", 1.6, "No/Day", 9000), lab("Iron bender", 1.2, "No/Day", 9000), lab("Carpenter", 1.2, "No/Day", 9000), lab("Labourer", 2.4, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "concrete", sectionLabel: "Concrete Work",
    title: "Reinforced concrete beam",
    description: "Reinforced concrete grade 25 in beam, formwork included", unit: "m3",
    materials: [mat("Cement (50kg bag)", 7.0, "Bag", 10200), mat("Sharp sand", 0.45, "Ton", 9000), mat("Granite 3/4", 0.9, "Ton", 28000), mat("High yield reinforcement steel", 180, "Kg", 1500), mat("Formwork to beam", 5.5, "m2", 5000)],
    labour: [lab("Mason", 1.6, "No/Day", 9000), lab("Iron bender", 1.3, "No/Day", 9000), lab("Carpenter", 1.2, "No/Day", 9000), lab("Labourer", 2.4, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "blockwork", sectionLabel: "Blockwork",
    title: "Blockwork exterior wall plastered",
    description: "225mm sandcrete blockwork in exterior wall, plastered and rendered both sides, thick exterior wall", unit: "m2",
    materials: [mat("225mm sandcrete block", 10, "No", 950), mat("Cement (50kg bag)", 0.6, "Bag", 10200), mat("Sharp sand", 0.08, "Ton", 9000)],
    labour: [lab("Mason", 0.4, "No/Day", 9000), lab("Labourer", 0.5, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "blockwork", sectionLabel: "Blockwork",
    title: "Blockwork interior wall plastered",
    description: "150mm sandcrete blockwork in interior wall partition, plastered both sides, thick interior wall", unit: "m2",
    materials: [mat("150mm sandcrete block", 10, "No", 800), mat("Cement (50kg bag)", 0.55, "Bag", 10200), mat("Sharp sand", 0.075, "Ton", 9000)],
    labour: [lab("Mason", 0.38, "No/Day", 9000), lab("Labourer", 0.45, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "doors_windows", sectionLabel: "Doors & Windows",
    title: "Flush door supply and fix",
    description: "Timber flush door 900 x 2100mm complete with frame, ironmongery, supply and fix, door", unit: "nr",
    materials: [mat("Flush door leaf + frame set", 1, "No", 95000), mat("Ironmongery set (hinges, lock)", 1, "Set", 28000)],
    labour: [lab("Carpenter", 0.8, "No/Day", 9000), lab("Labourer", 0.4, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "doors_windows", sectionLabel: "Doors & Windows",
    title: "Aluminium window supply and fix",
    description: "Aluminium sliding window with glazing, supply and fix, window", unit: "nr",
    materials: [mat("Aluminium window unit glazed", 1, "No", 120000), mat("Sealant and fixings", 1, "Set", 8000)],
    labour: [lab("Aluminium fabricator", 0.6, "No/Day", 12000), lab("Labourer", 0.3, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "roofing", sectionLabel: "Roofing",
    title: "Roof construction complete",
    description: "Roof construction: timber trusses, purlins and long-span aluminium roofing sheet, thick roof construction", unit: "m2",
    materials: [mat("Sawn timber trusses/purlins", 1, "m2", 6500), mat("Long-span aluminium sheet 0.55mm", 1.05, "m2", 7800), mat("Roofing nails/accessories", 1, "Set", 900)],
    labour: [lab("Carpenter", 0.35, "No/Day", 9000), lab("Labourer", 0.35, "No/Day", 6000)],
  }),
  rate({
    sectionKey: "doors_windows", sectionLabel: "Doors & Windows",
    title: "Curtain walling glazed aluminium",
    description: "Structural glazed aluminium curtain walling, supply and install", unit: "m2",
    materials: [mat("Curtain wall system glazed", 1, "m2", 185000)],
    labour: [lab("Aluminium fabricator", 0.5, "No/Day", 12000), lab("Labourer", 0.3, "No/Day", 6000)],
  }),
];

await connectDB(process.env.MONGO_URI);
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) { console.error("User not found:", email); process.exit(1); }

let lib = await RateGenLibrary.findOne({ userId: user._id });
if (!lib) lib = new RateGenLibrary({ userId: user._id, materials: [], labour: [], customRates: [] });

// Replace previously-seeded demo rates (idempotent re-run), keep user-authored ones.
const seededTitles = new Set(RATES.map((r) => r.title));
lib.customRates = [...(lib.customRates || []).filter((r) => !seededTitles.has(r.title)), ...RATES];
lib.customRatesVersion = (lib.customRatesVersion || 0) + 1;
await lib.save();

console.log(`Seeded ${RATES.length} custom rates for ${user.email} (library now has ${lib.customRates.length})`);
for (const r of RATES) console.log(`  ${r.unit.padEnd(3)} ₦${String(r.totalCost).padStart(9)}  ${r.title}`);
process.exit(0);
