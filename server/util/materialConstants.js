// The Material Constants library — the editable factors that turn a measured
// bill quantity into its constituent materials and labour ("1 m³ of 1:2:4
// concrete = 6 bags of cement, 0.65 tons of sharp sand, 1.3 tons of granite").
//
// KEY NAMES ARE A CONTRACT with the desktop plugins. QUIV carries the same
// library in Infrastructure/MaterialConstants/MaterialConstantKeys.cs and Heron
// in Helpers/MaterialConstantsStore.cs; a user who edits "Blockwork.BlocksPerSqm"
// here must see the same number there. Add keys, never rename them.
//
// Every definition carries a default (the reference Nigerian QS material
// schedule), a unit, a group for the editor UI, and a sane min/max so a typo
// cannot produce a schedule with a million bags of cement.
//
// Groups beyond the plugin's set:
//   • "MEP – Cost Split"  — services items are supply-and-install lumps; their
//     breakdown is a split of the bill rate, not a factor decomposition.
//   • "Markup"            — the overhead/profit applied when an UNPRICED bill
//     is priced from the build-up.

/** @typedef {{key:string,label:string,unit:string,group:string,def:number,min:number,max:number}} ConstantDef */

const D = (key, label, unit, group, def, min, max) => ({
  key,
  label,
  unit,
  group,
  def,
  min,
  max,
});

export const MC = {
  // Waste
  ConcreteWaste: "Waste.Concrete.Factor",
  BlindingWaste: "Waste.Blinding.Factor",
  BlockWaste: "Waste.Blockwork.Factor",
  FinishesWaste: "Waste.Finishes.Factor",

  // Concrete
  CementBagWeightKg: "Concrete.Cement.BagWeightKg",
  ConcreteCementKgPerM3: "Concrete.Cement.KgPerM3",
  ConcreteSandKgPerM3: "Concrete.SharpSand.KgPerM3",
  ConcreteGravelMultiplier: "Concrete.GravelToSand.Multiplier",
  ConcreteDryVolumeFactor: "Concrete.DryVolume.Factor",

  // Blinding
  BlindingCementBagsPerM3: "Blinding.Cement.BagsPerM3",
  BlindingSandTonsPerM3: "Blinding.SharpSand.TonsPerM3",

  // Formwork
  FormworkBoardAreaPerSheet: "Formwork.Board.AreaPerSheet_m2",
  FormworkBraceFactor: "Formwork.Brace.Factor",
  FormworkNailsBagsPerSheet: "Formwork.Nails.BagsPerSheet",

  // Blockwork
  BlocksPerSqm: "Blockwork.BlocksPerSqm",
  BlockCementBagsPerSqm: "Blockwork.Cement.BagsPerSqm",
  BlockSandTonsPerSqm: "Blockwork.SharpSand.TonsPerSqm",

  // Rebar
  RebarUnitWeightCoeff: "Rebar.UnitWeightCoeff_kgPerMPerMm2",
  RebarStandardBarLengthM: "Rebar.StandardBarLength_m",
  RebarBindingWireFactor: "Rebar.BindingWire.Factor_kgPerKgSteel",

  // Structural steelwork
  SteelBoltsKgPerTon: "Steelwork.Bolts.KgPerTon",
  SteelWeldingKgPerTon: "Steelwork.Welding.KgPerTon",
  SteelPrimerLitresPerTon: "Steelwork.Primer.LitresPerTon",
  LabourSteelworkPerTon: "Labour.Steelwork.PerTon",

  // Coverage
  DpmAreaPerRoll: "Coverage.DPM.AreaPerRoll_m2",
  MeshAreaPerRoll: "Coverage.BRC.AreaPerRoll_m2",
  WaterproofFeltAreaPerRoll: "Coverage.WaterproofFelt.AreaPerRoll_m2",
  SoilPoisonAreaPerUnit: "Coverage.SoilPoison.AreaPerUnit_m2",

  // Finishes factors (per m² of work)
  RenderCementBagsPerM2: "Finishes.Render.Cement.BagsPerM2",
  RenderSandTonsPerM2: "Finishes.Render.PlasterSand.TonsPerM2",
  PopCementBagsPerM2: "Finishes.POP.Cement.BagsPerM2",
  PopPaintDrumsPerM2: "Finishes.POP.Paint.DrumsPerM2",
  PopGlueNrPerM2: "Finishes.POP.Glue.NrPerM2",
  TileM2PerM2: "Finishes.Tiling.Tile.M2PerM2",
  TileCementBagsPerM2: "Finishes.Tiling.Cement.BagsPerM2",
  TileSandTonsPerM2: "Finishes.Tiling.SharpSand.TonsPerM2",
  TileWhiteCementBagsPerM2: "Finishes.Tiling.WhiteCement.BagsPerM2",
  ScreedCementBagsPerM2: "Finishes.Screed.Cement.BagsPerM2",
  ScreedSandTonsPerM2: "Finishes.Screed.SharpSand.TonsPerM2",
  PaintDrumsPerM2: "Finishes.Paint.DrumsPerM2",

  // Ceiling / roof
  CeilingPopBoardFactor: "Ceiling.POP.Board.Factor_m2PerBoard",
  CeilingBoardCoverage: "Ceiling.Board.Coverage_m2PerBoard",
  RoofSheetM2PerM2: "Roof.Sheet.M2PerM2",

  // Filling
  FillingTonsPerM3: "Filling.TonsPerM3",

  // Measurement
  NarrowWidthDefaultGirth: "Measure.NarrowWidth.DefaultGirth_m",

  // Labour rates per bill unit
  LabourConcretePerM3: "Labour.Concrete.PerM3",
  LabourBlindingPerM3: "Labour.Blinding.PerM3",
  LabourFormworkPerM2: "Labour.Formwork.PerM2",
  LabourRebarPerTon: "Labour.Rebar.PerTon",
  LabourBlockworkPerM2: "Labour.Blockwork.PerM2",
  LabourRenderPerM2: "Labour.Render.PerM2",
  LabourPopPerM2: "Labour.POP.PerM2",
  LabourTilingPerM2: "Labour.Tiling.PerM2",
  LabourWallTilingPerM2: "Labour.WallTiling.PerM2",
  LabourPaintingPerM2: "Labour.Painting.PerM2",
  LabourScreedPerM2: "Labour.Screed.PerM2",
  LabourDpmPerM2: "Labour.DPM.PerM2",
  LabourBrcPerM2: "Labour.BRC.PerM2",
  LabourSoilPoisonPerM2: "Labour.SoilPoison.PerM2",
  LabourFillingPerM3: "Labour.Filling.PerM3",
  LabourExcavationPerM3: "Labour.Excavation.PerM3",
  LabourBackfillPerM3: "Labour.Backfill.PerM3",
  LabourRoofCoveringPerM2: "Labour.RoofCovering.PerM2",
  LabourWaterproofingPerM2: "Labour.Waterproofing.PerM2",
  LabourCeilingPopPerM2: "Labour.CeilingPOP.PerM2",

  // Lumpsum supply items (doors/windows/sanitary/railings…)
  LumpsumMaterialShare: "Lumpsum.Material.Share",
  LumpsumLabourShare: "Lumpsum.Labour.Share",
  LumpsumCeilingMaterialShare: "Lumpsum.Ceiling.Material.Share",

  // MEP / services cost split (share of the bill rate)
  MepElectricalMaterialShare: "Mep.Electrical.Material.Share",
  MepElectricalLabourShare: "Mep.Electrical.Labour.Share",
  MepElectricalAccessoryShare: "Mep.Electrical.Accessory.Share",
  MepMechanicalMaterialShare: "Mep.Mechanical.Material.Share",
  MepMechanicalLabourShare: "Mep.Mechanical.Labour.Share",
  MepMechanicalAccessoryShare: "Mep.Mechanical.Accessory.Share",
  MepPlumbingMaterialShare: "Mep.Plumbing.Material.Share",
  MepPlumbingLabourShare: "Mep.Plumbing.Labour.Share",
  MepPlumbingAccessoryShare: "Mep.Plumbing.Accessory.Share",
  MepFireMaterialShare: "Mep.Fire.Material.Share",
  MepFireLabourShare: "Mep.Fire.Labour.Share",
  MepFireAccessoryShare: "Mep.Fire.Accessory.Share",
  MepCableDrumLengthM: "Mep.Cable.DrumLength_m",
  MepConduitLengthM: "Mep.Conduit.StockLength_m",
  MepPipeLengthM: "Mep.Pipe.StockLength_m",

  // Markup used when an UNPRICED bill is priced from the build-up
  MarkupOverheadPercent: "Markup.Overhead.Percent",
  MarkupProfitPercent: "Markup.Profit.Percent",
};

/** @type {ConstantDef[]} */
export const MATERIAL_CONSTANTS = [
  // ── Waste factors ────────────────────────────────────────────────────────
  D(MC.ConcreteWaste, "Concrete waste factor", "factor", "Waste Factors", 1.05, 0.5, 2),
  D(MC.BlindingWaste, "Blinding waste factor", "factor", "Waste Factors", 1.05, 0.5, 2),
  D(MC.BlockWaste, "Blockwork waste factor", "factor", "Waste Factors", 1.03, 0.5, 2),
  D(MC.FinishesWaste, "Finishes waste factor", "factor", "Waste Factors", 1.05, 0.5, 2),

  // ── Concrete ─────────────────────────────────────────────────────────────
  D(MC.CementBagWeightKg, "Cement bag weight", "kg/bag", "Concrete", 50, 10, 100),
  D(MC.ConcreteCementKgPerM3, "Cement density (conversion)", "kg/m³", "Concrete", 1440, 200, 5000),
  D(MC.ConcreteSandKgPerM3, "Sharp sand density (conversion)", "kg/m³", "Concrete", 1600, 200, 5000),
  D(MC.ConcreteGravelMultiplier, "Granite : sand multiplier", "factor", "Concrete", 2, 0, 10),
  // Wet concrete shrinks: 1 m³ placed needs ~1.54 m³ of dry material. This is
  // what puts 1:2:4 at the ~6 bags/m³ every Nigerian QS schedule uses.
  D(MC.ConcreteDryVolumeFactor, "Dry volume factor", "factor", "Concrete", 1.54, 1, 2.5),

  // ── Blinding ─────────────────────────────────────────────────────────────
  D(MC.BlindingCementBagsPerM3, "Blinding cement", "bags/m³", "Blinding", 0.9, 0, 10),
  D(MC.BlindingSandTonsPerM3, "Blinding sharp sand", "tons/m³", "Blinding", 0.58, 0, 10),

  // ── Blockwork ────────────────────────────────────────────────────────────
  D(MC.BlocksPerSqm, "Blocks per m²", "blocks/m²", "Blockwork", 10, 0.01, 1000),
  D(MC.BlockCementBagsPerSqm, "Blockwork cement", "bags/m²", "Blockwork", 0.22, 0, 10),
  D(MC.BlockSandTonsPerSqm, "Blockwork sharp sand", "tons/m²", "Blockwork", 0.089, 0, 10),

  // ── Formwork ─────────────────────────────────────────────────────────────
  D(MC.FormworkBoardAreaPerSheet, "Formwork board coverage", "m²/sheet", "Formwork", 2.88, 0.01, 1000),
  D(MC.FormworkBraceFactor, "Brace length factor", "m/sheet", "Formwork", 0, 0, 1000),
  D(MC.FormworkNailsBagsPerSheet, "Formwork nails", "bags/sheet", "Formwork", 0.015, 0, 1),

  // ── Reinforcement ────────────────────────────────────────────────────────
  D(MC.RebarUnitWeightCoeff, "Rebar unit weight coefficient", "kg/m/mm²", "Reinforcement", 0.00617, 0.0001, 1),
  D(MC.RebarStandardBarLengthM, "Standard bar stock length", "m/bar", "Reinforcement", 12, 0.1, 1000),
  D(MC.RebarBindingWireFactor, "Binding wire factor", "kg/kg steel", "Reinforcement", 0.01, 0, 1),

  // ── Structural steelwork ─────────────────────────────────────────────────
  // Connections and protection are never measured separately but are always
  // bought, so they ride on the tonnage of section.
  D(MC.SteelBoltsKgPerTon, "Bolts, nuts and washers", "kg/ton", "Structural Steel", 25, 0, 500),
  D(MC.SteelWeldingKgPerTon, "Welding electrodes", "kg/ton", "Structural Steel", 12, 0, 500),
  D(MC.SteelPrimerLitresPerTon, "Primer / protective paint", "litres/ton", "Structural Steel", 8, 0, 200),

  // ── Coverage ─────────────────────────────────────────────────────────────
  D(MC.DpmAreaPerRoll, "DPM roll coverage", "m²/roll", "Coverage", 25, 0.01, 100000),
  D(MC.MeshAreaPerRoll, "BRC mesh roll coverage", "m²/roll", "Coverage", 48, 0.01, 100000),
  D(MC.WaterproofFeltAreaPerRoll, "Waterproofing felt roll coverage", "m²/roll", "Coverage", 40, 0.01, 100000),
  D(MC.SoilPoisonAreaPerUnit, "Soil poison coverage", "m²/unit", "Coverage", 20, 0.01, 100000),

  // ── Finishes ─────────────────────────────────────────────────────────────
  D(MC.RenderCementBagsPerM2, "Rendering cement", "bags/m²", "Finishes", 0.13, 0, 5),
  D(MC.RenderSandTonsPerM2, "Rendering plaster sand", "tons/m²", "Finishes", 0.05, 0, 5),
  D(MC.PopCementBagsPerM2, "POP screeding cement", "bags/m²", "Finishes", 0.04, 0, 5),
  D(MC.PopPaintDrumsPerM2, "POP paint (20L drum)", "drums/m²", "Finishes", 0.1, 0, 5),
  D(MC.PopGlueNrPerM2, "POP glue (Top Bond 10kg)", "nr/m²", "Finishes", 0.0184, 0, 5),
  D(MC.TileM2PerM2, "Tiles per area", "m²/m²", "Finishes", 1, 0, 5),
  D(MC.TileCementBagsPerM2, "Tile backing cement", "bags/m²", "Finishes", 0.4, 0, 5),
  D(MC.TileSandTonsPerM2, "Tile backing sharp sand", "tons/m²", "Finishes", 0.057, 0, 5),
  D(MC.TileWhiteCementBagsPerM2, "Tile white cement (grout)", "bags/m²", "Finishes", 0.0023, 0, 1),
  D(MC.ScreedCementBagsPerM2, "Screeding cement", "bags/m²", "Finishes", 0.4, 0, 5),
  D(MC.ScreedSandTonsPerM2, "Screeding sharp sand", "tons/m²", "Finishes", 0.057, 0, 5),
  D(MC.PaintDrumsPerM2, "Emulsion paint (20L drum)", "drums/m²", "Finishes", 0.026, 0, 5),

  // ── Ceiling & roof ───────────────────────────────────────────────────────
  D(MC.CeilingPopBoardFactor, "POP ceiling board coverage", "m²/board", "Ceiling & Roof", 1.44, 0.1, 100),
  D(MC.CeilingBoardCoverage, "Ceiling board coverage", "m²/board", "Ceiling & Roof", 2.88, 0.1, 50),
  D(MC.RoofSheetM2PerM2, "Roof sheet per covered area", "m²/m²", "Ceiling & Roof", 1, 0, 5),

  // ── Filling ──────────────────────────────────────────────────────────────
  D(MC.FillingTonsPerM3, "Fill material density", "tons/m³", "Filling", 0.285, 0, 10),

  // ── Measurement ──────────────────────────────────────────────────────────
  // BESMM bills narrow work by the metre and state the girth in the item text
  // ("edges not exceeding 200mm"). This covers the ones that don't.
  D(MC.NarrowWidthDefaultGirth, "Narrow-width default girth", "m", "Measurement", 0.3, 0.05, 1.5),

  // ── Labour rates ─────────────────────────────────────────────────────────
  D(MC.LabourConcretePerM3, "Concrete labour", "₦/m³", "Labour Rates", 5500, 0, 10000000),
  D(MC.LabourBlindingPerM3, "Blinding labour", "₦/m³", "Labour Rates", 6000, 0, 10000000),
  D(MC.LabourFormworkPerM2, "Formwork labour", "₦/m²", "Labour Rates", 1200, 0, 10000000),
  D(MC.LabourRebarPerTon, "Reinforcement labour", "₦/ton", "Labour Rates", 50000, 0, 100000000),
  D(MC.LabourSteelworkPerTon, "Steelwork fabrication & erection labour", "₦/ton", "Labour Rates", 120000, 0, 100000000),
  D(MC.LabourBlockworkPerM2, "Blockwork labour", "₦/m²", "Labour Rates", 600, 0, 10000000),
  D(MC.LabourRenderPerM2, "Rendering labour", "₦/m²", "Labour Rates", 1300, 0, 10000000),
  D(MC.LabourPopPerM2, "POP screeding labour", "₦/m²", "Labour Rates", 550, 0, 10000000),
  D(MC.LabourTilingPerM2, "Floor tiling labour", "₦/m²", "Labour Rates", 950, 0, 10000000),
  D(MC.LabourWallTilingPerM2, "Wall tiling labour", "₦/m²", "Labour Rates", 1300, 0, 10000000),
  D(MC.LabourPaintingPerM2, "Painting labour", "₦/m²", "Labour Rates", 520, 0, 10000000),
  D(MC.LabourScreedPerM2, "Screeding labour", "₦/m²", "Labour Rates", 550, 0, 10000000),
  D(MC.LabourDpmPerM2, "DPM labour", "₦/m²", "Labour Rates", 800, 0, 10000000),
  D(MC.LabourBrcPerM2, "BRC mesh labour", "₦/m²", "Labour Rates", 750, 0, 10000000),
  D(MC.LabourSoilPoisonPerM2, "Soil poisoning labour", "₦/m²", "Labour Rates", 450, 0, 10000000),
  D(MC.LabourFillingPerM3, "Filling labour", "₦/m³", "Labour Rates", 1200, 0, 10000000),
  D(MC.LabourExcavationPerM3, "Excavation labour", "₦/m³", "Labour Rates", 1350, 0, 10000000),
  D(MC.LabourBackfillPerM3, "Backfill / disposal labour", "₦/m³", "Labour Rates", 1050, 0, 10000000),
  D(MC.LabourRoofCoveringPerM2, "Roof covering labour", "₦/m²", "Labour Rates", 7500, 0, 10000000),
  D(MC.LabourWaterproofingPerM2, "Waterproofing labour", "₦/m²", "Labour Rates", 6500, 0, 10000000),
  D(MC.LabourCeilingPopPerM2, "POP ceiling labour", "₦/m²", "Labour Rates", 800, 0, 10000000),

  // ── Lumpsum supply items ─────────────────────────────────────────────────
  D(MC.LumpsumMaterialShare, "Material share of bill rate", "factor", "Lumpsum Items", 0.7, 0, 1),
  D(MC.LumpsumLabourShare, "Labour share of bill rate", "factor", "Lumpsum Items", 0.15, 0, 1),
  D(MC.LumpsumCeilingMaterialShare, "Ceiling: material share of bill rate", "factor", "Lumpsum Items", 0.75, 0, 1),

  // ── MEP cost split ───────────────────────────────────────────────────────
  // Services bills price "supply and install" as one rate. The schedule splits
  // that rate into the equipment/cable itself, the installation labour, and the
  // accessories that never get measured (glands, lugs, clips, saddles, tape).
  D(MC.MepElectricalMaterialShare, "Electrical: material share", "factor", "MEP – Cost Split", 0.62, 0, 1),
  D(MC.MepElectricalLabourShare, "Electrical: installation labour share", "factor", "MEP – Cost Split", 0.22, 0, 1),
  D(MC.MepElectricalAccessoryShare, "Electrical: accessories share", "factor", "MEP – Cost Split", 0.06, 0, 1),
  D(MC.MepMechanicalMaterialShare, "Mechanical: material share", "factor", "MEP – Cost Split", 0.65, 0, 1),
  D(MC.MepMechanicalLabourShare, "Mechanical: installation labour share", "factor", "MEP – Cost Split", 0.2, 0, 1),
  D(MC.MepMechanicalAccessoryShare, "Mechanical: accessories share", "factor", "MEP – Cost Split", 0.05, 0, 1),
  D(MC.MepPlumbingMaterialShare, "Plumbing: material share", "factor", "MEP – Cost Split", 0.6, 0, 1),
  D(MC.MepPlumbingLabourShare, "Plumbing: installation labour share", "factor", "MEP – Cost Split", 0.25, 0, 1),
  D(MC.MepPlumbingAccessoryShare, "Plumbing: accessories share", "factor", "MEP – Cost Split", 0.05, 0, 1),
  D(MC.MepFireMaterialShare, "Fire services: material share", "factor", "MEP – Cost Split", 0.63, 0, 1),
  D(MC.MepFireLabourShare, "Fire services: installation labour share", "factor", "MEP – Cost Split", 0.22, 0, 1),
  D(MC.MepFireAccessoryShare, "Fire services: accessories share", "factor", "MEP – Cost Split", 0.05, 0, 1),
  D(MC.MepCableDrumLengthM, "Cable drum length", "m/drum", "MEP – Cost Split", 100, 1, 5000),
  D(MC.MepConduitLengthM, "Conduit stock length", "m/length", "MEP – Cost Split", 3, 0.5, 50),
  D(MC.MepPipeLengthM, "Pipe stock length", "m/length", "MEP – Cost Split", 5.8, 0.5, 50),

  // ── Markup ───────────────────────────────────────────────────────────────
  D(MC.MarkupOverheadPercent, "Overhead", "% of net cost", "Markup", 10, 0, 100),
  D(MC.MarkupProfitPercent, "Profit", "% of net cost", "Markup", 25, 0, 100),
];

const BY_KEY = new Map(MATERIAL_CONSTANTS.map((d) => [d.key, d]));

/** The definition for a key, or null when it is not in the catalog. */
export function constantDef(key) {
  return BY_KEY.get(String(key || "")) || null;
}

/** Every group name, in catalog (display) order. */
export function constantGroups() {
  const seen = [];
  for (const d of MATERIAL_CONSTANTS) if (!seen.includes(d.group)) seen.push(d.group);
  return seen;
}

/**
 * Clamp a proposed value into its definition's range. Unknown keys and
 * non-finite values are rejected (null) so a bad override can never reach the
 * derivation engine.
 */
export function clampConstant(key, value) {
  const def = constantDef(key);
  if (!def) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(def.max, Math.max(def.min, n));
}

/** Drop unknown keys / out-of-range values from a raw overrides object. */
export function sanitizeConstantOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    const v = clampConstant(key, value);
    if (v !== null) out[key] = v;
  }
  return out;
}

/**
 * Resolve a constants set for the derivation engine.
 *
 * `layers` are applied left to right, so pass them least- to most-specific
 * (user profile, then project overrides). Returns a getter that always yields a
 * usable number: an override when present and in range, otherwise the catalog
 * default.
 */
export function resolveConstants(...layers) {
  const values = {};
  for (const d of MATERIAL_CONSTANTS) values[d.key] = d.def;
  for (const layer of layers) {
    if (!layer) continue;
    // Mongoose Map or plain object
    const entries =
      typeof layer.entries === "function" ? [...layer.entries()] : Object.entries(layer);
    for (const [key, value] of entries) {
      const v = clampConstant(key, value);
      if (v !== null) values[key] = v;
    }
  }
  return {
    values,
    /** get(key) → the resolved number; `fallback` covers keys outside the catalog. */
    get(key, fallback = 0) {
      const v = values[key];
      return Number.isFinite(v) ? v : fallback;
    },
  };
}

/** Catalog + current values, shaped for the Material Constants editor. */
export function constantsForClient(...layers) {
  const resolved = resolveConstants(...layers);
  return {
    groups: constantGroups(),
    constants: MATERIAL_CONSTANTS.map((d) => ({
      ...d,
      value: resolved.values[d.key],
      isDefault: resolved.values[d.key] === d.def,
    })),
  };
}
