// server/routes/admin.takeoff.test.js
//
// The Time saved summary's filters: QUIV 4.0 sends auto take-off runs and
// item-by-item take-offs as separate modes, and marketing figures must be able
// to quote each on its own, without ADLM's own test sessions in them.
import test from "node:test";
import assert from "node:assert/strict";
import { baseMatch, median, windowFrom } from "./admin.takeoff.js";

const win = windowFrom({ days: 30 });

test("mode filters to auto take-off or to hand-measured sessions", () => {
  assert.equal(baseMatch({ mode: "auto" }, win).mode, "auto");
  assert.equal(baseMatch({ mode: "Assisted" }, win).mode, "assisted");
  assert.equal(baseMatch({ mode: "anything" }, win).mode, undefined);
  assert.equal(baseMatch({}, win).mode, undefined);
});

test("staff accounts are left out unless asked for", () => {
  const m = baseMatch({}, win);
  assert.ok(m.email && m.email.$not instanceof RegExp);
  assert.ok(m.email.$not.test("dolapo@adlmstudio.net"));
  assert.ok(!m.email.$not.test("qs@firm.com"));
  assert.equal(baseMatch({ includeStaff: "1" }, win).email, undefined);
  // An explicit email is honoured as it stands, staff or not.
  assert.equal(baseMatch({ email: "Dolapo@ADLMstudio.net" }, win).email, "dolapo@adlmstudio.net");
});

test("seeded and cancelled sessions stay out of totals by default", () => {
  const m = baseMatch({}, win);
  assert.deepEqual(m.seeded, { $ne: true });
  assert.deepEqual(m.cancelled, { $ne: true });
});

test("median is the middle value, rounded between two", () => {
  assert.equal(median([840, 300, 1200]), 840);
  assert.equal(median([100, 201]), 151);
  assert.equal(median([]), 0);
});
