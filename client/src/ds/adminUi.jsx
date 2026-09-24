// The shared pieces of his register screens.
//
// His note, and the reason this file exists at all: "Five of the screens in
// Commerce and Accounts are the same thing with different columns: a
// filterable table of objects, each row leading to a record. Writing that five
// times would guarantee five slightly different tables, so it is written once
// here."
//
// Same bargain in React. People, Organisations, Subscriptions, Invoices,
// Entitlements, Quotations and Coupons are one table with different columns,
// and a column definition is data — `{ h, w, num, cell }` exactly as his is,
// so porting the next screen is writing its columns rather than its markup.
//
// His markup: .adm-tw / .adm-table with .num columns, .adm-two for a name over
// its identifier, .adm-chip with a tone, .adm-tab/.adm-tab-n for the filter
// row, .adm-none for the empty state.

import React from "react";
import { useNavigate } from "react-router-dom";

export function AdmChip({ tone, children }) {
  return <span className={`adm-chip${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

/** Two lines in one cell — a name over the thing that identifies it. His. */
export function AdmTwo({ top, under }) {
  return (
    <span className="adm-two">
      <b>{top}</b>
      {under ? <span>{under}</span> : null}
    </span>
  );
}

/** Dimmed text for a cell that is genuinely empty rather than unknown. */
export function AdmDim({ children }) {
  return <span className="adm-dim">{children}</span>;
}

/** A row of filter buttons above a table. `options` is [value, label, count]. */
export function AdmFilters({ options, current, onPick }) {
  return (
    <div className="adm-tabs" role="tablist">
      {options.map(([value, label, count]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={current === value}
          className={`adm-tab${current === value ? " on" : ""}`}
          onClick={() => onPick(value)}
        >
          <span>{label}</span>
          {count == null ? null : <em className="adm-tab-n">{count}</em>}
        </button>
      ))}
    </div>
  );
}

/**
 * The table.
 *
 * @param cols  [{ h, w, num, cell(row) }] — `cell` returns a node or a string
 * @param rows  the data
 * @param empty [heading, explanation] for the first-run state
 * @param href  (row) => path — a row navigates
 * @param onRow (row) => void  — a row opens beside you instead
 *
 * His preference, kept: "Most registers want the second — you are working
 * through a list and being thrown out of it to look at one row loses your
 * place." A click inside a button or link in a cell is left alone, so a row
 * action never fights the row itself.
 */
export function AdmTable({ cols, rows, empty, href, onRow, rowKey }) {
  const nav = useNavigate();
  const clickable = Boolean(href || onRow);

  const act = (r) => {
    if (onRow) onRow(r);
    else if (href) nav(href(r));
  };

  return (
    <div className="adm-tw">
      <table className="adm-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.h} className={c.num ? "num" : undefined} style={c.w ? { width: c.w } : undefined}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={cols.length}>
                <div className="adm-none">
                  <b>{empty?.[0] || "Nothing here"}</b>
                  <span>{empty?.[1] || ""}</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={rowKey ? rowKey(r) : r.id || i}
                className={clickable ? "go" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable
                    ? (e) => {
                        if (e.target.closest("button,a,input,label")) return;
                        act(r);
                      }
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter") act(r);
                      }
                    : undefined
                }
              >
                {cols.map((c) => (
                  <td key={c.h} className={c.num ? "num" : undefined}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
