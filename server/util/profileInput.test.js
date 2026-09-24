import test from "node:test";
import assert from "node:assert/strict";
import { blankToUndefined } from "./profileInput.js";

test("blank or missing profile fields are left unchanged", () => {
  for (const v of ["", "   ", null, undefined]) assert.equal(blankToUndefined(v), undefined);
});

test("real values pass through", () => {
  assert.equal(blankToUndefined("lagos"), "lagos");
  assert.equal(blankToUndefined("south_west"), "south_west");
});
