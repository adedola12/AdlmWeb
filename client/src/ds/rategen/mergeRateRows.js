// Published rates, the user's corrections to them, and the user's own rates,
// as one list.

/**
 * One list of rates out of three sources.
 *
 * A master rate the user has edited is REPLACED by their own copy rather than
 * shown twice, because two rows with the same name and two different figures
 * is the one thing a rate library must never do. Their own rates are appended.
 * Each row says which it is, so nothing is silently the user's work or
 * silently ours.
 */
export function mergeRateRows(master = [], overrides = [], customs = []) {
  const byId = new Map();
  for (const o of overrides) {
    const key = String(o.rateId || o.id || "");
    if (key) byId.set(key, o);
  }

  const rows = master.map((r) => {
    const own = byId.get(String(r.id));
    if (!own) return { ...r, own: null, href: `/work/rate/${r.id}` };
    return {
      ...r,
      ...own,
      id: r.id,
      sectionLabel: own.sectionLabel || r.sectionLabel,
      own: "edited",
      href: `/work/rate/${r.id}`,
    };
  });

  for (const c of customs) {
    const id = String(c.customRateId || c.id || "");
    rows.push({
      ...c,
      id: `custom:${id}`,
      own: "custom",
      href: `/work/rate/custom:${id}`,
    });
  }

  return rows;
}
