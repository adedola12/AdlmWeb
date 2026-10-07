// server/services/pricePreview.js
//
// "Price with my RateGen rates": a project's bill re-priced with the viewer's own
// RateGen rates for their state, line by line, WITHOUT saving anything. Built for
// the read-only sample projects (owner, 3 Oct 2026), so a user can see what RateGen
// pricing does to a real bill before using it on their own; it works the same on
// any project the viewer can see the rates of.
//
// A line's new rate, firmest first, and every line says which:
//   same      the viewer's rate with the line's own description and unit
//   work      the viewer's rate for the work the line measures, unit converted
//             (util/icmsWorkCarbon.js: concrete by mix, rebar by size, blockwork by
//             thickness...), with anything the bill does not say assumed and said
//   services  SERVIQ lines: the services pricing (util/serviceResolve.js), which
//             reads the RateGen master strictly
//   none      no rate: the line keeps no new price and is counted as not priced
// Rates are the all-in rate (net + overhead + profit), as a bill rate is.

import { RateGenRate } from "../models/RateGenRate.js";
import { RateGenLibrary } from "../models/RateGenLibrary.js";
import { User } from "../models/User.js";
import { mergeRatesWithUserData } from "../util/rategenUserRates.js";
import { matchWorkRate } from "../util/icmsWorkCarbon.js";
import { unitsAgree } from "../util/rateSuggestions.js";
import { priceServiceItems, mapServiceType } from "../util/serviceResolve.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const fold = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const isMep = (pk) => /mep/i.test(String(pk || ""));

/** The viewer's rates: master rates for their state (else the location-free ones), their overrides and custom rates. */
async function viewerRates(userId, state) {
  const [master, lib] = await Promise.all([
    RateGenRate.find(state ? { $or: [{ state: null }, { state }] } : { state: null }).lean(),
    userId ? RateGenLibrary.findOne({ userId }).lean() : null,
  ]);
  // a state's own rate wins over the location-free one with the same description and unit
  const best = new Map();
  for (const r of master) {
    const k = `${fold(r.description)}|${fold(r.unit)}`;
    if (!best.has(k) || r.state) best.set(k, r);
  }
  return mergeRatesWithUserData([...best.values()], lib?.rateOverrides || [], lib?.customRates || [])
    .filter((r) => num(r.totalCost) > 0);
}

/**
 * The preview. `project` is a lean project with its items; returns
 * { lines: [...], totals: { current, preview, pricedLines, lines, pricedShare }, state }.
 */
export async function pricePreview(project, userId) {
  // RateGen holds building and services rates; road and civil works priced from
  // building rates would be a confident wrong answer (CIVIQ's samples halved)
  if (/civil/i.test(String(project.productKey || ""))) {
    return {
      unsupported: "RateGen has no civil works rates yet, so this bill cannot be priced from your RateGen rates.",
      lines: [],
      totals: { current: 0, preview: 0, currentOfPriced: 0, pricedLines: 0, lines: 0, pricedShare: 0 },
    };
  }
  const user = userId ? await User.findById(userId, { state: 1, zone: 1 }).lean() : null;
  const state = user?.state || null;
  const items = (project.items || []).filter((it) => num(it.qty) > 0 && String(it.description || it.takeoffLine || "").trim());

  let found;
  if (isMep(project.productKey)) {
    const inputs = items.map((it) => ({
      type: mapServiceType(it),
      description: it.description || it.takeoffLine || "",
      qty: num(it.qty),
      unit: it.unit || "",
      materialName: it.materialName || it.description || it.takeoffLine || "",
      labourName: it.description || it.takeoffLine || "",
    }));
    const { items: priced } = await priceServiceItems(userId, inputs);
    found = priced.map((p, i) => {
      const q = num(items[i].qty);
      const net = num(p.buildup?.net);
      if (!(net > 0) || !(q > 0)) return null;
      const m = p.resolved?.material;
      return { rate: r2(net / q), source: "services", from: m?.name || "RateGen services pricing", assumed: p.resolved?.allIn ? "All-in supply and fix rate" : null };
    });
  } else {
    const rates = await viewerRates(userId, state);
    const byDesc = new Map();
    for (const r of rates) {
      const k = fold(r.description);
      if (!byDesc.has(k)) byDesc.set(k, []);
      byDesc.get(k).push(r);
    }
    found = items.map((it) => {
      const same = (byDesc.get(fold(it.description)) || []).find((r) => unitsAgree(it.unit, r.unit));
      if (same) return { rate: r2(num(same.totalCost)), source: "same", from: same.description, assumed: null };
      const w = matchWorkRate(it, rates, { usable: (r) => num(r.totalCost) > 0 });
      if (w) {
        return {
          rate: r2(num(w.rate.totalCost) * w.factor),
          source: "work",
          from: w.rate.description,
          assumed: [w.assumed, w.sized].filter(Boolean).join(" ") || null,
        };
      }
      return null;
    });
  }

  let current = 0, preview = 0, pricedLines = 0, pricedCurrent = 0;
  const lines = items.map((it, i) => {
    const f = found[i];
    const qty = num(it.qty);
    const amountCurrent = qty * num(it.rate);
    current += amountCurrent;
    if (f) {
      pricedLines++;
      preview += qty * f.rate;
      pricedCurrent += amountCurrent;
    }
    return {
      key: String(it.lineId || it.sn || i),
      description: String(it.description || it.takeoffLine || ""),
      unit: String(it.unit || ""),
      qty,
      currentRate: num(it.rate),
      newRate: f ? f.rate : null,
      amountCurrent: r2(amountCurrent),
      amountNew: f ? r2(qty * f.rate) : null,
      source: f ? f.source : "none",
      from: f ? f.from : null,
      assumed: f?.assumed || null,
    };
  });
  return {
    state,
    lines,
    totals: {
      current: r2(current),
      // the priced lines only, against what those same lines cost in the bill
      preview: r2(preview),
      currentOfPriced: r2(pricedCurrent),
      pricedLines,
      lines: lines.length,
      pricedShare: current > 0 ? r2(pricedCurrent / current) : 0,
    },
  };
}
