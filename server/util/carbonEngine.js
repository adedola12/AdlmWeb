// server/util/carbonEngine.js
//
// Upfront embodied carbon (RICS whole life carbon, modules A1-A5) of one
// build-up line, from the factors in assets/carbon/carbonFactors.json.
//
// A port of the desktop RateGen's Services/CarbonEngine.cs (ADLMRateGen-suiteui,
// feat/rategen-suite-ui, 29448e7) so ADLM Cloud gives the same figure the
// desktop shows. The factor file is a copy of the desktop's Data/carbonFactors.json:
// change one, change both. Every factor carries its published source; every
// mass that is an assumption rather than stated by the item is marked.
//
//   A1-A3  product        = kg x factor
//   A4     transport      = kg x a4 (0.005 local / 0.032 national, kgCO2e/kg)
//   A5w    site waste     = kg x wf x (factor + a4 + C2 + C3-C4)
//   A5a    site energy    = fuel burnt x fuel factor (diesel, petrol, LPG)

import fs from "node:fs";

const FACTORS_URL = new URL("../assets/carbon/carbonFactors.json", import.meta.url);

let _doc = null;

function load() {
  if (_doc) return _doc;
  const raw = JSON.parse(fs.readFileSync(FACTORS_URL, "utf8"));
  _doc = {
    c2: raw.c2 ?? 0.005,
    method: raw.method || "",
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    factors: (raw.factors || []).map((f) => ({
      id: f.id || "",
      label: f.label || "",
      pattern: f.pattern || "",
      source: f.factorSource || "",
      massBasis: f.massBasis || "",
      wasteBasis: f.wfBasis || "",
      value: f.factor ?? 0,
      valueLow: f.factorLow ?? null,
      lowSource: f.lowSource || "",
      a4: f.a4 ?? 0,
      wf: f.wf ?? 0,
      c34: f.c34 ?? 0.013,
      fuel: f.fuel === true,
      massAssumed: f.massAssumed === true,
      // matched only against "<line> || <the rate's description>": a line that says
      // "Sheeting (975 x 2250)" is fibre cement or zinc only by what the rate says
      context: f.context === true,
      mass: f.mass && typeof f.mass === "object" ? f.mass : {},
      rx: new RegExp(f.pattern || "", "i"),
    })),
  };
  return _doc;
}

export const carbonMethod = () => load().method;
export const carbonSources = () => load().sources;
export const carbonFactors = () => load().factors;

const fmt = (v, dp) => String(Number(v.toFixed(dp)));

/**
 * The factor for a library row ("category :: name"), or null. With
 * { context: true } only the factors that need the rate's own description are
 * tried, and `name` is expected as "<line> || <rate description>".
 */
export function matchFactor(category, name, { context = false } = {}) {
  const key = `${String(category || "").trim()} :: ${String(name || "").trim()}`.toLowerCase();
  return load().factors.find((f) => f.context === context && f.rx.test(key)) || null;
}

/** kg (or litres of fuel) per library unit, or null when it cannot be read. */
export function massPerUnit(f, name, unit, hint = "") {
  const u = String(unit || "").trim().toLowerCase().replace(/\.+$/, "");
  const n = String(name || "").toLowerCase();
  const h = String(hint || "").toLowerCase();
  const m = f.mass || {};

  // a tile's thickness, where the line or the item names one ("600 x 600 x 10mm",
  // "1.3mm floor flex"), comes before the per-m2 fallback
  if (m.rule === "tile" && (u === "m2" || u.startsWith("m2"))) {
    for (const text of [h, n]) {
      const t = text.match(/x\s*(\d+(?:\.\d+)?)\s*mm(?!.*x\s*\d)/) || text.match(/^(\d+(?:\.\d+)?)\s*mm\b/);
      if (t) return (Number(t[1]) / 1000) * (m.density ?? 2000);
    }
  }

  // stated per unit
  if (m.perUnit && typeof m.perUnit === "object") {
    for (const [k, v] of Object.entries(m.perUnit)) if (k.toLowerCase() === u) return Number(v);
    if (u.endsWith("litre") && m.perUnit.litre != null) {
      const lm = u.match(/^(\d+(?:\.\d+)?)\s*litre/);
      return (lm ? Number(lm[1]) : 1) * Number(m.perUnit.litre);
    }
  }

  // paint: litres in the unit x density ("4 Litre", "Lit/m2", "litre/m2")
  if (m.litres === true) {
    if (u === "gal") return 4.546 * (m.density ?? 1.3);
    const lm = u.match(/^(\d+(?:\.\d+)?)?\s*(litre|ltr|lit|l)\b/);
    if (!lm) return null;
    return (lm[1] ? Number(lm[1]) : 1) * (m.density ?? 1.3);
  }

  switch (m.rule) {
    case "mesh": {
      const d = n.match(/\ba(142|193|252)\b/);
      if (!d) return null;
      const kgm2 = d[1] === "142" ? 2.22 : d[1] === "193" ? 3.02 : 3.95;
      return kgm2 * 4.8 * 2.4;
    }
    case "plate": {
      const p = n.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+)(?:-(\d+))?\s*mm/);
      if (!p) return null;
      const t = p[4] ? (Number(p[3]) + Number(p[4])) / 2 : Number(p[3]);
      return (Number(p[1]) * Number(p[2]) * t) / 1000 * 7850;
    }
    case "block": {
      // NIS 87:2007 sizes at 1,920 kg/m3 (see the factor's massBasis); the size
      // leads a library row ("225 x 225 x 450mm") or sits in a line ("blocks per m2 (225mm)")
      const size = ["225", "150", "100"].find((s) => n.startsWith(s)) || n.match(/\b(225|150|100)\s*mm\b/)?.[1];
      return size === "225" ? 27.5 : size === "150" ? 18.2 : size === "100" ? 19.4 : null;
    }
    case "timber":
    case "board": {
      const density = m.density ?? (m.rule === "timber" ? 500 : 600);
      const t = n.match(/\((\d+)x(\d+)x(\d+)mm\)/);
      if (t) return ((Number(t[1]) * Number(t[2]) * Number(t[3])) / 1e9) * density;
      // a build-up line: boards by the m2 at their thickness ("formwork boards (25mm)"),
      // or a section by the metre ("studs (50x50mm)")
      if (u.startsWith("m2")) {
        const th = n.match(/\((\d+(?:\.\d+)?)\s*mm\)/);
        return th ? (Number(th[1]) / 1000) * density : null;
      }
      if (u === "m") {
        const s = n.match(/(\d+)\s*x\s*(\d+)\s*mm/);
        return s ? ((Number(s[1]) * Number(s[2])) / 1e6) * density : null;
      }
      return null;
    }
    case "opening": {
      // a door or window by its size as named ("1800 x 1200mm"), at kg per m2 of opening
      if (u.startsWith("m2")) return m.density ?? null;
      const o = n.match(/(\d{3,4})\s*x\s*(\d{3,4})\s*mm/);
      return o ? ((Number(o[1]) * Number(o[2])) / 1e6) * (m.density ?? 20) : null;
    }
    case "pipe": {
      // a pipe by the metre from its nominal diameter, wall at D/26 (SDR 26)
      const d = n.match(/\b(\d{2,3})\s*mm\b/);
      if (!d || u !== "m") return null;
      const D = Number(d[1]) / 1000;
      return Math.PI * D * (D / 26) * (m.density ?? 1400);
    }
    case "aluminium": {
      if (n.includes("angle ridge")) return u === "m" ? 0.0007 * 0.6 * 2700 : null;
      const t = n.match(/(\d\.\d+)mm/);
      if (!t || u !== "m2") return null;
      return (Number(t[1]) / 1000) * 2700;
    }
    case "glass": {
      const g = n.match(/\((\d+)x(\d+)mm\).*?(\d)mm/);
      if (!g) return null;
      return (Number(g[1]) / 1000) * (Number(g[2]) / 1000) * (Number(g[3]) / 1000) * 2500;
    }
    default:
      return null;
  }
}

/**
 * Carbon of `qty` library units of the item, or null when the item has no
 * factor or its mass cannot be worked out. Never guessed.
 * Returns { factor, kg, a13, a4, a5w, a5a, total, totalLow, basis }.
 */
export function assessCarbon(category, name, unit, qty, hint = "", { context = false } = {}) {
  const f = matchFactor(category, name, { context });
  if (!f || !(qty > 0)) return null;
  const perUnit = massPerUnit(f, name, unit, hint);
  if (perUnit == null || !(perUnit > 0)) return null;

  const { c2 } = load();
  const amount = qty * perUnit; // kg of material, or litres / kg of fuel
  if (f.fuel) {
    const a5a = amount * f.value;
    return {
      factor: f, kg: 0, a13: 0, a4: 0, a5w: 0, a5a, total: a5a, totalLow: a5a,
      basis: `${f.label}: ${fmt(amount, 3)} x ${fmt(f.value, 5)} kgCO2e (site energy, A5a). ${f.source}.`,
    };
  }
  const a13 = amount * f.value;
  const a4 = amount * f.a4;
  const a5w = amount * f.wf * (f.value + f.a4 + c2 + f.c34);
  const low = f.valueLow ?? f.value;
  const totalLow = amount * low + a4 + amount * f.wf * (low + f.a4 + c2 + f.c34);
  const basis =
    `${f.label}: ${fmt(amount, 3)} kg (${fmt(perUnit, 3)} kg per ${unit}; ${f.massBasis}` +
    (f.massAssumed ? ", assumed" : "") +
    `) x ${fmt(f.value, 4)} kgCO2e/kg. ${f.source}. ` +
    `Transport ${fmt(f.a4, 3)} kgCO2e/kg; waste: ${f.wasteBasis}.` +
    (f.valueLow != null
      ? ` Low end ${fmt(totalLow, 3)} kgCO2e at ${fmt(f.valueLow, 3)} kgCO2e/kg: ${f.lowSource}.`
      : "");
  return { factor: f, kg: amount, a13, a4, a5w, a5a: 0, total: a13 + a4 + a5w, totalLow, basis };
}
