// ICMS 3 mapping of bill lines (util/icmsMap.js). Every wording below is taken
// from a real QUIV, HERON or SERVIQ bill. What these defend: the Group is never
// guessed, ancillary work stays with its principal item, the lowest floor slab is
// substructure, and a Sub-Group is only given when the line says enough.

import test from "node:test";
import assert from "node:assert/strict";

import { ICMS_GROUPS, ICMS_SUB_GROUPS, elementOf, icmsCode, mapBill, mapLine, subGroupTitle } from "./icmsMap.js";

const at = (description, extra = {}) => mapLine({ description, ...extra }, extra.ctx || {});
const is = (description, group, subGroup = undefined, extra = {}) => {
  const m = at(description, extra);
  assert.equal(m.group, group, `${description} -> ${m.group} (${m.rule})`);
  if (subGroup !== undefined) assert.equal(m.subGroup, subGroup, `${description} -> ${m.subGroup} (${m.rule})`);
};

test("the code tables are the standard's: 13 construction Groups, 95 building Sub-Groups", () => {
  assert.equal(ICMS_GROUPS.length, 13);
  assert.equal(ICMS_SUB_GROUPS.length, 95);
  assert.equal(subGroupTitle("03.030"), "Frames and slabs (above top of ground floor slabs)");
  assert.equal(icmsCode({ projectType: "01", group: "03", subGroup: "03.030" }), "01.2.03.030");
  assert.equal(icmsCode({ group: "09" }), "2.09");
});

test("QUIV: the element decides, so reinforcement and formwork stay with their element", () => {
  is("Beams – Reinforcement Links T6 [L:01 - GROUND FLOOR LVL. | T:250x1050 BM]", "03", "03.030");
  is("Columns – Formwork [L:All Floors | T:300x300]", "03", "03.030");
  is("Strip – Concrete in Footing", "02", "02.020");
  is("Oversite – BRC Mesh [L:Multiple / From picked floors | T:Oversite]", "02", "02.020");
  is("Pile Cap – Concrete", "02", "02.020");
  is("Roof – Purlin 50 x 75mm", "03", "03.030");
  is("Roof – Covering (Area)", "04", "04.030");
  is("Windows – Window 1200 x 1800mm", "04", "04.020");
  is("Blockwork – Wall Area [L:All Floors | T:All Wall Types]", "04", null); // external or internal is not said
  assert.equal(elementOf("Walls; thickness 150 - 450mm in retaining wall"), "");
});

test("a railing is a railing, even on a staircase", () => {
  is("Staircase – Railing [L:All Floors | T:Insitu_Concrete_175mm_Waist]", "04", "04.050");
});

test("the lowest floor slab is substructure; suspended slabs are structure", () => {
  is("Concrete (1:2:4) 150mm thick ground floor slab", "02", "02.020");
  is("Reinforced concrete (1:1.5:3) grade 25 in 150mm first floor slab", "03", "03.030");
  is("Beds; sloping not exceeding 15 degrees; thickness not exceeding 150", "02", "02.020");
});

test("concrete walls are structure, blockwork walls architectural", () => {
  is("Walls; thickness 150 - 450mm lift wall", "03", "03.030");
  is("12mm bar in Lift", "03", "03.030");
  is("Vibrated hollow sancrete blocks in cement mortar (1:6) laid in stretcher bond Walls 225mm", "04", null);
  is("Walls; thickness 150 - 450mm in retaining wall", "07", "07.010");
});

test("a covering named is the covering, even fixed to purlins", () => {
  is("0.55mm longspan aluminium roofing sheets fixed to purlins with self-tapping screws", "04", "04.030");
  is("Allow a provisional sum of N50,000,000.00 for Aluminium Skylight", "04", "04.030");
});

test("HERON: the section heading places a line its words do not", () => {
  const out = mapBill(
    [
      { description: "--- Sub ---" },
      { description: "  Trench Exc", qty: 10, rate: 1 },
      { description: "  Girth" },
      { description: "--- Elect ---" },
      { description: "  10A SP 1-Way 1-Gang" },
    ],
    { productKey: "planswift" },
  );
  assert.equal(out[0].header, true);
  assert.equal(out[1].group, "02");
  assert.equal(out[2].group, "02");
  assert.equal(out[2].basis, "section");
  assert.equal(out[4].subGroup, "05.020");
});

test("ditto takes the line above", () => {
  const out = mapBill([
    { description: "Excavate to receive basements; not exceeding 2.0m deep" },
    { description: "Ditto exceeding 2.0m but not exceeding 4.00m deep" },
  ]);
  assert.equal(out[1].subGroup, out[0].subGroup);
});

test("SERVIQ: every line is a service, its words pick the Sub-Group", () => {
  const mep = { ctx: { productKey: "mep" } };
  is("M_Rectangular Duct Transition - Angle - 45 Degree - 450x475-", "05", "05.010", mep);
  is("Mechanical Equipment – 1.5HP split air conditioner", "05", "05.010", mep);
  is("WC -- By", "05", "05.060", mep);
  is("Lighting Fittings", "05", "05.030", mep);
  is("DISTRIBUTION EQUIPMENT AND SWITCH GEARS Supply, Installation of equipment", "05", "05.020", mep);
  is("Pipe Socket", "05", "05.050", mep);
  is("Inspection chamber 600 x 450mm", "06", "06.030", mep);
  is("Some unnamed fixture", "05", null, mep);
});

test("prelims, contingency and tax", () => {
  is("Fixed charge – Site establishment", "08");
  is("The contractor shall buy and maintain Design and Engineering software", "08");
  is("Contingency 5%", "09", "09.020");
  is("VAT at 7.5%", "10", "10.020");
});

test("nothing is guessed: a line that says nothing is left for the QS", () => {
  const m = at("Upstand");
  assert.equal(m.group, null);
  assert.equal(m.basis, "none");
  assert.equal(at("").why, "The line has no description.");
});
