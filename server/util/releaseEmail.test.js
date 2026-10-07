// server/util/releaseEmail.test.js
//
// What the "new version is ready" email says. Pinned because the parts that
// matter are easy to lose in an edit: the app to close before updating (and
// no promise that the Installation Center refuses, which the shipped Hub does
// not), the opt-out, the legal name, and that nothing in a release note can
// turn into markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReleaseMessage,
  genericNotes,
  LEGAL_LINE,
  MAX_ITEMS,
  notesFromChangelog,
  notesFromMarkdown,
  productFor,
  updateSteps,
} from "./releaseEmail.js";

const UNSUB = "https://api.adlmstudio.net/api/email/unsubscribe/product-updates/tok";

const notes = {
  source: "changelog",
  title: "Linked models",
  highlight: "The whole takeoff in one go.",
  groups: [
    { type: "new", items: ["Linked models are measured"] },
    { type: "fixed", items: ["Budget totals no longer drift"] },
  ],
  paragraphs: [],
};

test("the subject names the product, the version and where to update", () => {
  const m = buildReleaseMessage({ firstName: "Ada Obi", product: productFor("revit"), version: "3.1.11", notes, unsubscribeUrl: UNSUB });
  assert.equal(m.subject, "QUIV 3.1.11 is ready — update from the Installation Center");
  assert.match(m.html, /Hi Ada,/);
  assert.match(m.text, /^Hi Ada,/);
});

test("the steps say which app to close first, per product", () => {
  const quiv = updateSteps(productFor("revit"), "3.1.11");
  assert.equal(quiv[0], "Save your work and close Revit first: the update replaces files Revit keeps open.");
  assert.match(quiv[2], /Find QUIV in the list and click Update/);
  assert.match(quiv[3], /open Revit again\. QUIV 3\.1\.11 loads with it/);

  const heron = updateSteps(productFor("planswift"), "2.9.5");
  assert.match(heron[0], /close PlanSwift, ADLM HERON and Excel first: the update replaces files they keep open\./);

  // The Hub customers have today only warns when the host app is running
  // (the refusing HostAppGuard is unreleased), so no step may promise more.
  for (const key of ["revit", "mep", "planswift", "rategen", "qs-takeoff", "civil3d", "archicad", "excelbridge", "unknown"]) {
    const steps = updateSteps(productFor(key), "1.0.0").join(" ");
    assert.doesNotMatch(steps, /will not update|won't update|refuses|cannot update/i, key);
  }

  assert.match(updateSteps(productFor("mep"), "1.8.4")[0], /close Revit/);
  assert.match(updateSteps(productFor("rategen"), "2.9.1")[0], /close ADLM RateGen/);
  assert.match(updateSteps(productFor("qs-takeoff"), "1.1.2")[0], /close ADLM Time Pro/);
  assert.match(updateSteps(productFor("civil3d"), "1.0.1")[0], /close AutoCAD \/ Civil 3D/);
  assert.match(updateSteps(productFor("excelbridge"), "1.0.1")[0], /close Excel/);
});

test("the body carries what changed, how to update, support, the opt-out and the legal name", () => {
  const m = buildReleaseMessage({ firstName: "", product: productFor("revit"), version: "3.1.11", notes, unsubscribeUrl: UNSUB });
  for (const part of [m.html, m.text]) {
    assert.match(part, /Linked models are measured/);
    assert.match(part, /Budget totals no longer drift/);
    assert.match(part, /Installation Center/);
    assert.match(part, /manage\/support/);
    assert.ok(part.includes(UNSUB), "the per-recipient opt-out link is in the message");
    assert.match(part, /RC 7440343/);
    assert.match(part, /Academy for Digital Learning &(amp;)? Mastery Studios/);
  }
  assert.ok(m.html.includes(LEGAL_LINE));
  assert.match(m.html, /whats-new\/quiv/);
  assert.match(m.html, /Hi there,/);
});

test("nothing in a release note becomes markup, and only https links survive", () => {
  const n = notesFromMarkdown(
    "## Fixed\n- <script>alert(1)</script> gone\n- **bold** and [docs](https://adlmstudio.net/x) and [bad](javascript:alert(1))",
  );
  const m = buildReleaseMessage({ firstName: "<b>x</b>", product: productFor("revit"), version: "3.1.11", notes: n, unsubscribeUrl: UNSUB });
  assert.ok(!m.html.includes("<script>"), "a script tag in the notes is escaped");
  assert.ok(m.html.includes("&lt;script&gt;"));
  assert.ok(!m.html.includes("<b>x</b>"), "the name is escaped too");
  assert.match(m.html, /<strong>bold<\/strong>/);
  assert.match(m.html, /<a href="https:\/\/adlmstudio\.net\/x"/);
  assert.ok(!/href="javascript:/i.test(m.html), "no javascript: link");
});

test("markdown notes: headings group, bullets are items, the rest are paragraphs", () => {
  const n = notesFromMarkdown("Big release.\r\n\r\n### New\n- One\n* Two\n### Bug fixes\n1. Three\n");
  assert.equal(n.source, "request");
  assert.deepEqual(n.paragraphs, ["Big release."]);
  assert.deepEqual(n.groups, [
    { type: "new", items: ["One", "Two"] },
    { type: "fixed", items: ["Three"] },
  ]);
  assert.deepEqual(notesFromMarkdown(["a", "b"]).groups, [{ type: "", items: ["a", "b"] }]);
});

test("What's New notes are taken for exactly this version, never the latest", () => {
  const doc = {
    releases: [
      { version: "3.1.10", title: "Newest", changes: [{ type: "new", items: ["x"] }] },
      { version: "3.1.9", title: "Older", highlight: "h", changes: [{ type: "fixed", items: ["y"] }] },
    ],
  };
  assert.equal(notesFromChangelog(doc, "3.1.11"), null, "a version not written up yet has no notes");
  const n = notesFromChangelog(doc, "v3.1.9");
  assert.equal(n.title, "Older");
  assert.deepEqual(n.groups, [{ type: "fixed", items: ["y"] }]);
});

test("a long list is cut, and says where the rest is", () => {
  const many = { ...genericNotes(productFor("rategen")), groups: [{ type: "fixed", items: Array.from({ length: MAX_ITEMS + 4 }, (_, i) => `item ${i}`) }] };
  const m = buildReleaseMessage({ product: productFor("rategen"), version: "2.9.1", notes: many, unsubscribeUrl: UNSUB });
  assert.ok(m.html.includes(`item ${MAX_ITEMS - 1}`));
  assert.ok(!m.html.includes(`item ${MAX_ITEMS}<`));
  assert.match(m.html, /and 4 more changes/);
});

test("an unknown product key still gets a sensible name and no invented host app", () => {
  const p = productFor("newthing", "New Thing Pro");
  assert.equal(p.name, "New Thing Pro");
  assert.deepEqual(p.hostApps, []);
  assert.deepEqual(p.audienceKeys, ["newthing"]);
  assert.match(updateSteps(p, "1.0.1")[0], /close New Thing Pro if it is open/);
});
