// server/util/indexSync.test.js
//
// The index job that replaced index building at API cold start. No database:
// models are stand-ins with a createIndexes() of their own.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncAllIndexes, indexesReady } from "./indexSync.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const quiet = { warn() {} };

function fakeModel(name, { fail } = {}) {
  const m = {
    modelName: name,
    calls: 0,
    inits: 0,
    async init() {
      m.inits += 1;
    },
    async createIndexes() {
      m.calls += 1;
      if (fail) throw new Error(fail);
    },
  };
  return m;
}

test("every model's indexes are created, one model at a time", async () => {
  let running = 0;
  let peak = 0;
  const models = ["A", "B", "C"].map((n) => {
    const m = fakeModel(n);
    m.createIndexes = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      m.calls += 1;
    };
    return m;
  });
  const out = await syncAllIndexes({ models, log: quiet });
  assert.equal(out.ok, true);
  assert.equal(out.models, 3);
  assert.equal(out.built, 3);
  assert.deepEqual(out.failed, []);
  assert.ok(models.every((m) => m.calls === 1));
  assert.equal(peak, 1, "sequential, so the job never floods its own pool");
});

test("one model failing is reported and never stops the rest", async () => {
  const models = [fakeModel("A"), fakeModel("B", { fail: "IndexOptionsConflict" }), fakeModel("C")];
  const out = await syncAllIndexes({ models, log: quiet });
  assert.equal(out.ok, false);
  assert.equal(out.built, 2);
  assert.deepEqual(out.failed, [{ model: "B", error: "IndexOptionsConflict" }]);
  assert.equal(models[2].calls, 1);
});

test("indexesReady builds a model's indexes once per process, and retries after a failure", async () => {
  const m = fakeModel("Once");
  await indexesReady(m);
  await indexesReady(m);
  assert.equal(m.calls, 1);

  const flaky = fakeModel("Flaky", { fail: "blip" });
  await assert.rejects(indexesReady(flaky), /blip/);
  flaky.createIndexes = async () => {
    flaky.calls += 1;
  };
  await indexesReady(flaky);
  assert.equal(flaky.calls, 2);
});

test("allModels.js imports every model file, so the job cannot miss a new one", () => {
  const src = fs.readFileSync(path.join(here, "allModels.js"), "utf8");
  const notModels = new Set(["demoTenancy.js", "tenancy.bootstrap.js"]);
  const files = fs
    .readdirSync(path.join(here, "..", "models"))
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js") && !notModels.has(f));
  const missing = files.filter((f) => !src.includes(`import "../models/${f}";`));
  assert.deepEqual(missing, [], "add these to util/allModels.js");
});
