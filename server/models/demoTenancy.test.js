// server/models/demoTenancy.test.js
// Exercises the plugin against real mongoose Schema objects without a database:
// the hooks are registered, then invoked with a stub `this` that records what
// the plugin did to the query. That covers the part that matters — which filter
// a demo session ends up running — with no Atlas round trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { demoTenancyPlugin } from "./demoTenancy.js";
import { runAsDemo, runWithoutDemo, isDemoContext } from "../util/demoContext.js";

// Build a schema with the plugin applied and pull a named hook back out.
// Some events carry more than one hook — findOneAndUpdate is both scoped and
// stamped — so the hook is selected by function name, not by position.
function hookFor(event, { schemaOptions = {}, fnName } = {}) {
  const schema = new mongoose.Schema({ title: String }, schemaOptions);
  demoTenancyPlugin(schema);
  const hooks = schema.s.hooks._pres.get(event) || [];
  const entry = fnName
    ? hooks.find((h) => h.fn?.name === fnName)
    : hooks.find((h) => typeof h.fn === "function");
  assert.ok(entry, `no ${fnName || "pre"} hook registered for ${event}`);
  return { schema, fn: entry.fn };
}

test("the plugin adds the tenant flag", () => {
  const { schema } = hookFor("find");
  assert.ok(schema.path("isDemo"), "isDemo should be on the schema");
});

test("a schema opting out is left completely alone", () => {
  const schema = new mongoose.Schema({ key: String }, { demoTenancy: false });
  demoTenancyPlugin(schema);
  assert.equal(schema.path("isDemo"), undefined);
  assert.equal(schema.s.hooks._pres.get("find"), undefined);
});

test("the tenant flag carries no default", () => {
  // A default would write isDemo:false into every real document AND every
  // nested subdocument, since mongoose applies global plugins to child schemas.
  // Absent-means-real is what keeps this migration-free.
  const { schema } = hookFor("find");
  assert.equal(schema.path("isDemo").defaultValue, undefined);
});

test("a normal session is scoped away from demo rows", () => {
  const { fn } = hookFor("find");
  const applied = [];
  fn.call({ where: (w) => applied.push(w) });
  assert.deepEqual(applied, [{ isDemo: { $ne: true } }]);
});

test("a demo session is scoped to demo rows only", () => {
  const { fn } = hookFor("find");
  const applied = [];
  runAsDemo(() => fn.call({ where: (w) => applied.push(w) }));
  assert.deepEqual(applied, [{ isDemo: true }]);
});

test("$ne:true is used so pre-existing rows stay visible", () => {
  // Every row written before this feature has no isDemo field at all. `false`
  // would hide the entire production database from every real admin.
  const { fn } = hookFor("findOne");
  const applied = [];
  fn.call({ where: (w) => applied.push(w) });
  assert.notDeepEqual(applied[0], { isDemo: false });
  assert.deepEqual(applied[0], { isDemo: { $ne: true } });
});

test("deletes are scoped too, so a demo delete cannot match a real row", () => {
  const { fn } = hookFor("deleteMany");
  const applied = [];
  runAsDemo(() => fn.call({ where: (w) => applied.push(w) }));
  assert.deepEqual(applied, [{ isDemo: true }]);
});

test("aggregation gets a tenant $match pushed in front", () => {
  const { fn } = hookFor("aggregate");
  const pipeline = [{ $group: { _id: "$role" } }];
  runAsDemo(() => fn.call({ pipeline: () => pipeline }));
  assert.deepEqual(pipeline[0], { $match: { isDemo: true } });
  assert.deepEqual(pipeline[1], { $group: { _id: "$role" } });
});

test("aggregation for a normal session excludes demo rows", () => {
  const { fn } = hookFor("aggregate");
  const pipeline = [{ $group: { _id: "$role" } }];
  fn.call({ pipeline: () => pipeline });
  assert.deepEqual(pipeline[0], { $match: { isDemo: { $ne: true } } });
});

test("a new document saved in a demo session is stamped", () => {
  const { fn } = hookFor("save");
  const doc = { isNew: true, isDemo: false };
  runAsDemo(() => fn.call(doc));
  assert.equal(doc.isDemo, true);
});

test("a document saved normally is not stamped", () => {
  const { fn } = hookFor("save");
  const doc = { isNew: true, isDemo: false };
  fn.call(doc);
  assert.equal(doc.isDemo, false);
});

test("an existing real row is never re-stamped by a demo save", () => {
  // Guards the case where a demo session somehow loads a real document: only
  // brand-new documents get the flag, so this cannot silently annex a real row.
  const { fn } = hookFor("save");
  const doc = { isNew: false, isDemo: false };
  runAsDemo(() => fn.call(doc));
  assert.equal(doc.isDemo, false);
});

test("an upsert in a demo session stamps the row it may insert", () => {
  const { fn } = hookFor("findOneAndUpdate", { fnName: "stampTenantOnUpsert" });
  let update = { $set: { title: "x" } };
  runAsDemo(() =>
    fn.call({ getUpdate: () => update, setUpdate: (u) => { update = u; } }),
  );
  assert.equal(update.$set.isDemo, true);
  assert.equal(update.$set.title, "x", "existing $set fields must survive");
});

test("findOneAndUpdate is scoped as well as stamped", () => {
  // Both hooks matter: the stamp makes an upsert land in the demo tenant, and
  // the scope stops the update from ever matching a real row.
  const { fn } = hookFor("findOneAndUpdate", { fnName: "scopeQueryToTenant" });
  const applied = [];
  runAsDemo(() => fn.call({ where: (w) => applied.push(w) }));
  assert.deepEqual(applied, [{ isDemo: true }]);
});

test("insertMany stamps every document in a demo session", () => {
  const { fn } = hookFor("insertMany");
  const docs = [{ a: 1 }, { a: 2 }];
  runAsDemo(() => fn.call(null, () => {}, docs));
  assert.ok(docs.every((d) => d.isDemo === true));
});

test("demo context does not leak out of its callback", () => {
  runAsDemo(() => assert.equal(isDemoContext(), true));
  assert.equal(isDemoContext(), false);
});

test("runWithoutDemo suspends scoping for the auth path", () => {
  // requirePermission reads the caller's OWN user row, which is real even when
  // their role is a demo one. Without this they could not resolve their role.
  runAsDemo(() => {
    assert.equal(isDemoContext(), true);
    runWithoutDemo(() => assert.equal(isDemoContext(), false));
    assert.equal(isDemoContext(), true, "scope must be restored afterwards");
  });
});

test("demo context survives an await boundary", async () => {
  await runAsDemo(async () => {
    await new Promise((r) => setImmediate(r));
    assert.equal(isDemoContext(), true);
  });
});

test("the real models are tenanted, and the infrastructure ones are not", async () => {
  // The end-to-end check: register exactly as index.js does, compile the real
  // schemas, and confirm the split landed where it should. This is the test
  // that would have caught the model-name bug — mongoose never passes a model
  // name to a global plugin, so a name-based denylist silently tenants nothing
  // and would have scoped Role, locking every demo session out of its own role.
  const { registerDemoTenancy, assertTenancyApplied } = await import("./demoTenancy.js");
  registerDemoTenancy();

  const { Role } = await import("./Role.js");
  const { Setting } = await import("./Setting.js");
  const { User } = await import("./User.js");

  assert.equal(Role.schema.path("isDemo"), undefined, "Role must not be tenanted");
  assert.equal(Setting.schema.path("isDemo"), undefined, "Setting must not be tenanted");
  assert.ok(User.schema.path("isDemo"), "User must be tenanted");

  assert.doesNotThrow(() => assertTenancyApplied());
});
