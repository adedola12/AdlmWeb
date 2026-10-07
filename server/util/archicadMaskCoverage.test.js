// Every money-bearing response on the ArchiCAD surface goes through the mask.
//
// archicadMask.test.js proves the mask works. This proves it is APPLIED —
// which is the half that was actually broken: the mask did not exist, and
// every read on this surface handed a collaborator without RateGen the
// owner's unit rates, line amounts and grand total.
//
// It is a source scan on purpose. The leak class here is "somebody adds a
// route that returns a BoQ and forgets", and no behavioural test of the
// routes that exist today catches that. A scan does, on the day the route is
// written, with a message saying what to do about it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(here, "..", "routes", "archicad.routes.js"),
  "utf8",
);
const LINES = SRC.split(/\r?\n/);

// There used to be one exception, POST /boq/extract: it never went through
// findProjectForUser, so req.projectAccess was undefined there and masking on
// it would have zeroed the owner's own BoQ. It now resolves access itself (a
// full collaborator whose money is hidden must not read the owner's prices
// back from their own model update), so nothing is unmasked by design.
const UNMASKED_BY_DESIGN = [];

function routeAbove(index) {
  for (let i = index; i >= 0; i--) {
    const m = LINES[i].match(/router\.(get|post|put|patch|delete)\("([^"]+)"/);
    if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  }
  return "(before any route)";
}

test("every buildBoqDocument response is wrapped in maskArchicadMoney", () => {
  const offenders = [];
  LINES.forEach((line, i) => {
    if (!line.includes("buildBoqDocument(")) return;
    const route = routeAbove(i);
    if (UNMASKED_BY_DESIGN.some((r) => route.includes(r))) return;
    // The call may be the response itself or the `boq:` field of an export.
    const isResponse = /res\.json\(|boq:/.test(line);
    if (!isResponse) return;
    if (!line.includes("maskArchicadMoney(")) {
      offenders.push(`${route} — line ${i + 1}: ${line.trim()}`);
    }
  });
  assert.deepEqual(
    offenders,
    [],
    "These hand out a priced BoQ without asking whether the reader may see " +
      "rates. Wrap it: maskArchicadMoney(doc, req.projectAccess?.canSeeRates).\n" +
      offenders.join("\n"),
  );
});

test("no BoQ response is unmasked, the extract included", () => {
  // If this count moves, somebody added an unmasked BoQ response.
  const unmasked = LINES.filter(
    (l) => l.includes("buildBoqDocument(") && /res\.json\(|boq:/.test(l) && !l.includes("maskArchicadMoney("),
  );
  assert.deepEqual(unmasked, [], "expected no unmasked BoQ response");
  // And the extract really is one of the masked ones.
  const extract = LINES.findIndex((l) => l.includes('router.post("/boq/extract"'));
  const next = LINES.findIndex((l, i) => i > extract && /router\.(get|post|put|patch|delete)\(/.test(l));
  assert.ok(
    LINES.slice(extract, next).some((l) => l.includes("maskArchicadMoney(buildBoqDocument(")),
    "POST /boq/extract should mask its response",
  );
});

test("no route returns a grandTotal without asking about rates first", () => {
  // The versions list and the projects list both sent grandTotal straight out
  // of the aggregate. They were the last two leaks after the documents were
  // masked, because neither builds a BoQ document to mask.
  const offenders = [];
  LINES.forEach((line, i) => {
    if (!/^\s*grandTotal:/.test(line)) return;
    const route = routeAbove(i);
    if (UNMASKED_BY_DESIGN.some((r) => route.includes(r))) return;
    if (!/canSeeRates/.test(line)) offenders.push(`${route} — line ${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(offenders, [], `grandTotal returned unguarded:\n${offenders.join("\n")}`);
});

test("every write route asks requireProjectPower before it writes", () => {
  // The other half of the same hole: the read filter matches collaborators,
  // so a view-only reader reached these and nothing asked whether they may
  // change anything.
  const WRITES = [
    "/boq/:projectId/reapply-rates",
    "/boq/:projectId/margin",
    "/boq/:projectId/budget",
  ];
  const EXPORTS = ["/boq/:projectId/export/excel", "/boq/:projectId/export/pdf"];

  for (const [routes, power] of [
    [WRITES, "canEdit"],
    [EXPORTS, "canExport"],
  ]) {
    for (const r of routes) {
      const start = LINES.findIndex((l) => l.includes(`"${r}"`));
      assert.ok(start >= 0, `route ${r} not found — was it renamed?`);
      const body = LINES.slice(start, start + 14).join("\n");
      assert.ok(
        body.includes(`requireProjectPower(req, res, "${power}"`),
        `${r} does not check ${power} in its first 14 lines`,
      );
    }
  }
});
