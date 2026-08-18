// The "From" row of his compare table, priced from the catalogue.
//
// His compare table ends with a row of monthly prices — the same six figures
// the plan cards above already state. Stating a price twice on one page is how
// the two come to disagree, so both now read from the same source.
//
// Markup is his: .rowhead with its <small> descender, .ct-c cells, .ct-price
// with a <small> unit.

import React from "react";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

// His column order.
const COLUMNS = ["revit", "planswift", "rategen", "mep", "qs-takeoff", "civil3d"];

export default function DsCompareRow({ prices }) {
  return (
    <tr>
      <th className="rowhead" scope="row">
        From
        <small>Per PC, monthly</small>
      </th>
      {COLUMNS.map((key) => {
        const n = Number(prices?.[key]?.mo) || 0;
        return (
          <td className="ct-c" key={key}>
            {n > 0 ? (
              <span className="ct-price">
                {NGN.format(n)}
                <small>/mo</small>
              </span>
            ) : (
              <span className="ct-no" />
            )}
          </td>
        );
      })}
    </tr>
  );
}
