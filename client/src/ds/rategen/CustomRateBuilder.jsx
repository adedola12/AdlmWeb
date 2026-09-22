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
// Trade-default overhead and profit: his placeholders read "Trade: 12" from a
// per-trade default that does not exist on our server (RG-06, deferred — it
// changes figures the desktop plugins read). Ours shows the real default the
// server will apply if the box is left blank, which is 10% and 10%.

import React from "react";
import { FaTimes } from "../../components/icons.jsx";
import { toNum } from "./rateMath.js";
import {
  CUSTOM_DEFAULT_OVERHEAD,
  CUSTOM_DEFAULT_PROFIT,
  draftTotals,
  emptyDraft,
} from "./customRateDraft.js";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const GROUPS = [
  { kind: "material", label: "Materials", qtyNote: "quantity per" },
  { kind: "labour", label: "Labour", qtyNote: "gang days per" },
  { kind: "plant", label: "Plant", qtyNote: "hours per" },
];

/**
 * The card body. State lives here; the caller reads the current draft through
 * `draftRef`, which is what the card's validate() and its resolve handler use.
 */
export default function CustomRateBuilder({
  draftRef,
  materials = [],
  labour = [],
  sections = [],
  initial,
}) {
  const [draft, setDraft] = React.useState(() => initial || emptyDraft());

  // Kept in step on every render so the caller never reads a stale draft.
  draftRef.current = draft;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const addLine = (kind) => {
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
              refSn: first.sn ?? null,
            }
          : // Plant, and a catalogue that failed to load, are typed by hand.
            {
              kind,
              name: "",
              unit: kind === "plant" ? "h" : "",
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
    const src = kind === "material" ? materials : labour;
    const row = src.find((r) => String(r.sn ?? r.description) === value);
    if (!row) return;
    setLine(index, {
      name: row.description || row.name || "",
      unit: row.unit || (kind === "labour" ? "day" : ""),
      unitPrice: toNum(row.price),
      category: row.category || "",
      refSn: row.sn ?? null,
    });
  };

  const t = draftTotals(draft);

  const options = (src) =>
    src.map((r) => (
      <option key={String(r.sn ?? r.description)} value={String(r.sn ?? r.description)}>
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
          max="60"
          step="0.5"
          value={draft.overhead}
          onChange={(e) => set({ overhead: e.target.value })}
          placeholder={`Default: ${CUSTOM_DEFAULT_OVERHEAD}`}
        />
      </label>

      <label>
        <span>
          Profit <em>%</em>
        </span>
        <input
          type="number"
          min="0"
          max="60"
          step="0.5"
          value={draft.profit}
          onChange={(e) => set({ profit: e.target.value })}
          placeholder={`Default: ${CUSTOM_DEFAULT_PROFIT}`}
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
        return (
          <div className="w grp" key={g.kind}>
            <b>{g.label}</b>
            <em>
              {g.qtyNote} {draft.unit || "unit"}
            </em>

            {rows.map((l) => (
              <div className="rg-ln" key={l.index}>
                {src.length ? (
                  <select
                    value={String(l.refSn ?? l.name)}
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
                <em>{l.unit || (g.kind === "plant" ? "h" : "")}</em>
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

            {/* Plant has no catalogue behind it yet, so a plant line carries a
                typed name and an hourly price of the user's own. */}
            {g.kind === "plant"
              ? rows.map((l) => (
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
