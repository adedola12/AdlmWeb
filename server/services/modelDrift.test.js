// Model drift rules (work-board item r2-model-drift-alerts).
//
// The plugin reports a summary; these pin what the server keeps of it (the
// privacy whitelist), what opens, refreshes, clears and stays dismissed, and
// that only a take-off saved from the model closes a drift.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  applyDriftReport,
  clearDriftOnTakeoffSave,
  dismissDrift,
  driftForClient,
  isTakeoffSaveFromModel,
  modelRefFor,
  normalizeDriftReport,
  signatureOf,
} from "./modelDrift.js";

// What QUIV stores as modelFingerprint: SHA-256 of the GUID it stamps into
// the model (RevitModelFingerprint.Create), normalised to lowercase hex.
const FP = crypto.createHash("sha256").update("0f8fad5bd9cb469fa16570867728950e").digest("hex");
const REF = modelRefFor(FP);
const CODES = new Set(["a1", "b2", "c3"]);
const NOW = new Date("2026-09-27T12:00:00Z");

const report = (over = {}) => ({
  modelRef: REF,
  checkedAt: "2026-09-27T11:59:00Z",
  basisVersion: 7,
  productVersion: "3.2.0",
  counts: { added: 2, removed: 1, changed: 0, elementsChecked: 900 },
  lines: [
    { code: "a1", added: 2, removed: 0, changed: 0 },
    { code: "b2", added: 0, removed: 1, changed: 0 },
  ],
  ...over,
});

const norm = (over) => normalizeDriftReport(report(over), CODES, NOW).report;

test("modelRef is SHA-256 of the stored fingerprint, and empty without one", () => {
  assert.match(REF, /^[0-9a-f]{64}$/);
  assert.notEqual(REF, FP);
  assert.equal(modelRefFor(`  ${FP}  `), REF);
  assert.equal(modelRefFor(""), "");
  assert.equal(modelRefFor(null), "");
});

test("a report without a valid modelRef is refused", () => {
  assert.ok(normalizeDriftReport(report({ modelRef: "abc" }), CODES, NOW).error);
  assert.ok(normalizeDriftReport(report({ modelRef: undefined }), CODES, NOW).error);
  assert.ok(normalizeDriftReport(null, CODES, NOW).error);
  assert.ok(normalizeDriftReport([], CODES, NOW).error);
});

test("only whitelisted fields survive: no names, paths, element IDs or quantities", () => {
  const r = norm({
    modelTitle: "Tower.rvt",
    modelPath: "C:\\Jobs\\Tower.rvt",
    clientName: "Acme",
    lines: [
      { code: "a1", added: 2, description: "Wall 200mm", elementIds: [1, 2], qty: 12.5 },
    ],
  });
  const json = JSON.stringify(r);
  for (const leak of ["Tower", "Jobs", "Acme", "Wall 200mm", "elementIds", "qty"]) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.deepEqual(r.lines, [{ code: "a1", added: 2, removed: 0, changed: 0 }]);
});

test("lines must be codes already on the bill, and are merged per code", () => {
  const r = norm({
    lines: [
      { code: "zz-not-on-bill", added: 9 },
      { code: "a1", added: 1 },
      { code: "a1", changed: 2 },
      { code: "c3", added: 0, removed: 0, changed: 0 },
    ],
  });
  assert.deepEqual(r.lines, [{ code: "a1", added: 1, removed: 0, changed: 2 }]);
  assert.equal(r.counts.linesAffected, 1);
});

test("changes that touch no bill line are not drift (false-alarm guard)", () => {
  const r = norm({ counts: { added: 40, removed: 3, changed: 12 }, lines: [] });
  assert.equal(r.drifted, false);
  assert.deepEqual(
    { added: r.counts.added, removed: r.counts.removed, changed: r.counts.changed },
    { added: 0, removed: 0, changed: 0 },
  );
});

test("negative, fractional and absurd counts are cleaned", () => {
  const r = norm({ counts: { added: -4, removed: 2.9, changed: "x" }, lines: [{ code: "a1", changed: 1 }] });
  assert.equal(r.counts.removed, 2);
  // Missing totals fall back to what the lines show.
  assert.equal(r.counts.changed, 1);
  assert.equal(r.counts.added, 0);
});

test("a future client clock is read as now", () => {
  const r = norm({ checkedAt: "2030-01-01T00:00:00Z" });
  assert.equal(r.checkedAt.getTime(), NOW.getTime());
});

test("first drift opens and asks for the one email", () => {
  const d = applyDriftReport(undefined, norm(), NOW);
  assert.equal(d.action, "open");
  assert.equal(d.notify, true);
  assert.equal(d.drift.status, "open");
  assert.equal(d.drift.counts.linesAffected, 2);
  assert.equal(d.drift.notifiedAt, null);
});

test("an open drift reported again refreshes and does not email again", () => {
  const first = applyDriftReport(undefined, norm(), NOW).drift;
  const again = applyDriftReport(
    { ...first, notifiedAt: NOW, eventId: "e1" },
    norm({ lines: [{ code: "a1", added: 5 }] }),
    new Date(NOW.getTime() + 1000),
  );
  assert.equal(again.action, "refresh");
  assert.equal(again.notify, false);
  assert.equal(again.drift.detectedAt.getTime(), first.detectedAt.getTime());
  assert.equal(again.drift.eventId, "e1");
  assert.equal(again.drift.lines[0].added, 5);
});

test("a clean re-check clears an open drift, and is ignored otherwise", () => {
  const open = applyDriftReport(undefined, norm(), NOW).drift;
  const clean = norm({ lines: [], counts: {} });
  const c = applyDriftReport(open, clean, NOW);
  assert.equal(c.action, "clear");
  assert.equal(c.drift.status, "cleared");
  assert.equal(c.drift.clearedBy, "clean-check");
  assert.equal(applyDriftReport(undefined, clean, NOW).action, "ignore");
});

test("a dismissed drift stays dismissed for the same change, and reopens for a new one", () => {
  const open = applyDriftReport(undefined, norm(), NOW).drift;
  const dismissed = dismissDrift(open, "not-a-real-change", NOW);
  assert.equal(dismissed.status, "dismissed");
  assert.equal(dismissed.clearedBy, "dismissed");
  assert.equal(applyDriftReport(dismissed, norm(), NOW).action, "ignore");
  const other = applyDriftReport(dismissed, norm({ lines: [{ code: "c3", removed: 1 }] }), NOW);
  assert.equal(other.action, "open");
  assert.equal(other.notify, true);
});

test("dismissing or saving with nothing open does nothing", () => {
  assert.equal(dismissDrift(undefined), null);
  assert.equal(dismissDrift({ status: "cleared" }), null);
  assert.equal(clearDriftOnTakeoffSave({ status: "dismissed" }), null);
});

test("a take-off save closes an open drift", () => {
  const open = applyDriftReport(undefined, norm(), NOW).drift;
  const c = clearDriftOnTakeoffSave(open, NOW);
  assert.equal(c.status, "cleared");
  assert.equal(c.clearedBy, "takeoff-save");
  assert.equal(c.clearedAt, NOW);
});

test("only a save from the model counts: the web never sends the fingerprint", () => {
  assert.equal(isTakeoffSaveFromModel({ modelFingerprint: FP, items: [] }), true);
  assert.equal(isTakeoffSaveFromModel({ modelFingerprint: FP, takeoffItems: [] }), true);
  assert.equal(isTakeoffSaveFromModel({ items: [{ rate: 5 }] }), false);
  assert.equal(isTakeoffSaveFromModel({ modelFingerprint: FP }), false);
  assert.equal(isTakeoffSaveFromModel({ modelFingerprint: "  ", items: [] }), false);
  assert.equal(isTakeoffSaveFromModel(null), false);
});

test("the signature ignores line order", () => {
  const a = [{ code: "a1", added: 1, removed: 0, changed: 0 }, { code: "b2", added: 0, removed: 2, changed: 0 }];
  assert.equal(signatureOf(a), signatureOf([...a].reverse()));
  assert.notEqual(signatureOf(a), signatureOf([{ ...a[0], added: 2 }, a[1]]));
});

test("the client sees the badge summary only", () => {
  const open = { ...applyDriftReport(undefined, norm(), NOW).drift, eventId: "e1" };
  const c = driftForClient(open);
  assert.equal(c.status, "open");
  assert.equal(c.modelRef, undefined);
  assert.equal(c.signature, undefined);
  assert.equal(c.eventId, undefined);
  assert.equal(driftForClient({ status: "none" }), null);
  assert.equal(driftForClient(undefined), null);
});
