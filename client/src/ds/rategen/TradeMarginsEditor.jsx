// Default overhead and profit, per trade, in one card.
//
// A default fills a percentage only where a rate is written without one — a
// blank box in the custom rate builder, a rate copied without its figures. It
// never re-prices a rate already in the library, so saving this moves no
// total on any bill.
//
// The same card serves the customer (their own table, with ADLM's figure for
// the trade shown beside it) and the admin (ADLM's table for master rates).
// His markup: .rg-build and .rg-ln, as the custom rate builder uses. The
// "Default margins by trade" table's final design is Richard's (work board
// r2-overhead-profit-per-trade).

import React from "react";
import { marginRowsFrom } from "./tradeMargins.js";

const pc = (v) => (v === null || v === undefined || v === "" ? "–" : `${v}%`);

/**
 * @param {object} props
 * @param {{current:any}} props.draftRef   receives the editable rows
 * @param {object[]} props.trades          the `trades` array the server sends
 * @param {"custom"|"master"} props.scope  whose table this is
 */
export default function TradeMarginsEditor({ draftRef, trades = [], scope = "custom" }) {
  const [rows, setRows] = React.useState(() => marginRowsFrom(trades, scope));
  draftRef.current = rows;

  const setRow = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const builtin = scope === "master" ? "10 / 25" : "10 / 10";

  return (
    <div className="rg-build">
      <div className="w grp">
        <b>Trade</b>
        <em>overhead % · profit % — leave blank for {builtin}</em>
        {rows.map((r, i) => (
          <div className="rg-ln" key={r.sectionKey}>
            <span>
              {r.sectionLabel}
              {scope === "custom" &&
              (r.adlm?.overheadPercent != null || r.adlm?.profitPercent != null) ? (
                <em>
                  {" "}
                  ADLM: {pc(r.adlm.overheadPercent)} / {pc(r.adlm.profitPercent)}
                </em>
              ) : null}
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={r.overheadPercent}
              placeholder={`Default: ${r.builtin.overheadPercent}`}
              onChange={(e) => setRow(i, { overheadPercent: e.target.value })}
              aria-label={`${r.sectionLabel} overhead percent`}
            />
            <input
              type="number"
              min="0"
              step="0.5"
              value={r.profitPercent}
              placeholder={`Default: ${r.builtin.profitPercent}`}
              onChange={(e) => setRow(i, { profitPercent: e.target.value })}
              aria-label={`${r.sectionLabel} profit percent`}
            />
            <button
              type="button"
              className="pj-lnk"
              onClick={() => setRow(i, { overheadPercent: "", profitPercent: "" })}
              aria-label={`Reset ${r.sectionLabel} to the default`}
            >
              Reset
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
