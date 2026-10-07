import { test } from "node:test";
import assert from "node:assert/strict";
import * as catalogue from "./emailCatalogue.js";
import { PREVIEW } from "./emailContent.js";

// The Emails screen lists the catalogue and renders PREVIEW[key] for each row.
// An entry with no preview shows as a message nobody can read before it goes
// out, which is the opposite of what that screen is for — and it fails quietly,
// as a blank panel rather than an error.

const list = (() => {
  const named = Object.values(catalogue).find(
    (v) => Array.isArray(v) && v.length && v[0]?.key,
  );
  assert.ok(named, "the catalogue exports an array of entries");
  return named;
})();

test("every EDITABLE message can be previewed before it is sent", () => {
  const missing = list.filter((e) => e.editable && !PREVIEW[e.key]).map((e) => e.key);
  assert.deepEqual(missing, [], `no preview for: ${missing.join(", ")}`);
});

test("a message with no preview says why in the catalogue", () => {
  // video.published is the one, and deliberately: it is built per video from
  // its own title and thumbnail, so there is nothing fixed to show.
  for (const e of list) {
    if (PREVIEW[e.key]) continue;
    assert.equal(e.editable, false, `${e.key} has no preview but is marked editable`);
    assert.ok(String(e.why || "").trim(), `${e.key} has no preview and no reason given`);
  }
});

test("every preview actually renders a subject and a body", () => {
  // A preview that throws is worse than none: the screen shows an error where a
  // customer's mail should be.
  for (const [key, make] of Object.entries(PREVIEW)) {
    const out = make();
    assert.ok(String(out?.subject || "").trim(), `${key} has no subject`);
    assert.ok(String(out?.html || "").includes("<"), `${key} has no html body`);
  }
});

test("every catalogue entry names the file that sends it", () => {
  // The whole point of the catalogue: read the wording without opening fourteen
  // route files, and know which one to change.
  for (const e of list) {
    assert.ok(String(e.key || "").trim(), "an entry with no key");
    assert.ok(String(e.name || "").trim(), `${e.key} has no name`);
    assert.ok(String(e.when || "").trim(), `${e.key} does not say when it is sent`);
    assert.ok(String(e.file || "").trim(), `${e.key} does not say where it is sent from`);
  }
});

test("keys are unique", () => {
  const keys = list.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, "two entries share a key");
});
