// server/util/prospecting/memoryModels.js
//
// An in-memory stand-in for the four prospecting models, covering only the
// query shapes store.js uses. Two users: the tests, and the finder's dry run
// (scripts/prospect-finder.mjs without --apply), which must be able to show a
// whole run without writing to Atlas, since local dev shares the production
// cluster.
//
// Enforces the same unique keys as the real indexes (domain, email, the
// suppression hash or domain), and throws Mongo's duplicate-key shape, so the
// race handling in store.js is exercised for real.

let nextId = 1;
const newId = () => `mem${nextId++}`;

function matches(doc, q) {
  return Object.entries(q || {}).every(([k, v]) => {
    if (k === "$or") return v.some((sub) => matches(doc, sub));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("$in" in v) return v.$in.map(String).includes(String(doc[k]));
      if ("$ne" in v) return String(doc[k]) !== String(v.$ne);
    }
    return String(doc[k]) === String(v);
  });
}

function query(rowsFn) {
  let limit = Infinity;
  let sortSpec = null;
  const api = {
    select: () => api,
    sort: (s) => { sortSpec = s; return api; },
    limit: (n) => { limit = n; return api; },
    lean: async () => {
      let out = rowsFn();
      if (Array.isArray(out)) {
        if (sortSpec) {
          const [[key, dir]] = Object.entries(sortSpec);
          out = [...out].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
        }
        out = out.slice(0, limit);
      }
      return out;
    },
  };
  return api;
}

export function memoryModel(uniqueKey) {
  const rows = [];
  const clash = (d) => {
    if (!uniqueKey) return false;
    const k = uniqueKey(d);
    return k !== undefined && rows.some((r) => uniqueKey(r) === k);
  };
  const apply = (row, update) => {
    Object.assign(row, update.$set || {});
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
    exists: async (q) => (rows.some((r) => matches(r, q)) ? { _id: "x" } : null),
    countDocuments: async (q) => rows.filter((r) => matches(r, q)).length,
    async insertMany(docs) {
      const inserted = [];
      const writeErrors = [];
      for (const d of docs) {
        if (clash(d)) { writeErrors.push({ code: 11000 }); continue; }
        const row = { _id: newId(), createdAt: new Date(), ...d };
        rows.push(row);
        inserted.push(row);
      }
      if (writeErrors.length) throw Object.assign(new Error("E11000 duplicate key"), { writeErrors, insertedDocs: inserted });
      return inserted;
    },
    updateOne: async (filter, update, opts = {}) => {
      if (opts.upsert) return upsert(filter, update);
      const hit = rows.find((r) => matches(r, filter));
      if (hit) apply(hit, update);
    },
    updateMany: async (filter, update) => {
      for (const r of rows.filter((x) => matches(x, filter))) apply(r, update);
    },
    bulkWrite: async (ops) => { for (const op of ops) upsert(op.updateOne.filter, op.updateOne.update); },
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
