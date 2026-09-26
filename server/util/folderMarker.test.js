// HERON's folder markers must never reach an exported bill (see routes/projects.boq.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isFolderMarker } from "./folderMarker.js";

test("the marker HERON saves ahead of each folder is spotted", () => {
  assert.equal(isFolderMarker({ description: "--- GF ---", type: "section", code: "folder:GF", level: "GF", qty: 0 }), true);
});

test("real bill lines, sub-items and other tools' headings are left alone", () => {
  assert.equal(isFolderMarker({ description: "Wall Rendering", type: "item", code: "GF:Wall Rendering", qty: 469.02 }), false);
  assert.equal(isFolderMarker({ description: "  Lintel Concrete", type: "breakdown", qty: 0.72 }), false);
  assert.equal(isFolderMarker({ description: "--- GF ---", type: "section", code: "folder:GF", qty: 3 }), false);
  assert.equal(isFolderMarker({ description: "Substructure", type: "section", qty: 0 }), false);
  assert.equal(isFolderMarker(undefined), false);
});
