// Keyword-lookup tests for the elemental / trade BoQ mappings.
//
// A mapping item claims a project line when every word of one lookup group is
// in the line's text (substring match), unless a word on the item's "exclude"
// list is. Each case below is a line from the ADLM PlanSwift template (or a
// concrete twin of it) that used to land on the wrong standard description.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { findMatchingItems } from "./elementalBoqExporter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS = ["trade-mapping.json", "elemental-mapping.json"].map((f) => ({
  file: f,
  json: JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/boq", f), "utf8")),
}));

function lookupItems(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => lookupItems(n, out));
  else if (node && typeof node === "object") {
    if (Array.isArray(node.lookups)) out.push(node);
    for (const [k, v] of Object.entries(node)) {
      if (k !== "lookups" && k !== "exclude") lookupItems(v, out);
    }
  }
  return out;
}

// Descriptions of every mapping item (across both mappings) that claims a line.
function claimedBy(line) {
  const hits = new Set();
  for (const { json } of MAPPINGS) {
    for (const item of lookupItems(json)) {
      if (findMatchingItems(item, [{ description: line }]).length) hits.add(item.description);
    }
  }
  return [...hits].sort();
}

test("roof tie beam stays on the timber line; concrete tie beams go to the beam lines", () => {
  assert.deepEqual(claimedBy("Tie Beam"), ["50 x 100mm Hardwood Strut and Ties"]);
  for (const line of ["Concrete in Tie Beam", "Tie Beam Formwork", "Tie beam reinforcement"]) {
    assert.ok(
      !claimedBy(line).includes("50 x 100mm Hardwood Strut and Ties"),
      `${line} must not be roof timber`,
    );
  }
  assert.ok(claimedBy("Concrete in Tie Beam").includes("Beam concrete"));
  assert.ok(claimedBy("Tie Beam Formwork").includes("Beam formwork"));
  assert.ok(claimedBy("Tie beam reinforcement").includes("Beam reinforcement"));
});

test("slab edge formwork is not slab soffit formwork", () => {
  for (const line of ["Slab Edge Formwork", "Formwork to edges of ribbed slab", "Formwork to edges of Slab"]) {
    assert.ok(!claimedBy(line).includes("Slab soffit formwork"), line);
  }
  for (const line of ["Slab Soffit Formwork", "Formwork to Soffit of Slab", "Formwork to Soffit of Ribbed Slab"]) {
    assert.deepEqual(claimedBy(line), ["Slab soffit formwork"], line);
  }
});

test("ground-bearing slabs never land on the suspended-slab lines", () => {
  const SUSPENDED = [
    "Suspended slab concrete",
    "Suspended slabs",
    "Suspended slab reinforcement",
    "10-16mm diameter bars in suspended slabs",
  ];
  const lines = [
    "Concrete in Pool Slab",
    "Oversite Slab Concrete",
    "Ground Floor Slab Concrete",
    "Raft Slab Concrete",
    "Suspended slab reinforcement to pool",
    "Slab reinforcement in ground bed",
  ];
  for (const line of lines) {
    const hits = claimedBy(line);
    for (const s of SUSPENDED) assert.ok(!hits.includes(s), `${line} -> ${s}`);
  }
  assert.ok(claimedBy("Concrete in Ribbed Slab").includes("Suspended slab concrete"));
  assert.ok(claimedBy("Suspended Slab Reinforcement").includes("Suspended slab reinforcement"));
});

test("excludes match whole words, so 'bed' does not veto 'embedded'", () => {
  const item = { description: "t", lookups: [["slab", "concrete"]], exclude: ["bed"] };
  assert.equal(findMatchingItems(item, [{ description: "Slab concrete, embedded conduits" }]).length, 1);
  assert.equal(findMatchingItems(item, [{ description: "Slab concrete to beds" }]).length, 0);
});

test("template audit: other names that used to get the wrong description", () => {
  const cases = [
    // [line, wrong description it must not get, right one it should get (or null)]
    ["Concrete in Column Base", "Column concrete", "Pad / column base concrete"],
    ["Concrete in Column Base", "Columns", "Pad / column base concrete"],
    ["Concrete in ground beam", "Beam concrete", "Ground beam concrete (incl. raft beams)"],
    ["Concrete in ground beam", "Beams", "Ground beam concrete (incl. raft beams)"],
    ["Concrete in Pile Cap", "Piling", "Pile cap concrete"],
    ["Formwork to Pile Cap", "Piling", "Pile cap formwork"],
    ["Reinforcement Mesh to Ribbed slab", "Slab reinforcement", "BRC mesh / fabric reinforcement"],
    ["Reinforcement Mesh to Ribbed slab", "10-16mm diameter bars in suspended slabs", null],
    ["Wire Mesh", "Cables, wires and conductors", "BRC mesh / fabric reinforcement"],
    ["Cable Tray", "Cables, wires and conductors", "Conduit and cable tray"],
    ["Lighting Fittings", "Water supply pipes and fittings", "Lighting fixtures and luminaires"],
    ["Socket Fitting", "Water supply pipes and fittings", "Switches, sockets and outlets"],
    ["Switch Fitting", "Water supply pipes and fittings", "Switches, sockets and outlets"],
    ["Pipe Socket", "Switches, sockets and outlets", "Water supply pipes and fittings"],
    ["Waste Water Pipe", "Water supply pipes and fittings", "Drainage / sewer pipes"],
    ["Refrigerant Pipe", "Water supply pipes and fittings", null],
    ["Concrete in Site drain", "Drainage / sewer pipes", null],
    ["Reinforcement in Site drain", "Drainage / sewer pipes", null],
    ["Site drain Formwork", "Drainage / sewer pipes", null],
    ["Blockwork in Septic Tank", "Tanks, pumps and accessories", null],
    ["Purlin Bolts", "50 x 75mm Hardwood Purlins", null],
    ["Z Purlin", "50 x 75mm Hardwood Purlins", null],
  ];
  for (const [line, wrong, right] of cases) {
    const hits = claimedBy(line);
    assert.ok(!hits.includes(wrong), `${line} must not be "${wrong}" (got ${hits.join(" | ")})`);
    if (right) assert.ok(hits.includes(right), `${line} should be "${right}" (got ${hits.join(" | ")})`);
  }
});
