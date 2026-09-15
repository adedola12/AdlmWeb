// server/models/demoTenancy.js
// Demo tenancy — the mechanism that lets a designer press every button in the
// admin area without any of it touching the business.
//
// HOW IT WORKS
// Every tenanted collection gains an `isDemo` flag. A demo session reads and
// writes only `isDemo: true` rows; everyone else reads and writes only the
// rest. Because the split happens inside Mongoose rather than in the routes,
// every existing handler keeps working untouched: the same POST that creates a
// real training creates a demo training when a demo session sends it, and the
// same DELETE removes a demo row and can never match a real one.
//
// This replaces the earlier read-only-plus-masking approach. Masking was wrong
// for the goal: a masked row cannot be edited, because the save would have
// nowhere to land, and any edit that did land would be re-masked on the way
// back out and look like it had failed to save.
//
// IMPORT ORDER MATTERS
// mongoose.plugin() only reaches schemas compiled AFTER it runs, so this module
// must be imported before any model. index.js imports it first, ahead of even
// dotenv. assertTenancyApplied() below turns a mistake here into a loud boot
// failure rather than a silent leak of real data into a demo session.
import mongoose from "mongoose";
import { isDemoContext } from "../util/demoContext.js";

// Opting out is done on the schema itself — `new Schema({...}, { demoTenancy:
// false })` — not by a list of names here. Mongoose does NOT pass a model name
// to a global plugin (verified: a global plugin receives only the options given
// at registration), so a name-based denylist would silently never match and
// would tenant the very collections that must not be. Role, RoleAudit, Setting,
// StepUpOtp and AuditLog carry the opt-out; scoping any of them would leave a
// demo session unable to resolve its own role.
const isOptedOut = (schema) => schema.options?.demoTenancy === false;

// Queries whose filter we scope. `estimatedDocumentCount` is deliberately
// absent: it takes no filter by design and throws if given one.
const SCOPED_QUERIES = [
  "count",
  "countDocuments",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "update",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
];

// Writes that must stamp the tenant so the row is readable back by its creator.
const SCOPED_UPDATES = [
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "update",
  "updateOne",
  "updateMany",
];

export function demoTenancyPlugin(schema) {
  if (isOptedOut(schema)) return;

  schema.add({
    // No default, deliberately. Mongoose applies global plugins to nested child
    // schemas too, and a default would write `isDemo: false` into every real
    // document and every subdocument in the database. Without one the field
    // only ever appears on rows a demo session created, and the `$ne: true`
    // filter below still matches every real row precisely because it is absent.
    //
    // Not indexed either: the predicate is unselective (almost every row is
    // real), so an index buys nothing and adding one to 50-odd live collections
    // is a migration nobody asked for.
    isDemo: { type: Boolean },
  });

  schema.pre(SCOPED_QUERIES, function scopeQueryToTenant() {
    // `$ne: true` rather than `false` so the millions of rows written before
    // this field existed — which carry no isDemo at all — stay visible.
    this.where({ isDemo: isDemoContext() ? true : { $ne: true } });
  });

  schema.pre(SCOPED_UPDATES, function stampTenantOnUpsert() {
    if (!isDemoContext()) return;
    // An upsert that matches nothing inserts a new row; without this the row
    // would be created untenanted and immediately vanish from the demo view.
    this.setUpdate({ ...this.getUpdate(), $set: { ...(this.getUpdate()?.$set || {}), isDemo: true } });
  });

  schema.pre("aggregate", function scopeAggregateToTenant() {
    // Aggregation bypasses query middleware entirely, so the tenant filter has
    // to be pushed in as the first stage. There are ~38 aggregate calls in this
    // codebase; every one of them is covered by this hook.
    this.pipeline().unshift({
      $match: { isDemo: isDemoContext() ? true : { $ne: true } },
    });
  });

  schema.pre("save", function stampTenantOnSave() {
    if (this.isNew && isDemoContext()) this.isDemo = true;
  });

  schema.pre("insertMany", function stampTenantOnInsertMany(next, docs) {
    if (isDemoContext() && Array.isArray(docs)) {
      for (const doc of docs) doc.isDemo = true;
    }
    next();
  });
}

/** Register the plugin globally. Must run before any model is compiled. */
export function registerDemoTenancy() {
  mongoose.plugin(demoTenancyPlugin);
}

/**
 * Refuse to boot if a model was compiled before the plugin registered.
 *
 * The failure this guards against is the dangerous one: a model that missed the
 * plugin has no tenant filter, so a demo session would read and write its REAL
 * rows. That is silent and looks like everything is working. Crashing at boot
 * with the offending model named is strictly better.
 */
export function assertTenancyApplied() {
  const missing = Object.entries(mongoose.models)
    .filter(([, model]) => !isOptedOut(model.schema))
    .filter(([, model]) => !model.schema.path("isDemo"))
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `[demoTenancy] compiled before the plugin registered: ${missing.join(", ")}. ` +
        `Import server/models/demoTenancy.js before any model, or these collections ` +
        `will serve real data to demo sessions.`,
    );
  }
}

export const __testing = { isOptedOut, SCOPED_QUERIES, SCOPED_UPDATES };
