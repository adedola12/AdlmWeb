// Every valuation setting the schema declares must survive a save.
//
// THE BUG THIS EXISTS TO STOP, AND WHY IT IS A CLASS RATHER THAN A CASE
//
// Saving valuation settings goes through normalizeValuationSettings, and the
// caller assigns its RESULT over the sub-document:
//
//     project.valuationSettings = normalizeValuationSettings(...)
//
// That replaces rather than merges. So a field the function does not list is
// not left alone — it is dropped, and mongoose puts the schema default back.
//
// `rateSyncEnabled` was missing, and the cost was invisible: turning the actual
// columns on, or changing retention, or saving anything else on that screen,
// quietly switched rate sync off for that project. Nothing reported it, and
// whoever eventually noticed would have found it off with no way to know when.
//
// A test for that one field would have been worth little — the next field added
// to the schema would walk into exactly the same trap. So this compares the two
// lists: every field the schema declares, against every key the normaliser
// returns. Add a setting and forget to carry it, and this fails by name.
//
// Read as source rather than imported because normalizeValuationSettings is
// module-private, and the property under test is structural — which keys are
// written down — not behavioural. The repo already tests this way where the
// failure is "somebody edited this and left something out"
// (routes/auth.socialVerified.test.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const MODEL = fs.readFileSync(path.join(here, "..", "models", "TakeoffProject.js"), "utf8");
const ROUTE = fs.readFileSync(path.join(here, "projects.js"), "utf8");

/** The fields ValuationSettingsSchema declares. */
function schemaFields() {
  const at = MODEL.indexOf("const ValuationSettingsSchema = new mongoose.Schema(");
  assert.ok(at > -1, "TakeoffProject.js no longer declares ValuationSettingsSchema");
  // Up to the schema's own closing `  { _id: false },`, so the next schema in
  // the file is not swept in.
  const rest = MODEL.slice(at);
  const end = rest.indexOf("{ _id: false }");
  assert.ok(end > -1, "ValuationSettingsSchema no longer ends with { _id: false }");
  const body = rest.slice(0, end);
  // Direct children only: four spaces of indent inside the schema object.
  return [...body.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9]*): \{$/gm)].map((m) => m[1]).sort();
}

/** The keys normalizeValuationSettings puts in its returned object. */
function normalisedKeys() {
  const at = ROUTE.indexOf("function normalizeValuationSettings(");
  assert.ok(at > -1, "projects.js no longer declares normalizeValuationSettings");
  const rest = ROUTE.slice(at);
  const open = rest.indexOf("return {");
  assert.ok(open > -1, "normalizeValuationSettings no longer returns an object literal");
  const body = rest.slice(open, rest.indexOf("\n}", open));
  // Four spaces: the top level of the returned literal. Nested option objects
  // sit deeper and are not settings.
  return [...body.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]).sort();
}

test("every declared valuation setting is carried through a save", () => {
  const declared = schemaFields();
  const carried = normalisedKeys();

  // Guards against an extractor that silently matches nothing and passes.
  assert.ok(declared.length >= 8, `only found ${declared.length} schema fields; the parser has drifted`);
  assert.ok(carried.length >= 8, `only found ${carried.length} normalised keys; the parser has drifted`);

  const dropped = declared.filter((f) => !carried.includes(f));
  assert.deepEqual(
    dropped,
    [],
    `normalizeValuationSettings does not carry ${dropped.join(", ")}. ` +
      "Its result is assigned OVER project.valuationSettings, so a field it " +
      "omits is reset to the schema default on the next save of ANY setting — " +
      "silently. Add the field to the returned object.",
  );
});

test("rateSyncEnabled in particular, because it is the one that was lost", () => {
  assert.ok(
    normalisedKeys().includes("rateSyncEnabled"),
    "rateSyncEnabled must be carried: without it, turning on the actual columns " +
      "switches rate sync off for that project and says nothing.",
  );
});

test("the normaliser does not invent settings the schema has never heard of", () => {
  // The other direction. A key written here but not declared is stored on a
  // sub-document that does not define it, so it vanishes on the next read and
  // whoever set it is left wondering where it went.
  const declared = schemaFields();
  const extra = normalisedKeys().filter((k) => !declared.includes(k));
  assert.deepEqual(
    extra,
    [],
    `normalizeValuationSettings returns ${extra.join(", ")}, which ValuationSettingsSchema does not declare.`,
  );
});
