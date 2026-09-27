// Build a custom rate, in one card.
//
// This replaces nothing, because customers have never been able to build a
// rate on the website at all: /rategen lists "My Custom Rates" read-only,
// synced down from Rate Gen desktop, and the admin builder is master-level and
// stays admin-only. What this is, is the customer's own rate — held against
// their account in RateGenLibrary.customRates, and picked up by Rate Gen,
// QUIV and HERON on their next sync.
//
// His markup: .rg-build with .w for full-width fields, .grp per line group,
// .rg-ln per line and .tot for the live total strip. All of it is already in
// the ported stylesheet, including the card-width rule.
//
// TWO THINGS OF HIS ARE DELIBERATELY NOT HERE
//
// "Link to a project": UserCustomRateSchema has no project field, so the
// control would have nowhere to write. A select that silently discards its
// value is worse than no select, so it waits for the field.
//
// TRADE-DEFAULT OVERHEAD AND PROFIT (R2, r2-overhead-profit-per-trade)
//
// His placeholders read "Trade: 12". They now do, from the customer's own
// default for the trade the rate is filed under (GET
// /rategen-v2/library/trade-margins), and "Default: 10" where they have set
// none. Either way the placeholder is the figure a blank box is saved at, and
// the total strip below is worked out at it (blankDefaults()).
//
// PLANT FROM THE PLANT LIBRARY (R2, r2-plant-library-per-hour)
//
// A plant line is picked from the plant library — a machine costed per day
// from its parts and priced per hour at a stated working day — and consumed
// by the hour: "0.25 hr per m³". A machine the library cannot price is listed
// but cannot be picked, so no plant line enters a rate at ₦0. With no library
// to hand, a machine is typed by hand with an hourly price, as before.
//
// A LINE POINTS AT A NAME, NOT AT A ROW NUMBER (S18 review, finding 7)
//
// GET /rategen/master numbers its rows `sn: i + 1` — a position in one
// request's alphabetical, location-scoped list (fetchMasterMaterials in
// server/util/rategenMaster.js). It is not a catalogue id: add a material,
// work in another state, and row 214 is a different material. Storing it as a
// line's refSn filed the customer's rate against a number that would come to
// mean something else, and refSn is read as a price-resolution key elsewhere
// (resolveLinePrice in services/archicadCosting.js, the compute engine), where
// a stale one prices the wrong thing silently. A line now carries the name and
// unit it was picked by, which is the identity the whole price-override system
// already matches on (priceKey in server/util/rategenBulkPrices.js), and
// leaves refSn null for the desktop to fill with its own stable serial.
//
// OVERHEAD AND PROFIT ARE SAVED AS TYPED (S18 review, finding 4)
//
// These boxes used to carry max="60", which a browser does not enforce on a
// typed figure, while the build-up screen clamped to 60 and re-saved at the
// clamp — so a rate built here at 80% profit became a 60% rate the first time
// it was opened and saved, and the customer was never told. There is one rule
// now, percentProblem() in rateMath.js, and both screens keep it: what is in
// the box is what is stored, and a figure that cannot be stored is refused in
// words by draftProblem() before anything is written.

import React from "react";
import { FaTimes } from "../../components/icons.jsx";
import { toNum } from "./rateMath.js";
import { blankDefaults, draftTotals, emptyDraft } from "./customRateDraft.js";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

/**
 * How a catalogue row is identified: by what it is and what it is sold in,
 * never by its position in the answer to one request. The catalogue carries
 * rows that share a name and differ by unit — steel per tonne and per kg — so
 * the unit is part of the identity, exactly as it is server-side.
 */
const rowKey = (r) =>
  `${String(r?.description ?? r?.name ?? "").trim()}|${String(r?.unit ?? "").trim()}`;

const GROUPS = [
  { kind: "material", label: "Materials", qtyNote: "quantity per" },
  { kind: "labour", label: "Labour", qtyNote: "gang days per" },
  { kind: "plant", label: "Plant", qtyNote: "hours per" },
];

const PLANT_UNIT = "hr";

/** A machine's line identity in the picker: its library key, else its name. */
const plantKey = (p) => String(p?.sn ?? p?.key ?? p?.name ?? "");

/** A draft line for a library machine, at `hours` hours per unit of the rate. */
function plantDraftLine(m, hours) {
  return {
    kind: "plant",
    name: m.name,
    unit: PLANT_UNIT,
    unitPrice: toNum(m.hourlyRate),
    quantity: hours ?? 0.25,
    category: m.category || "",
    // An ADLM machine's serial is a real catalogue id (it is allocated, not a
    // row position), so it is kept. A machine of the customer's own has none.
    refSn: m.sn ?? null,
    plantKey: plantKey(m),
  };
}

/**
 * The card body. State lives here; the caller reads the current draft through
 * `draftRef`, which is what the card's validate() and its resolve handler use.
 */
export default function CustomRateBuilder({
  draftRef,
  materials = [],
  labour = [],
  plant = [],
  trades = [],
  sections = [],
  initial,
}) {
  const [draft, setDraft] = React.useState(() => initial || emptyDraft());

  // Kept in step on every render so the caller never reads a stale draft.
  draftRef.current = draft;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const pricedPlant = plant.filter((p) => p.priced && p.hourlyRate > 0);

  const addLine = (kind) => {
    if (kind === "plant" && pricedPlant.length) {
      const m = pricedPlant[0];
      setDraft((d) => ({
        ...d,
        lines: [...d.lines, plantDraftLine(m, 0.25)],
      }));
      return;
    }
    const src = kind === "material" ? materials : kind === "labour" ? labour : [];
    const first = src[0];
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        first
          ? {
              kind,
              name: first.description || first.name || "",
              unit: first.unit || (kind === "labour" ? "day" : ""),
              unitPrice: toNum(first.price),
              quantity: kind === "labour" ? 0.05 : 1,
              category: first.category || "",
              // Not first.sn: that is this request's row number, not an id.
              refSn: null,
            }
          : // Plant, and a catalogue that failed to load, are typed by hand.
            {
              kind,
              name: "",
              unit: kind === "plant" ? PLANT_UNIT : "",
              unitPrice: 0,
              quantity: kind === "plant" ? 1 : 1,
              category: "",
              refSn: null,
            },
      ],
    }));
  };

  const setLine = (index, patch) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));

  const removeLine = (index) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== index) }));

  const pick = (index, kind, value) => {
    if (kind === "plant") {
      const m = pricedPlant.find((p) => plantKey(p) === value);
      if (!m) return;
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((l, i) =>
          i === index ? plantDraftLine(m, l.quantity) : l,
        ),
      }));
      return;
    }
    const src = kind === "material" ? materials : labour;
    const row = src.find((r) => rowKey(r) === value);
    if (!row) return;
    setLine(index, {
      name: row.description || row.name || "",
      unit: row.unit || (kind === "labour" ? "day" : ""),
      unitPrice: toNum(row.price),
      category: row.category || "",
      refSn: null,
    });
  };

  const defaults = blankDefaults(trades, draft.sectionKey);
  const t = draftTotals(draft, defaults);
  const placeholder = (half) =>
    `${half.source === "your-trade" ? "Trade" : "Default"}: ${half.value}`;

  const options = (src) =>
    src.map((r, i) => (
      <option key={`${rowKey(r)}-${i}`} value={rowKey(r)}>
        {r.description || r.name}
        {r.unit ? ` · per ${r.unit}` : ""}
      </option>
    ));

  return (
    <div className="rg-build">
      <label className="w">
        <span>Name of rate</span>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Ceramic floor tiling 300×300 on screed"
        />
      </label>

      <label>
        <span>Unit</span>
        <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
      </label>

      <label>
        <span>Trade</span>
        <select
          value={draft.sectionKey}
          onChange={(e) => {
            const key = e.target.value;
            set({
              sectionKey: key,
              sectionLabel: sections.find((s) => s.key === key)?.label || "",
            });
          }}
        >
          <option value="">Not filed under a trade</option>
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>
          Overhead <em>%</em>
        </span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={draft.overhead}
          onChange={(e) => set({ overhead: e.target.value })}
          placeholder={placeholder(defaults.overhead)}
        />
      </label>

      <label>
        <span>
          Profit <em>%</em>
        </span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={draft.profit}
          onChange={(e) => set({ profit: e.target.value })}
          placeholder={placeholder(defaults.profit)}
        />
      </label>

      <label className="w">
        <span>Description</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="The measured description a client reads"
        />
      </label>

      {GROUPS.map((g) => {
        const rows = draft.lines
          .map((l, i) => ({ ...l, index: i }))
          .filter((l) => l.kind === g.kind);
        const src = g.kind === "material" ? materials : g.kind === "labour" ? labour : [];
        const fromLibrary = (l) =>
          g.kind === "plant" && pricedPlant.some((p) => plantKey(p) === l.plantKey);
        return (
          <div className="w grp" key={g.kind}>
            <b>{g.label}</b>
            <em>
              {g.qtyNote} {draft.unit || "unit"}
            </em>

            {rows.map((l) => (
              <div className="rg-ln" key={l.index}>
                {g.kind === "plant" && fromLibrary(l) ? (
                  <select
                    value={l.plantKey}
                    onChange={(e) => pick(l.index, "plant", e.target.value)}
                    aria-label="Plant line"
                  >
                    {plant.map((p) => (
                      <option
                        key={plantKey(p)}
                        value={plantKey(p)}
                        disabled={!(p.priced && p.hourlyRate > 0)}
                      >
                        {p.name}
                        {p.priced && p.hourlyRate > 0
                          ? ` · ${money(p.hourlyRate)} per hr`
                          : " · not priced"}
                      </option>
                    ))}
                  </select>
                ) : src.length ? (
                  <select
                    value={rowKey({ description: l.name, unit: l.unit })}
                    onChange={(e) => pick(l.index, g.kind, e.target.value)}
                    aria-label={`${g.label} line`}
                  >
                    {options(src)}
                  </select>
                ) : (
                  <input
                    value={l.name}
                    onChange={(e) => setLine(l.index, { name: e.target.value })}
                    placeholder={
                      g.kind === "plant" ? "Machine, e.g. Excavator" : "What it is"
                    }
                    aria-label={`${g.label} line`}
                  />
                )}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={l.quantity}
                  onChange={(e) => setLine(l.index, { quantity: e.target.value })}
                  aria-label="Quantity"
                />
                <em>{l.unit || (g.kind === "plant" ? PLANT_UNIT : "")}</em>
                <button
                  type="button"
                  className="x"
                  onClick={() => removeLine(l.index)}
                  aria-label={`Remove ${l.name || "line"}`}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
            ))}

            {/* A machine typed by hand (no library to pick from) carries an
                hourly price of the user's own. A library machine's price
                comes from its day cost and is not typed here. */}
            {g.kind === "plant"
              ? rows.filter((l) => !fromLibrary(l)).map((l) => (
                  <div className="rg-ln" key={`price-${l.index}`}>
                    <em>Price per hour for {l.name || "this machine"}</em>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={l.unitPrice}
                      onChange={(e) => setLine(l.index, { unitPrice: e.target.value })}
                      aria-label={`Hourly price for ${l.name || "this machine"}`}
                    />
                    <em>₦/h</em>
                    <span />
                  </div>
                ))
              : null}

            <button type="button" className="pj-lnk" onClick={() => addLine(g.kind)}>
              + Add {g.kind === "material" ? "material" : g.kind === "labour" ? "labour" : "plant"}
            </button>
          </div>
        );
      })}

      <div className="w tot">
        <span>
          Net {money(t.netCost)} · overhead {money(t.overheadValue)} · profit{" "}
          {money(t.profitValue)}
        </span>
        <b>
          {money(t.totalCost)} <small>per {draft.unit || "unit"}</small>
        </b>
      </div>
    </div>
  );
}
