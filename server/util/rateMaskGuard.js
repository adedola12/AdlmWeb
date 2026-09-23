// ── Money is not writable while rates are masked ────────────────────────────
//
// A collaborator without an active RateGen subscription reads every project
// with its rates and amounts zeroed — maskRates() in routes/projects.js, which
// also stamps `_ratesMasked: true` on the payload. The web editor initialises
// its state from exactly that payload and sends the whole thing back on save,
// so a save made for an unrelated reason (a progress tick, a re-measured
// quantity, a note) would otherwise write those zeros straight over the
// owner's pricing and empty the bill.
//
// Two rules are enforced here, and they answer the same question — what can
// somebody change when they cannot see what anything is worth?
//
//  1. MONEY COMES FROM STORAGE. Every money field is taken from what the
//     project already holds, matched line by line. A line with no stored
//     counterpart is new, and a masked caller may not price it, so its money is
//     zeroed rather than trusted.
//
//  2. NO STORED ROW IS REMOVED. Deleting a line, a provisional sum or a
//     variation destroys the money on it just as surely as zeroing the rate
//     would, and a masked caller cannot see what it is destroying. Any row the
//     payload does not account for is put back where it was. Rows can still be
//     ADDED and EDITED, so the workflow this whole feature exists for — a site
//     engineer with no RateGen marking progress — is untouched.
//
// Together: a masked save can change anything except what the project is worth
// and what it consists of. Removing a row stays the owner's decision (or that
// of a collaborator who holds RateGen and can see the consequence).
//
// Callers apply this ONLY when access.canSeeRates is false. Owners never reach
// it, and the desktop plugins (QUIV, HERON, RateGen, ArchiCAD) authenticate as
// the owner, so those routes accept and return exactly what they did before.
//
// Pure: no DB, no mongoose. `stored` may be a mongoose document, a .lean()
// object, or the resolved view of a federated merge container.

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toPlain(row) {
  if (!row || typeof row !== "object") return {};
  return typeof row.toObject === "function" ? row.toObject() : { ...row };
}

/**
 * Identity of a bill / material line. Deliberately built only from fields the
 * masking leaves alone, so a masked payload still matches what is stored.
 * Shared with the contract-lock enforcement in routes/projects.js so the two
 * agree on what "the same line" means.
 */
export function itemIdentity(item, index) {
  const sn = num(item?.sn) || index + 1;
  const parts = [
    sn,
    text(item?.code),
    text(item?.description),
    text(item?.takeoffLine),
    text(item?.materialName),
    text(item?.unit),
  ];
  return parts.join("::");
}

function budgetIdentity(b, index) {
  const sn = num(b?.sn) || index + 1;
  return [
    sn,
    text(b?.billIdentity || b?.sourceTakeoffCode),
    text(b?.componentKind),
    text(b?.materialName),
    text(b?.description),
    text(b?.unit),
  ].join("::");
}

// Weaker keys, tried when the strong identity misses. They exist so that
// editing a line's wording — which a full collaborator is entitled to do —
// does not cost that line its rate. Only non-empty keys ever pair up.
function itemFallbackKey(item) {
  return text(item?.code);
}

function budgetFallbackKey(b) {
  const id = text(b?.billIdentity || b?.sourceTakeoffCode);
  if (!id) return "";
  return [id, text(b?.componentKind), text(b?.materialName)].join("::");
}

const ITEM_MONEY = {
  // The empty value each field takes when a line has no stored counterpart.
  // These mirror what sanitizeItems() would store for a missing field, so a
  // guarded payload is indistinguishable from an honestly unpriced one.
  rate: 0,
  actualRate: null,
  netUnitCost: null,
  overheadPercent: null,
  profitPercent: null,
};

// Every money-carrying array a project write can contain, with the fields
// maskRates() blanks on each. Keep this in step with maskRates().
const FIELDS = {
  items: {
    identity: itemIdentity,
    fallback: itemFallbackKey,
    money: ITEM_MONEY,
  },
  materialItems: {
    identity: itemIdentity,
    fallback: itemFallbackKey,
    money: ITEM_MONEY,
  },
  budgetItems: {
    identity: budgetIdentity,
    fallback: budgetFallbackKey,
    money: {
      rate: 0,
      netUnitCost: 0,
      overheadPercent: 0,
      profitPercent: 0,
      budgetRate: 0,
    },
  },
  provisionalSums: {
    identity: (p) => text(p?.description),
    money: { amount: 0 },
  },
  variations: {
    identity: (v) => [text(v?.description), text(v?.unit), text(v?.reference)].join("::"),
    money: { rate: 0 },
  },
  preliminaryItems: {
    identity: (p) => text(p?.name),
    money: { actualAmount: 0 },
  },
};

export const MONEY_FIELDS = Object.fromEntries(
  Object.entries(FIELDS).map(([field, spec]) => [field, Object.keys(spec.money)]),
);

function push(map, key, index) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(index);
}

function restoreField(incoming, stored, spec) {
  const rows = Array.isArray(stored) ? stored : [];
  const byIdentity = new Map();
  const byFallback = new Map();
  const taken = new Set();

  rows.forEach((row, i) => {
    push(byIdentity, spec.identity(row, i), i);
    if (spec.fallback) {
      const key = spec.fallback(row, i);
      if (key) push(byFallback, key, i);
    }
  });

  // Duplicate identities pair up in order rather than all collapsing onto the
  // first stored row, and a row is only ever spent once.
  const take = (map, key) => {
    if (!key && key !== 0) return -1;
    const bucket = map.get(key);
    while (bucket && bucket.length) {
      const at = bucket.shift();
      if (!taken.has(at)) {
        taken.add(at);
        return at;
      }
    }
    return -1;
  };

  const out = incoming.map((row, i) => {
    let at = take(byIdentity, spec.identity(row, i));
    if (at < 0 && spec.fallback) at = take(byFallback, spec.fallback(row, i));
    const match = at >= 0 ? rows[at] : null;

    const next = { ...row };
    for (const [field, empty] of Object.entries(spec.money)) {
      const value = match ? match[field] : undefined;
      next[field] = value === undefined ? empty : value;
    }
    return next;
  });

  // Rule 2. Anything the payload did not account for goes back where it was.
  // Walking the stored rows in order and splicing each one at the index it
  // held puts a row removed from the middle of a bill back in the middle of
  // the bill, rather than orphaning it at the end.
  //
  // A row whose wording was edited past both keys lands here too: the stored
  // row returns priced, and the caller's version is kept alongside it as a new,
  // unpriced row. That shows up as a visible duplicate the owner can clear —
  // the safe failure, since it changes no total and loses nothing.
  let restored = 0;
  rows.forEach((row, i) => {
    if (taken.has(i)) return;
    out.splice(Math.min(i, out.length), 0, toPlain(row));
    restored += 1;
  });

  return { rows: out, restored };
}

/**
 * Rewrite a project write so it cannot move money or drop a row.
 *
 * Arrays the payload does not mention are left out of the result untouched, so
 * partial updates stay partial.
 *
 * @param {object} stored  the project as it is held today (document, lean
 *                         object, or a resolved merge container view)
 * @param {object} body    the incoming request body
 * @returns {{ body: object, restored: Record<string, number> }}
 *          `body` is a new object — the caller's is never mutated. `restored`
 *          counts the rows put back per field, so the route can tell the user
 *          their deletion did not stick instead of silently undoing it.
 */
export function guardMaskedWrite(stored, body = {}) {
  const out = { ...body };
  const restored = {};
  for (const [field, spec] of Object.entries(FIELDS)) {
    if (!Array.isArray(body[field])) continue;
    const result = restoreField(body[field], stored?.[field], spec);
    out[field] = result.rows;
    if (result.restored > 0) restored[field] = result.restored;
  }
  return { body: out, restored };
}
