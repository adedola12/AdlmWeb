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
 *
 * THE BUILD-UP DOES NOT SURVIVE THE MERGE (S18 review, finding 3)
 *
 * The spread used to leave the master's `composition` on the row whenever the
 * user's copy carried none of its own — an override saved with a net cost and
 * no lines behind it. The composition card then listed the master's components
 * against the customer's own, different net cost: an itemisation of a price it
 * does not explain, which is worse than showing nothing. A row's build-up is
 * now its own or nothing, and the build-up screen says plainly when a copy has
 * none.
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
      // Only the copy's own lines. `composition` is absent from an override
      // that has no build-up, and an absent key does not overwrite, so it has
      // to be cleared by hand or the master's lines ride along with the
      // customer's figure.
      breakdown: Array.isArray(own.breakdown) ? own.breakdown : [],
      composition: own.composition ?? null,
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
