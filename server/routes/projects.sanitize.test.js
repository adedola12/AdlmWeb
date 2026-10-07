// What survives a project save, on the server side.
//
// PUT /projects/:productKey/:id REPLACES provisionalSums and variations with
// whatever these two functions return, so a field they drop is a field the
// save deletes. The client was rebuilding its payload field by field and
// losing `kind`, `completed`, `source` and the decision trail; these tests
// pin the other half of that contract — the server accepts and persists every
// one of those fields rather than whitelisting them away — and pin the
// defaults that keep documents written before S18 reading exactly as they
// always have (no kind = provisional, no status = approved).

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { sanitizeProvisionalSums, sanitizeVariations, keepLineId } = await import("./projects.js");

const DECIDER = new mongoose.Types.ObjectId().toString();

test("a PC sum keeps its group and its executed tick", () => {
  const [out] = sanitizeProvisionalSums([
    {
      description: "Lift installation",
      amount: 5_000_000,
      kind: "pc",
      completed: true,
      completedAt: "2026-09-10T09:00:00.000Z",
    },
  ]);
  assert.equal(out.description, "Lift installation");
  assert.equal(out.amount, 5_000_000);
  assert.equal(out.kind, "pc");
  assert.equal(out.completed, true);
  assert.equal(out.completedAt.toISOString(), "2026-09-10T09:00:00.000Z");
});

test("a sum with no kind is a provisional sum, as it has always been", () => {
  const [out] = sanitizeProvisionalSums([
    { description: "Drainage allowance", amount: 750_000 },
  ]);
  assert.equal(out.kind, "provisional");
  assert.equal(out.completed, false);
  assert.equal(out.completedAt, null);
});

test("a variation keeps every field the model stores", () => {
  const [out] = sanitizeVariations([
    {
      description: "Additional windows to stair core",
      qty: 4,
      unit: "no",
      rate: 180_000,
      reference: "AI-012",
      issuedAt: "2026-09-12T00:00:00.000Z",
      source: "post-lock-new-item",
      completed: true,
      completedAt: "2026-09-16T00:00:00.000Z",
      status: "rejected",
      decidedAt: "2026-09-17T14:30:00.000Z",
      decidedBy: DECIDER,
    },
  ]);
  assert.equal(out.description, "Additional windows to stair core");
  assert.equal(out.qty, 4);
  assert.equal(out.unit, "no");
  assert.equal(out.rate, 180_000);
  assert.equal(out.reference, "AI-012");
  assert.equal(out.issuedAt.toISOString(), "2026-09-12T00:00:00.000Z");
  assert.equal(out.source, "post-lock-new-item");
  assert.equal(out.completed, true);
  assert.equal(out.completedAt.toISOString(), "2026-09-16T00:00:00.000Z");
  assert.equal(out.status, "rejected");
  assert.equal(out.decidedAt.toISOString(), "2026-09-17T14:30:00.000Z");
  assert.equal(String(out.decidedBy), DECIDER);
});

test("a variation written before the status field reads as approved", () => {
  const [out] = sanitizeVariations([
    { description: "Extra manholes", qty: 1, unit: "item", rate: 450_000 },
  ]);
  assert.equal(out.status, "approved");
  assert.equal(out.source, "manual");
  assert.equal(out.completed, false);
  assert.equal(out.decidedAt, null);
  assert.equal(out.decidedBy, null);
});

test("a variation raised as pending stays pending through a save", () => {
  const [out] = sanitizeVariations([
    { description: "Stair balustrade", qty: 1, unit: "item", rate: 300_000, status: "pending" },
  ]);
  assert.equal(out.status, "pending");
});

test("rubbish in the decision fields is dropped, not stored", () => {
  const [out] = sanitizeVariations([
    {
      description: "Marble to lobby",
      qty: 1,
      rate: 900_000,
      status: "whatever",
      decidedAt: "not a date",
      decidedBy: "not an id",
      source: "made up",
    },
  ]);
  assert.equal(out.status, "approved");
  assert.equal(out.decidedAt, null);
  assert.equal(out.decidedBy, null);
  assert.equal(out.source, "manual");
});

/* ── the row id ─────────────────────────────────────────────────────────── */
//
// These rows are `_id: false` subdocuments, so the sanitizers are the only
// place a row can be given a name of its own. Every write path funnels through
// them, which is how a row ends up named without any caller knowing about it.
// projects.masking.test.js holds what the name is FOR.

test("a row with no id is given one", () => {
  const [sum] = sanitizeProvisionalSums([{ description: "Lift installation", amount: 1 }]);
  const [vo] = sanitizeVariations([{ description: "Extra soakaway", qty: 1, rate: 1 }]);
  assert.match(sum.lineId, /^[A-Za-z0-9_-]{8,64}$/);
  assert.match(vo.lineId, /^[A-Za-z0-9_-]{8,64}$/);
});

test("two rows saved together are given different ids", () => {
  // Ids are minted, never derived from the row or its position — two rows that
  // are identical in every other way must still be told apart.
  const [a, b] = sanitizeProvisionalSums([
    { description: "Soakaway", amount: 250_000 },
    { description: "Soakaway", amount: 250_000 },
  ]);
  assert.notEqual(a.lineId, b.lineId);
});

test("a row that came back with its id keeps it", () => {
  const id = "ln-aaaaaaaa-1111";
  const [sum] = sanitizeProvisionalSums([
    { lineId: id, description: "Lift installation", amount: 1 },
  ]);
  assert.equal(sum.lineId, id);
});

test("an id that is not well formed is replaced, never stored", () => {
  // Too short, too long, wrong characters, or not a string at all. Anything
  // that is not an id gets a real one rather than being written through — two
  // rows that both sent rubbish must not end up sharing a name.
  const rubbish = ["x", "a".repeat(65), "has spaces", "semi;colon", { o: 1 }, 42, null];
  const rows = sanitizeProvisionalSums(
    rubbish.map((lineId, i) => ({ lineId, description: `Row ${i}`, amount: 1 })),
  );
  assert.equal(rows.length, rubbish.length);
  const ids = new Set(rows.map((r) => r.lineId));
  assert.equal(ids.size, rubbish.length);
  for (const r of rows) assert.match(r.lineId, /^[A-Za-z0-9_-]{8,64}$/);
});

test("keepLineId is the one place that decides", () => {
  const id = "ln-bbbbbbbb-2222";
  assert.equal(keepLineId(id), id);
  assert.equal(keepLineId(`  ${id}  `), id, "trimmed, because clients pad");
  assert.notEqual(keepLineId(""), "");
  assert.notEqual(keepLineId(undefined), keepLineId(undefined));
});
