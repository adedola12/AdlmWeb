// Routing a write made against a federated (merged) project back to the
// documents that own each line.
//
// A container resolves several source projects into one bill, and every line
// it hands out is tagged with the document that owns it. On the way back in,
// splitMergedWrite() sends each line home. The container owns no items — but
// it DOES own the contract, and therefore the contract-level variations: one
// raised against the whole job belongs to the merged entity, not to the
// architectural or the structural model. Those rows were being treated as
// unroutable, which refused the ENTIRE save with 409 MERGE_UNROUTABLE_LINES
// and left a whole class of project unable to save its bill at all — including
// every merged project whose own post-lock flow had filed scope on it.
//
// These tests pin all four outcomes: the container's own row comes home, a
// source's row still goes to its source, a row that belongs to neither is
// still refused, and a rate-blind viewer's merged save is still refused
// outright by the masking guard in front of all of this.

import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

import {
  CONTAINER_OWNED_FIELDS,
  namespacedIdentity,
  resolveMergedProject,
  splitMergedWrite,
} from "./projectMerge.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const { guardMaskedWrite, sanitizeVariations } = await import("../routes/projects.js");

const CONTAINER_ID = "6512aa000000000000000001";
const ARCH_ID = "6512aa000000000000000002";
const STRUCT_ID = "6512aa000000000000000003";
const STRANGER_ID = "6512aa000000000000000009";

// A variation raised against the merged contract, as the container stores it.
const CONTAINER_VO = {
  description: "Extend the contract period by six weeks",
  qty: 1,
  unit: "item",
  rate: 4_500_000,
  reference: "VO-07",
  status: "approved",
};

function container(overrides = {}) {
  return {
    _id: CONTAINER_ID,
    name: "Ikeja Tower — combined",
    productKey: "revit",
    mergeContainer: true,
    mergePartType: "discipline",
    variations: [CONTAINER_VO],
    linkedProjects: [
      { projectId: ARCH_ID, linkType: "merge", discipline: "architectural" },
      { projectId: STRUCT_ID, linkType: "merge", discipline: "structural" },
    ],
    ...overrides,
  };
}

// What resolveMergedProject() tags a line with on the way out.
function fromSource(sourceId, line) {
  return { ...line, sourceProjectId: String(sourceId), sourceName: "src" };
}
function fromContainer(line) {
  return { ...line, sourceProjectId: CONTAINER_ID, sourceName: "Ikeja Tower — combined", merged: true };
}

/* ── the bug itself ─────────────────────────────────────────────────────── */

test("a variation the container owns routes to the container, not to nowhere", () => {
  const { container: own, bySource, unroutable } = splitMergedWrite(container(), {
    variations: [fromContainer(CONTAINER_VO)],
  });

  assert.deepEqual(unroutable, [], "the container's own row is not a routing failure");
  assert.equal(own.variations.length, 1);
  assert.equal(own.variations[0].description, CONTAINER_VO.description);
  // The money is the point: it arrives exactly as it left.
  assert.equal(own.variations[0].rate, 4_500_000);
  assert.equal(own.variations[0].status, "approved");
  // The read-time tags are stripped again, so nothing is stored that the
  // source documents do not also store.
  assert.equal(own.variations[0].sourceProjectId, undefined);
  assert.equal(own.variations[0].sourceName, undefined);
  // No source was handed a row that is not theirs.
  for (const [, bucket] of bySource) assert.deepEqual(bucket.variations, []);
});

test("the whole save used to be refused because of it", () => {
  // The shape of the bug, kept so it cannot come back quietly: the container's
  // id is not one of the merge links, so an `allowed`-only test rejects it.
  const links = container().linkedProjects.map((l) => String(l.projectId));
  assert.equal(links.includes(CONTAINER_ID), false);
  assert.equal(CONTAINER_OWNED_FIELDS.includes("variations"), true);
});

/* ── everything that must not change ────────────────────────────────────── */

test("a source's line still routes to its source", () => {
  const { bySource, container: own, unroutable } = splitMergedWrite(container(), {
    items: [
      fromSource(ARCH_ID, {
        code: namespacedIdentity(ARCH_ID, "A1"),
        codeOriginal: "A1",
        description: "Blockwork",
        qty: 120,
        rate: 5_000,
      }),
      fromSource(STRUCT_ID, {
        code: namespacedIdentity(STRUCT_ID, "C1"),
        codeOriginal: "C1",
        description: "Concrete grade 25",
        qty: 40,
        rate: 180_000,
      }),
    ],
    variations: [fromSource(ARCH_ID, { description: "Pre-merge extra", qty: 1, rate: 90_000 })],
  });

  assert.deepEqual(unroutable, []);
  // Each line lands on its own document, with its own code back.
  assert.equal(bySource.get(ARCH_ID).items.length, 1);
  assert.equal(bySource.get(ARCH_ID).items[0].code, "A1");
  assert.equal(bySource.get(ARCH_ID).items[0].rate, 5_000);
  assert.equal(bySource.get(STRUCT_ID).items[0].code, "C1");
  assert.equal(bySource.get(STRUCT_ID).items[0].rate, 180_000);
  // A variation raised before the merge belongs to the source that raised it.
  assert.equal(bySource.get(ARCH_ID).variations.length, 1);
  assert.equal(bySource.get(ARCH_ID).variations[0].rate, 90_000);
  assert.deepEqual(bySource.get(STRUCT_ID).variations, []);
  // ...and the container is told its own list is now empty, rather than being
  // left untouched — otherwise deleting its last variation would not stick.
  assert.deepEqual(own.variations, []);
});

test("a row that belongs to neither the container nor a source is still refused", () => {
  const { unroutable, container: own } = splitMergedWrite(container(), {
    variations: [
      fromSource(STRANGER_ID, { description: "Someone else's job", qty: 1, rate: 1 }),
      { description: "No owner at all", qty: 1, rate: 2 },
    ],
  });

  assert.equal(unroutable.length, 2, "a real routing failure is still a refusal");
  assert.deepEqual(unroutable.map((u) => u.field), ["variations", "variations"]);
  assert.deepEqual(own.variations, []);
});

test("the container owns the contract, not the measurement", () => {
  // Items, budget, material lines and provisional sums are resolved from the
  // sources and never read back off the container, so a line claiming the
  // container owns it is a routing failure, not a contract-level row. Storing
  // it on the container would put it where no read would ever find it.
  const { unroutable, container: own } = splitMergedWrite(container(), {
    items: [fromContainer({ code: "X1", description: "Nobody's line", qty: 1, rate: 10 })],
    provisionalSums: [fromContainer({ description: "Lift installation", amount: 3_000_000 })],
  });

  assert.equal(unroutable.length, 2);
  assert.deepEqual(unroutable.map((u) => u.field).sort(), ["items", "provisionalSums"]);
  assert.equal(own.items, undefined);
  assert.equal(own.provisionalSums, undefined);
});

test("a rate-blind viewer's merged save is still refused outright", () => {
  // Now that a variation CAN route to the container, the guard in front of all
  // of this is the only thing keeping a rate-masked payload — every rate
  // zeroed on the way out — from writing those zeros over the contract's
  // variations. It must keep refusing.
  const { error } = guardMaskedWrite({
    project: container(),
    access: { role: "full", canEdit: true, canManage: false, canSeeRates: false },
    body: { variations: [fromContainer({ ...CONTAINER_VO, rate: 0 })] },
    isMergeContainer: true,
  });

  assert.equal(error.status, 409);
  assert.equal(error.body.code, "RATES_MASKED_MERGE_UNSUPPORTED");
  assert.deepEqual(error.body.details.arrays, ["variations"]);
});

/* ── read it, save it back, and nothing moves ───────────────────────────── */

test("what the container hands out is exactly what routes home again", async () => {
  // The real round trip: resolve the container the way a GET does, hand the
  // resolved variations straight back the way the Bill's save does, and check
  // every row lands on the document that owns it with its money intact.
  const sources = [
    {
      _id: ARCH_ID,
      name: "Ikeja Tower — architectural",
      productKey: "revit",
      items: [{ code: "A1", description: "Blockwork", qty: 120, rate: 5_000 }],
      variations: [{ description: "Pre-merge extra", qty: 1, unit: "item", rate: 90_000 }],
    },
    {
      _id: STRUCT_ID,
      name: "Ikeja Tower — structural",
      productKey: "revit",
      items: [{ code: "C1", description: "Concrete grade 25", qty: 40, rate: 180_000 }],
      variations: [],
    },
  ];

  const realFind = TakeoffProject.find;
  TakeoffProject.find = () => ({ lean: async () => sources });
  let resolved;
  try {
    resolved = await resolveMergedProject(container(), "user1");
  } finally {
    TakeoffProject.find = realFind;
  }

  // The read lists the contract-level row first, then the sources' own.
  assert.equal(resolved.variations.length, 2);
  assert.equal(resolved.variations[0].description, CONTAINER_VO.description);

  const { bySource, container: own, unroutable } = splitMergedWrite(container(), {
    items: resolved.items,
    variations: resolved.variations,
  });

  assert.deepEqual(unroutable, [], "a straight round trip refuses nothing");
  assert.equal(own.variations.length, 1);
  assert.equal(bySource.get(ARCH_ID).variations.length, 1);
  assert.deepEqual(bySource.get(STRUCT_ID).variations, []);

  // Through the same sanitizer the route uses: not one figure moves, and an
  // approved row stays approved.
  const stored = sanitizeVariations(own.variations);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].rate, CONTAINER_VO.rate);
  assert.equal(stored[0].qty, CONTAINER_VO.qty);
  assert.equal(stored[0].status, "approved");
  assert.equal(stored[0].reference, "VO-07");
  assert.equal(bySource.get(ARCH_ID).items[0].code, "A1");
  assert.equal(bySource.get(ARCH_ID).items[0].rate, 5_000);
});

test("a project with no container-owned rows behaves exactly as it did", () => {
  // The invariant the whole change rests on: a merged project that has never
  // held a contract-level variation sees no difference at all.
  const { bySource, container: own, unroutable } = splitMergedWrite(
    container({ variations: [] }),
    { items: [fromSource(ARCH_ID, { code: namespacedIdentity(ARCH_ID, "A1"), qty: 1, rate: 5 })] },
  );

  assert.deepEqual(unroutable, []);
  assert.equal(own.variations, undefined, "an untouched field is not written");
  assert.equal(bySource.get(ARCH_ID).items[0].code, "A1");
});
