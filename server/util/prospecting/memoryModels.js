// server/util/prospecting/memoryModels.js
//
// An in-memory stand-in for the prospecting models, covering only the query
// shapes store.js and review.js use. Two users: the tests, and the dry runs
// (scripts/prospect-finder.mjs and draft-writer.mjs without --apply), which
// must be able to show a whole run without writing to Atlas, since local dev
// shares the production cluster.
//
// Enforces the same unique keys as the real indexes (domain, email, the
// suppression hash or domain), and throws Mongo's duplicate-key shape, so the
// race handling in store.js is exercised for real.
//
// Deliberately has no bulkWrite: the demo tenancy plugin does not scope it,
// so prospecting code must never use it, and a test that tries fails here.

let nextId = 1;
const newId = () => `mem${nextId++}`;

const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a) - new Date(b) : a < b ? -1 : a > b ? 1 : 0);

function matchValue(actual, v) {
  if (v instanceof RegExp) return v.test(String(actual ?? ""));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.entries(v).every(([op, x]) => {
      if (op === "$in") return x.map(String).includes(String(actual));
      if (op === "$nin") return !x.map(String).includes(String(actual));
      // Mongo: { $ne: null } also excludes a missing field.
      if (op === "$ne") return x === null ? actual !== null && actual !== undefined : String(actual) !== String(x);
      if (actual === undefined || actual === null) return false;
      if (op === "$gte") return cmp(actual, x) >= 0;
      if (op === "$gt") return cmp(actual, x) > 0;
      if (op === "$lte") return cmp(actual, x) <= 0;
      if (op === "$lt") return cmp(actual, x) < 0;
      throw new Error(`memoryModels: unsupported operator ${op}`);
    });
  }
  return String(actual) === String(v);
}

export function matches(doc, q) {
  return Object.entries(q || {}).every(([k, v]) => {
    if (k === "$or") return v.some((sub) => matches(doc, sub));
    if (k === "$and") return v.every((sub) => matches(doc, sub));
    return matchValue(doc[k], v);
  });
}

function query(rowsFn) {
  let limit = Infinity;
  let skip = 0;
  let sortSpec = null;
  const api = {
    select: () => api,
    sort: (s) => { sortSpec = s; return api; },
    skip: (n) => { skip = n; return api; },
    limit: (n) => { limit = n; return api; },
    lean: async () => {
      let out = rowsFn();
      if (Array.isArray(out)) {
        if (sortSpec) {
          const [[key, dir]] = Object.entries(sortSpec);
          out = [...out].sort((a, b) => dir * cmp(a[key], b[key]));
        }
        out = out.slice(skip, skip + limit);
      }
      return out;
    },
  };
  return api;
}

export function memoryModel(uniqueKey) {
  const rows = [];
  const clash = (d, except = null) => {
    if (!uniqueKey) return false;
    const k = uniqueKey(d);
    return k !== undefined && rows.some((r) => r !== except && uniqueKey(r) === k);
  };
  const apply = (row, update) => {
    Object.assign(row, update.$set || {});
    for (const k of Object.keys(update.$unset || {})) delete row[k];
    row.updatedAt = new Date();
  };
  const upsert = (filter, update) => {
    const hit = rows.find((r) => matches(r, filter));
    if (hit) return apply(hit, update);
    const plain = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith("$") && (typeof v !== "object" || v === null)));
    rows.push({ _id: newId(), createdAt: new Date(), ...plain, ...(update.$setOnInsert || {}), ...(update.$set || {}) });
  };

  return {
    rows,
    find: (q) => query(() => rows.filter((r) => matches(r, q))),
    findOne: (q) => query(() => rows.find((r) => matches(r, q)) || null),
    findById: (id) => query(() => rows.find((r) => String(r._id) === String(id)) || null),
    // Atomic in real Mongo; here the match and the write happen together at
    // lean() time, which is what the conditional status moves rely on.
    findOneAndUpdate: (filter, update) =>
      query(() => {
        const hit = rows.find((r) => matches(r, filter));
        if (!hit) return null;
        apply(hit, update);
        return { ...hit };
      }),
    exists: async (q) => (rows.some((r) => matches(r, q)) ? { _id: "x" } : null),
    countDocuments: async (q) => rows.filter((r) => matches(r, q)).length,
    async insertMany(docs) {
      const inserted = [];
      const writeErrors = [];
      for (const d of docs) {
        if (clash(d)) { writeErrors.push({ code: 11000 }); continue; }
        const row = { createdAt: new Date(), ...d, _id: d._id ?? newId() };
        rows.push(row);
        inserted.push(row);
      }
      if (writeErrors.length) throw Object.assign(new Error("E11000 duplicate key"), { writeErrors, insertedDocs: inserted });
      return inserted;
    },
    async create(doc) {
      const [row] = await this.insertMany([doc]);
      return row;
    },
    updateOne: async (filter, update, opts = {}) => {
      if (opts.upsert) return upsert(filter, update);
      const hit = rows.find((r) => matches(r, filter));
      if (hit) apply(hit, update);
      return { matchedCount: hit ? 1 : 0 };
    },
    updateMany: async (filter, update) => {
      const hits = rows.filter((x) => matches(x, filter));
      for (const r of hits) apply(r, update);
      return { matchedCount: hits.length };
    },
    deleteMany: async (q) => {
      const gone = rows.filter((r) => matches(r, q));
      for (const g of gone) rows.splice(rows.indexOf(g), 1);
      return { deletedCount: gone.length };
    },
    deleteOne: async (q) => {
      const i = rows.findIndex((r) => matches(r, q));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  };
}

/** A fresh, empty set of the prospecting models, with the real unique keys. */
export function memoryModels() {
  return {
    IdealCustomerProfile: memoryModel((r) => r.key),
    Prospect: memoryModel((r) => r.domain),
    ProspectContact: memoryModel((r) => r.email),
    OutreachDraft: memoryModel(),
    Suppression: memoryModel((r) => (r.kind === "email" ? `e:${r.emailHash}` : `d:${r.domain}`)),
  };
}
