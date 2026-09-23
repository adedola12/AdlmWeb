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
//
// WHICH IDENTITY RESOLVES THE SOURCES (the second half, below)
// Routing a row home is no use if the document it routes to cannot be loaded.
// The read resolved a container's sources under the CONTAINER's owner, so a
// collaborator was served the whole combined bill; the write resolved them
// under the REQUESTER, found nothing, and answered 404 MERGE_SOURCE_MISSING for
// every save. Both halves now go through containerOwnerId(), and what those
// tests assert is the filter that actually reaches Mongo — the one place the
// two could silently drift apart again.

import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

import {
  CONTAINER_OWNED_FIELDS,
  containerOwnerId,
  loadMergeSources,
  namespacedIdentity,
  resolveMergedProject,
  resolveSourceForIdentity,
  splitMergedWrite,
} from "./projectMerge.js";
import { TakeoffProject } from "../models/TakeoffProject.js";

const { guardMaskedWrite, sanitizeVariations } = await import("../routes/projects.js");

const CONTAINER_ID = "6512aa000000000000000001";
const ARCH_ID = "6512aa000000000000000002";
const STRUCT_ID = "6512aa000000000000000003";
const STRANGER_ID = "6512aa000000000000000009";
// The container's owner, and a collaborator the owner shared it with. The
// collaborator owns nothing here, which is exactly why resolving the sources
// under their id used to come back empty.
const OWNER_ID = "6512aa0000000000000000a1";
const COLLABORATOR_ID = "6512aa0000000000000000a2";

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
    userId: OWNER_ID,
    collaborators: [{ userId: COLLABORATOR_ID, accessLevel: "full" }],
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
    resolved = await resolveMergedProject(container());
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

/* ── which identity resolves the sources ────────────────────────────────── */

// The two discipline projects behind the container, owned by the container's
// owner — which is the only way they are ever stored.
function sourceDocs() {
  return [
    {
      _id: ARCH_ID,
      userId: OWNER_ID,
      name: "Ikeja Tower — architectural",
      productKey: "revit",
      items: [{ code: "A1", description: "Blockwork", qty: 120, rate: 5_000 }],
      variations: [],
    },
    {
      _id: STRUCT_ID,
      userId: OWNER_ID,
      name: "Ikeja Tower — structural",
      productKey: "revit",
      items: [{ code: "C1", description: "Concrete grade 25", qty: 40, rate: 180_000 }],
      variations: [],
    },
  ];
}

// A Mongo stub that RESPECTS the filter and records it, so a test can assert on
// the scoping itself rather than only on the resolved output. A stub that
// ignored `userId` would hide the very bug these exist for.
async function withScopedFind(rows, fn) {
  const realFind = TakeoffProject.find;
  const realFindOne = TakeoffProject.findOne;
  const findFilters = [];
  const findOneFilters = [];
  const matches = (row, uid) => String(row.userId) === String(uid ?? "");
  TakeoffProject.find = (filter) => {
    findFilters.push(filter);
    const ids = (filter?._id?.$in || []).map(String);
    const hits = rows.filter((r) => ids.includes(String(r._id)) && matches(r, filter?.userId));
    return { lean: async () => hits };
  };
  TakeoffProject.findOne = async (filter) => {
    findOneFilters.push(filter);
    return (
      rows.find((r) => String(r._id) === String(filter?._id) && matches(r, filter?.userId)) || null
    );
  };
  try {
    return await fn({ findFilters, findOneFilters });
  } finally {
    TakeoffProject.find = realFind;
    TakeoffProject.findOne = realFindOne;
  }
}

test("a container's sources resolve under its owner, whoever is asking", async () => {
  await withScopedFind(sourceDocs(), async ({ findFilters }) => {
    const merged = await resolveMergedProject(container());

    assert.equal(findFilters.length, 1, "the sources were not loaded in one query");
    assert.equal(
      String(findFilters[0].userId),
      OWNER_ID,
      "the sources were not scoped to the container's owner",
    );
    assert.equal(merged.items.length, 2, "both disciplines should resolve into the view");
    assert.deepEqual(merged.merge.missing, [], "no source should be reported missing");
  });
});

// The regression guard. The second argument is deliberate: it is exactly what
// the write path used to pass, and the point is that it can no longer change
// the scoping. If the owner id ever goes back to being a parameter, this fails.
test("a requester id passed in cannot mis-scope the resolution", async () => {
  const c = container();
  assert.equal(String(containerOwnerId(c)), OWNER_ID);

  await withScopedFind(sourceDocs(), async ({ findFilters }) => {
    const merged = await resolveMergedProject(c, COLLABORATOR_ID);
    assert.equal(String(findFilters[0].userId), OWNER_ID);
    assert.equal(
      merged.items.length,
      2,
      "a collaborator's id leaked into the scoping and emptied the merged bill",
    );
  });

  await withScopedFind(sourceDocs(), async ({ findFilters }) => {
    const sources = await loadMergeSources(c, COLLABORATOR_ID);
    assert.equal(String(findFilters[0].userId), OWNER_ID);
    assert.equal(sources.length, 2);
  });
});

test("what the read serves a collaborator is what the write can route home", async () => {
  // The whole point of the fix: the collaborator is served every discipline's
  // lines, sends them back, and each one lands on a document the write can
  // actually load — under the same owner the read used.
  const c = container({ variations: [] });
  await withScopedFind(sourceDocs(), async () => {
    const merged = await resolveMergedProject(c);
    const echoed = { items: merged.items.map((it) => ({ ...it, percentComplete: 60 })) };
    const { bySource, unroutable } = splitMergedWrite(c, echoed);

    assert.deepEqual(unroutable, [], "a line the read produced could not be routed back");
    assert.equal(bySource.size, 2, "both disciplines should receive their own lines");
    assert.equal(bySource.get(ARCH_ID).items[0].code, "A1");
    assert.equal(bySource.get(ARCH_ID).items[0].percentComplete, 60);

    // Every id the write will load is one of the container's own merge links,
    // so owner-scoping them adds no reach the read did not already have.
    const linked = new Set(c.linkedProjects.map((l) => String(l.projectId)));
    for (const id of bySource.keys()) {
      assert.ok(linked.has(id), `${id} is not one of this container's sources`);
    }
  });
});

test("a single identity routes home under the owner, and only if it is linked", async () => {
  const rows = [
    ...sourceDocs(),
    // The collaborator's own project, deliberately NOT linked to the container.
    { _id: STRANGER_ID, userId: COLLABORATOR_ID, name: "Somebody else's job", items: [] },
  ];
  await withScopedFind(rows, async ({ findOneFilters }) => {
    const hit = await resolveSourceForIdentity(
      container(),
      namespacedIdentity(STRUCT_ID, "C1"),
    );
    assert.ok(hit, "a linked source did not resolve");
    assert.equal(hit.identity, "C1");
    assert.equal(String(hit.project._id), STRUCT_ID);
    assert.equal(
      String(findOneFilters[0].userId),
      OWNER_ID,
      "the source was not scoped to the container's owner",
    );
  });

  await withScopedFind(rows, async ({ findOneFilters }) => {
    // Not a merge link of this container — refused before it ever reaches
    // Mongo, even though somebody happens to own it.
    const miss = await resolveSourceForIdentity(
      container(),
      namespacedIdentity(STRANGER_ID, "X1"),
    );
    assert.equal(miss, null, "an unlinked project resolved through a container");
    assert.equal(findOneFilters.length, 0, "an unlinked id was still queried");
  });
});

test("a container whose source was deleted still reports it rather than pretending", async () => {
  // MERGE_SOURCE_MISSING now only ever means this: a source that is genuinely
  // gone, not a collaborator being asked the wrong question.
  const rows = sourceDocs().filter((r) => String(r._id) !== STRUCT_ID);
  await withScopedFind(rows, async () => {
    const merged = await resolveMergedProject(container());
    assert.equal(merged.items.length, 1, "the surviving discipline should still resolve");
    assert.deepEqual(
      merged.merge.missing.map((m) => String(m.projectId)),
      [STRUCT_ID],
    );
  });
});
