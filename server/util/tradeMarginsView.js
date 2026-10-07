// The trade-margin table as a screen reads it: every canonical trade, the
// customer's own figures, ADLM's master figures, and what a new rate of each
// scope would actually be given. Shared by the customer and the admin routes
// so the two screens cannot disagree about what a default resolves to.

import { SECTION_LABELS, ALLOWED_SECTION_KEYS } from "./rategenSections.js";
import { BUILTIN_MARGINS, marginMap, resolveMargins } from "./tradeMargins.js";

export function tradeMarginsView(yourRows = [], masterRows = []) {
  const yours = marginMap(yourRows);
  const adlm = marginMap(masterRows);
  const pair = (row) => ({
    overheadPercent: row?.overheadPercent ?? null,
    profitPercent: row?.profitPercent ?? null,
  });
  const trades = [...ALLOWED_SECTION_KEYS].map((sectionKey) => ({
    sectionKey,
    sectionLabel: SECTION_LABELS[sectionKey] || sectionKey,
    yours: pair(yours.get(sectionKey)),
    adlm: pair(adlm.get(sectionKey)),
    // What a new custom rate in this trade is given when its boxes are left
    // blank, and what a new master rate is given. Sources say which table won.
    custom: resolveMargins({ scope: "custom", sectionKey, yourTrades: yours }),
    master: resolveMargins({ scope: "master", sectionKey, adlmTrades: adlm }),
  }));
  return { trades, builtin: BUILTIN_MARGINS };
}
