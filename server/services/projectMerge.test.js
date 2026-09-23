// Federated merge containers: which identity resolves the sources.
//
// THE REGRESSION THESE EXIST FOR
// The read resolved a container's sources under the CONTAINER's owner, so a
// collaborator was served the whole combined bill and budget. The write
// resolved them under the REQUESTER, found nothing, and answered 404
// MERGE_SOURCE_MISSING — "a discipline project behind this merge could not be
// loaded" — for every save. A collaborator could plainly read and edit a merged
// project and could never save it, and the message blamed a missing discipline
// rather than the real cause.
//
// Both halves now go through containerOwnerId(). What these assert is the
// filter that actually reaches Mongo, because that is the one place the two
// could silently drift apart again.

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const { TakeoffProject } = await import("../models/TakeoffProject.js");
const {
  containerOwnerId,
  loadMergeSources,
  resolveMergedProject,
  resolveSourceForIdentity,
  splitMergedWrite,
  namespacedIdentity,
} = await import("./projectMerge.js");

const OWNER = new mongoose.Types.ObjectId();
const COLLABORATOR = new mongoose.Types.ObjectId();
const ARCH_ID = new mongoose.Types.ObjectId();
const STRUCT_ID = new mongoose.Types.ObjectId();
const CONTAINER_ID = new mongoose.Types.ObjectId();
const UNLINKED_ID = new mongoose.Types.ObjectId();

// Every filter that reached Mongo, so a test can assert on the scoping itself
// rather than only on the resolved output.
let findFilters = [];
let findOneFilters = [];
let rows = [];

function installMongoStub() {
  TakeoffProject.find = (filter) => {
    findFilters.push(filter);
    const uid = String(filter?.userId ?? "");
    const ids = (filter?._id?.$in || []).map(String);
    const hits = rows.filter(
      (r) => ids.includes(String(r._id)) && String(r.userId) === uid,
    );
    return { lean: async () => hits };
  };
  TakeoffProject.findOne = async (filter) => {
    findOneFilters.push(filter);
    const uid = String(filter?.userId ?? "");
    return (
      rows.find(
        (r) => String(r._id) === String(filter?._id) && String(r.userId) === uid,
      ) || null
    );
  };
}

installMongoStub();

function sourceDoc(id, name, code, rate) {
  return {
    _id: id,
    userId: OWNER,
    productKey: "planswift",
    name,
    items: [{ code, description: name + " concrete", unit: "m3", qty: 10, rate }],
    budgetItems: [
      {
        billIdentity: code,
        componentKind: "Material",
        materialName: "Cement (50kg)",
        unit: "bags",
        qty: 70,
        rate: 9_500,
      },
    ],
    materialItems: [],
    provisionalSums: [],
    variations: [],
  };
}

// A container owns NO lines of its own — that is the whole point of federating.
// Shared with a collaborator at "full", which is what makes it a save target.
function containerDoc() {
  return {
    _id: CONTAINER_ID,
    userId: OWNER,
    productKey: "planswift",
    name: "Pavillion (merged)",
    mergeContainer: true,
    mergePartType: "discipline",
    linkedProjects: [
      { projectId: ARCH_ID, linkType: "merge", discipline: "architectural" },
      { projectId: STRUCT_ID, linkType: "merge", discipline: "structural" },
    ],
    collaborators: [{ userId: COLLABORATOR, accessLevel: "full" }],
    items: [],
    budgetItems: [],
    materialItems: [],
    provisionalSums: [],
    variations: [],
  };
}

function reset() {
  findFilters = [];
  findOneFilters = [];
  rows = [
    sourceDoc(ARCH_ID, "Architectural", "A-1", 1_250),
    sourceDoc(STRUCT_ID, "Structural", "S-1", 1_450),
    // The collaborator's own project, deliberately NOT linked to the container.
    { ...sourceDoc(UNLINKED_ID, "Stranger", "X-1", 99), userId: COLLABORATOR },
  ];
}

test("a container's sources resolve under its owner, whoever is asking", async () => {
  reset();
  const merged = await resolveMergedProject(containerDoc());

  assert.equal(findFilters.length, 1, "the sources were not loaded in one query");
  assert.equal(
    String(findFilters[0].userId),
    String(OWNER),
    "the sources were not scoped to the container's owner",
  );
  assert.equal(merged.items.length, 2, "both disciplines should resolve into the view");
  assert.deepEqual(merged.merge.missing, [], "no source should be reported missing");
  assert.equal(merged.items[0].code, namespacedIdentity(ARCH_ID, "A-1"));
});

// The regression guard. The second argument is deliberate: it is exactly what
// the write path used to pass, and the point is that it can no longer change
// the scoping. If the owner id ever goes back to being a parameter, this fails.
test("a requester id passed in cannot mis-scope the resolution", async () => {
  reset();
  const container = containerDoc();

  assert.equal(String(containerOwnerId(container)), String(OWNER));

  const merged = await resolveMergedProject(container, COLLABORATOR);
  assert.equal(String(findFilters[0].userId), String(OWNER));
  assert.equal(
    merged.items.length,
    2,
    "a collaborator's id leaked into the scoping and emptied the merged bill",
  );

  findFilters = [];
  const sources = await loadMergeSources(container, COLLABORATOR);
  assert.equal(String(findFilters[0].userId), String(OWNER));
  assert.equal(sources.length, 2);
});

test("what the read serves a collaborator is what the write can route home", async () => {
  reset();
  const container = containerDoc();
  const merged = await resolveMergedProject(container);

  // The editor initialises from that payload and sends the whole thing back.
  const echoed = {
    items: merged.items.map((it) => ({ ...it, percentComplete: 60 })),
    budgetItems: merged.budgetItems.map((b) => ({ ...b })),
  };

  const { bySource, unroutable } = splitMergedWrite(container, echoed);

  assert.deepEqual(unroutable, [], "a line the read produced could not be routed back");
  assert.equal(bySource.size, 2, "both disciplines should receive their own lines");

  const arch = bySource.get(String(ARCH_ID));
  assert.equal(arch.items.length, 1);
  assert.equal(arch.items[0].code, "A-1", "the source did not get its own code back");
  assert.equal(arch.items[0].percentComplete, 60, "the edit did not survive routing");
  assert.equal(arch.budgetItems[0].billIdentity, "A-1");

  // Every id the write will load is one of the container's own merge links, so
  // owner-scoping them adds no reach the read did not already have.
  const linked = new Set(container.linkedProjects.map((l) => String(l.projectId)));
  for (const id of bySource.keys()) {
    assert.ok(linked.has(id), id + " is not one of this container's sources");
  }
});

test("a single identity routes home under the owner, and only if it is linked", async () => {
  reset();
  const container = containerDoc();

  const hit = await resolveSourceForIdentity(
    container,
    namespacedIdentity(STRUCT_ID, "S-1"),
  );
  assert.ok(hit, "a linked source did not resolve");
  assert.equal(hit.identity, "S-1");
  assert.equal(String(hit.project._id), String(STRUCT_ID));
  assert.equal(
    String(findOneFilters[0].userId),
    String(OWNER),
    "the source was not scoped to the container's owner",
  );

  // Not a merge link of this container — refused before it ever reaches Mongo,
  // even though the requester happens to own it.
  findOneFilters = [];
  const miss = await resolveSourceForIdentity(
    container,
    namespacedIdentity(UNLINKED_ID, "X-1"),
  );
  assert.equal(miss, null, "an unlinked project resolved through a container");
  assert.equal(findOneFilters.length, 0, "an unlinked id was still queried");
});

test("a container whose source was deleted reports it rather than pretending", async () => {
  reset();
  rows = rows.filter((r) => String(r._id) !== String(STRUCT_ID));

  const merged = await resolveMergedProject(containerDoc());
  assert.equal(merged.items.length, 1, "the surviving discipline should still resolve");
  assert.deepEqual(
    merged.merge.missing.map((m) => m.projectId),
    [String(STRUCT_ID)],
    "the deleted source was not reported as missing",
  );
});
