// Ada is told which of the user's projects they are looking at, so "price this
// project" on Project Aurora's bill is not answered with "which project?"
// (seen on preview, 3 Oct 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserContext } from "./salesAgent.js";

const user = { name: "Ade", email: "a@x.com", entitlements: [] };
const NOW = new Date("2026-10-03T10:00:00Z");

test("on a project page, the visitor section names it and says not to ask", () => {
  const out = buildUserContext(user, NOW, { projectRef: "project-aurora", productKey: "revit" });
  assert.match(out, /ON A PROJECT PAGE/);
  assert.match(out, /reference: project-aurora/);
  assert.match(out, /Do not ask which project/);
});

test("off a project page, nothing is said about one", () => {
  assert.doesNotMatch(buildUserContext(user, NOW, {}), /PROJECT PAGE/);
  assert.doesNotMatch(buildUserContext(user, NOW), /PROJECT PAGE/);
});

test("a guest is never told about a project page", () => {
  assert.doesNotMatch(buildUserContext(null, NOW, { projectRef: "x" }), /PROJECT PAGE/);
});
