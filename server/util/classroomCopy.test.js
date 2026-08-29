// Tests for the Classroom copy rewriter.
//
// These exist because the rewrite runs against live sales copy that nobody
// reviews line by line afterwards. The two failure modes that matter are a
// mangled bullet shipped to a product page, and a Classroom mention silently
// surviving the run. Both are asserted here.
//
// Nothing touches the database — every function under test is pure.

import test from "node:test";
import assert from "node:assert/strict";

import {
  rewriteLine,
  rewriteFeatures,
  rewriteText,
  MENTIONS_CLASSROOM,
} from "./classroomCopy.js";

test("rewrites the parenthetical shape the admin placeholder suggested", () => {
  assert.equal(
    rewriteLine("100% Online (Google Classroom)"),
    "100% Online (self-paced)",
  );
  assert.equal(rewriteLine("100% Online (Classroom)"), "100% Online (self-paced)");
  assert.equal(
    rewriteLine("100% Online (via Google Classroom)"),
    "100% Online (self-paced)",
  );
});

test("rewrites prepositional delivery phrasing", () => {
  assert.equal(
    rewriteLine("Delivered via Google Classroom"),
    "Delivered on the ADLM Studio platform",
  );
  assert.equal(
    rewriteLine("Sessions run on the Google Classroom"),
    "Sessions run on the ADLM Studio platform",
  );
  assert.equal(
    rewriteLine("Everything is posted in Google Classroom"),
    "Everything is posted on the ADLM Studio platform",
  );
});

test("rewrites a bare mention", () => {
  assert.equal(
    rewriteLine("Google Classroom access included"),
    "the ADLM Studio platform access included",
  );
});

test("leaves copy without a mention completely alone", () => {
  const untouched = [
    "6-week structured roadmap",
    "Autodesk Revit (MEP)",
    "Certificate of completion",
  ];
  for (const line of untouched) assert.equal(rewriteLine(line), line);
});

test("is idempotent — a second pass changes nothing", () => {
  const inputs = [
    "100% Online (Google Classroom)",
    "Delivered via Google Classroom",
    "Google Classroom access included",
  ];
  for (const input of inputs) {
    const once = rewriteLine(input);
    assert.equal(rewriteLine(once), once, `not idempotent for: ${input}`);
    assert.ok(!MENTIONS_CLASSROOM.test(once), `mention survived: ${input}`);
  }
});

test("drops a bullet that was only ever about Classroom", () => {
  const { features } = rewriteFeatures([
    "6-week structured roadmap",
    "Google Classroom",
    "Certificate of completion",
  ]);
  assert.deepEqual(features, [
    "6-week structured roadmap",
    "Certificate of completion",
  ]);
});

test("drops the access-phrasing variants of that bullet too", () => {
  for (const bullet of [
    "Classroom",
    "Google Classroom",
    "Classroom access",
    "Google Classroom access",
    "Access to Google Classroom",
    "Access to the Google Classroom",
    "Lifetime access to Google Classroom",
  ]) {
    const { features } = rewriteFeatures(["Keep me", bullet]);
    assert.deepEqual(features, ["Keep me"], `not dropped: ${bullet}`);
  }
});

test("reports rather than mangles a line it cannot clear", () => {
  // "Classroom" as part of another product name — no rule should fire, and the
  // line must survive verbatim rather than be half-rewritten.
  const original = "Includes our Classroomly integration";
  const { features, unresolved, changed } = rewriteFeatures([original]);

  assert.deepEqual(features, [original], "the line was altered");
  assert.deepEqual(unresolved, [original], "the line was not reported");
  assert.equal(changed, false);
});

test("no bullet the rewriter claims to have changed still mentions Classroom", () => {
  const { features, unresolved } = rewriteFeatures([
    "100% Online (Google Classroom)",
    "Delivered via Google Classroom",
    "6-week structured roadmap",
    "Includes our Classroomly integration", // unresolved, stays as-is
  ]);

  for (const line of features) {
    if (unresolved.includes(line)) continue;
    assert.ok(!MENTIONS_CLASSROOM.test(line), `mention survived in: ${line}`);
  }
});

test("changed is false when there is nothing to do", () => {
  const clean = ["6-week structured roadmap", "Certificate of completion"];
  const { features, changed, unresolved } = rewriteFeatures(clean);
  assert.deepEqual(features, clean);
  assert.equal(changed, false);
  assert.deepEqual(unresolved, []);
});

test("handles an empty or missing feature list", () => {
  for (const input of [[], null, undefined]) {
    const { features, changed } = rewriteFeatures(input);
    assert.deepEqual(features, []);
    assert.equal(changed, false);
  }
});

test("rewriteText clears a mention inside a longer blurb", () => {
  const { text, changed, unresolved } = rewriteText(
    "A six-week BIM course delivered via Google Classroom, with weekly assignments.",
  );
  assert.equal(
    text,
    "A six-week BIM course delivered on the ADLM Studio platform, with weekly assignments.",
  );
  assert.equal(changed, true);
  assert.equal(unresolved, null);
});

test("rewriteText leaves text it cannot clear untouched and reports it", () => {
  const original = "Bundled with Classroomly, our partner tool.";
  const { text, changed, unresolved } = rewriteText(original);
  assert.equal(text, original);
  assert.equal(changed, false);
  assert.equal(unresolved, original);
});

test("rewriteText is a no-op on copy with no mention", () => {
  const original = "A six-week BIM course with weekly assignments.";
  const { text, changed } = rewriteText(original);
  assert.equal(text, original);
  assert.equal(changed, false);
});
