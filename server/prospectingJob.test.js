// server/prospectingJob.test.js
//
// The daily job's switch and lock, without SSM, Mongo or any API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireLock, runProspecting } from "./prospectingJob.js";

const quiet = () => {};
const finder = { day: "2026-09-26", added: 3, costUsd: 0.9, errors: [] };
const drafter = { drafted: [1, 2], skipped: [], failed: [] };

test("switched off, the job touches nothing", async () => {
  let touched = false;
  const touch = async () => { touched = true; return true; };
  const out = await runProspecting({ enabled: false, lock: touch, unlock: touch, find: touch, draft: touch, log: quiet });
  assert.deepEqual(out, { ok: true, skipped: "disabled" });
  assert.equal(touched, false);
});

test("switched on, it finds then drafts, and always releases the lock", async () => {
  const order = [];
  const out = await runProspecting({
    enabled: true,
    lock: async () => { order.push("lock"); return true; },
    unlock: async () => { order.push("unlock"); },
    find: async () => { order.push("find"); return finder; },
    draft: async () => { order.push("draft"); return drafter; },
    log: quiet,
  });
  assert.deepEqual(order, ["lock", "find", "draft", "unlock"]);
  assert.equal(out.added, 3);
  assert.equal(out.drafted, 2);
});

test("a failure still releases the lock", async () => {
  let released = false;
  await assert.rejects(
    runProspecting({
      enabled: true,
      lock: async () => true,
      unlock: async () => { released = true; },
      find: async () => { throw new Error("Atlas down"); },
      draft: async () => drafter,
      log: quiet,
    }),
    /Atlas down/,
  );
  assert.equal(released, true);
});

test("a run that finds the lock held does nothing", async () => {
  let found = false;
  const out = await runProspecting({
    enabled: true,
    lock: async () => false,
    unlock: async () => {},
    find: async () => { found = true; return finder; },
    draft: async () => drafter,
    log: quiet,
  });
  assert.deepEqual(out, { ok: true, skipped: "lock-held" });
  assert.equal(found, false);
});

// A tiny stand-in for the job_locks collection, enough for acquireLock.
function lockCollection() {
  const rows = [];
  return {
    rows,
    async findOneAndUpdate(filter, update) {
      const hit = rows.find((r) => r._id === filter._id && filter.$or.some((c) => (c.expiresAt?.$lt ? r.expiresAt < c.expiresAt.$lt : !("expiresAt" in r))));
      if (!hit) return null;
      Object.assign(hit, update.$set);
      return hit;
    },
    async insertOne(doc) {
      if (rows.some((r) => r._id === doc._id)) throw Object.assign(new Error("E11000"), { code: 11000 });
      rows.push({ ...doc });
    },
  };
}

test("the lock is exclusive until it expires, then a new run can take it", async () => {
  const col = lockCollection();
  const t0 = new Date("2026-09-27T06:00:00Z");
  assert.equal(await acquireLock(col, "L", 20, t0), true);
  assert.equal(await acquireLock(col, "L", 20, new Date("2026-09-27T06:10:00Z")), false, "still held 10 minutes later");
  assert.equal(await acquireLock(col, "L", 20, new Date("2026-09-27T06:21:00Z")), true, "a dead run's lock is reclaimed after the TTL");
});
