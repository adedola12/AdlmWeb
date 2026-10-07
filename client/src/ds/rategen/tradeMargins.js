// The trade-margin table as the editor holds it, and back again.
//
// Kept apart from the card so the rows and the payload can be tested without
// mounting React. The server re-checks everything (util/tradeMargins.js
// cleanMarginRows); this only stops a bad figure before a round trip.

const BUILTIN = {
  custom: { overheadPercent: 10, profitPercent: 10 },
  master: { overheadPercent: 10, profitPercent: 25 },
};

/** Editable rows from the server's `trades` array, for one scope's own table. */
export function marginRowsFrom(trades = [], scope = "custom") {
  const own = scope === "master" ? "adlm" : "yours";
  return (Array.isArray(trades) ? trades : []).map((t) => ({
    sectionKey: t.sectionKey,
    sectionLabel: t.sectionLabel || t.sectionKey,
    overheadPercent: t[own]?.overheadPercent ?? "",
    profitPercent: t[own]?.profitPercent ?? "",
    builtin: BUILTIN[scope] || BUILTIN.custom,
    adlm: t.adlm || null,
  }));
}

/** The rows as PUT .../trade-margins wants them, or the first problem in words. */
export function marginRowsPayload(rows = []) {
  const blank = (v) => v === "" || v === null || v === undefined || String(v).trim() === "";
  for (const r of rows) {
    for (const [label, v] of [
      ["Overhead", r.overheadPercent],
      ["Profit", r.profitPercent],
    ]) {
      if (blank(v)) continue;
      const n = Number(String(v).replace(/,/g, ""));
      if (!Number.isFinite(n)) return { problem: `${r.sectionLabel}: ${label} has to be a number` };
      if (n < 0) return { problem: `${r.sectionLabel}: ${label} cannot be less than 0%` };
    }
  }
  return {
    problem: null,
    rows: rows
      .map((r) => ({
        sectionKey: r.sectionKey,
        overheadPercent: blank(r.overheadPercent) ? null : Number(r.overheadPercent),
        profitPercent: blank(r.profitPercent) ? null : Number(r.profitPercent),
      }))
      // both blank = back to the default, which the server stores as no row
      .filter((r) => r.overheadPercent !== null || r.profitPercent !== null),
  };
}
