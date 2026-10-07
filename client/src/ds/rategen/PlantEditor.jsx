// A machine, costed per day from its parts, in one card.
//
// The same card serves ADLM's library (admin) and a customer's own machine or
// own version of one of ADLM's. What it edits is only ever the parts, the
// working day and the name: the hourly rate is worked out, never typed, so it
// cannot disagree with the parts that make it.
//
// His markup, as the custom rate builder uses it: .rg-build with .w for
// full-width fields, .grp for the group of parts, .rg-ln per part and .tot for
// the live figure strip. The design of the Plant item page is Richard's to
// draw (work board r2-plant-library-per-hour); this is the working version on
// the pieces that already exist.

import React from "react";
import { FaTimes } from "../../components/icons.jsx";
import { PART_KINDS, plantDraft, plantFigures } from "./plantMath.js";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export default function PlantEditor({ draftRef, initial }) {
  const [d, setD] = React.useState(() => plantDraft(initial));
  draftRef.current = d;

  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setPart = (i, patch) =>
    setD((x) => ({ ...x, parts: x.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addPart = () =>
    setD((x) => ({
      ...x,
      parts: [...x.parts, { kind: "other", description: "", quantity: 1, unit: "day", unitPrice: "" }],
    }));
  const removePart = (i) => setD((x) => ({ ...x, parts: x.parts.filter((_, j) => j !== i) }));

  const f = plantFigures(d);

  return (
    <div className="rg-build">
      <label className="w">
        <span>Machine</span>
        <input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Concrete mixer (1-bag)"
        />
      </label>
      <label>
        <span>Category</span>
        <input
          value={d.category}
          onChange={(e) => set({ category: e.target.value })}
          placeholder="e.g. Concrete plant"
        />
      </label>
      <label>
        <span>
          Working hours <em>per day</em>
        </span>
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          value={d.hoursPerDay}
          onChange={(e) => set({ hoursPerDay: e.target.value })}
        />
      </label>

      <div className="w grp">
        <b>What a day of it costs</b>
        <em>quantity × price, for one working day</em>
        {d.parts.map((p, i) => (
          <div className="rg-ln" key={i}>
            <select
              value={p.kind}
              onChange={(e) => setPart(i, { kind: e.target.value })}
              aria-label="Kind of part"
            >
              {PART_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              value={p.description}
              onChange={(e) => setPart(i, { description: e.target.value })}
              placeholder="e.g. Diesel"
              aria-label="What it is"
            />
            <input
              type="number"
              min="0"
              step="any"
              value={p.quantity}
              onChange={(e) => setPart(i, { quantity: e.target.value })}
              aria-label="Quantity per day"
            />
            <input
              value={p.unit}
              onChange={(e) => setPart(i, { unit: e.target.value })}
              placeholder="unit"
              aria-label="Unit"
            />
            <input
              type="number"
              min="0"
              step="any"
              value={p.unitPrice}
              onChange={(e) => setPart(i, { unitPrice: e.target.value })}
              placeholder="₦"
              aria-label="Price"
            />
            <button
              type="button"
              className="x"
              onClick={() => removePart(i)}
              aria-label={`Remove ${p.description || "part"}`}
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className="pj-lnk" onClick={addPart}>
          + Add a part
        </button>
      </div>

      <label className="w">
        <span>Notes</span>
        <textarea
          rows={2}
          value={d.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Where the prices came from, and when"
        />
      </label>

      <div className="w tot">
        <span>
          Day cost {money(f.dayCost)}
          {f.hoursPerDay ? ` over ${f.hoursPerDay} hours` : ""}
          {f.problems.length ? ` · ${f.problems[0]}` : ""}
        </span>
        <b>
          {f.hourlyRate === null ? "Not priced" : money(f.hourlyRate)} <small>per hr</small>
        </b>
      </div>
    </div>
  );
}
