// server/lambda.provisioned.test.js
//
// A provisioned environment does the cold-start work in INIT; every other
// environment must keep doing it lazily, and INIT must never fail over it.
import test from "node:test";
import assert from "node:assert/strict";

const { prepareForProvisionedConcurrency } = await import("./lambda.js");

test("an on-demand environment does nothing at INIT (its INIT is capped at 10s)", async () => {
  let called = 0;
  const prepare = async () => void (called += 1);
  assert.equal(await prepareForProvisionedConcurrency({ AWS_LAMBDA_INITIALIZATION_TYPE: "on-demand" }, prepare), false);
  assert.equal(await prepareForProvisionedConcurrency({}, prepare), false);
  assert.equal(called, 0);
});

test("a provisioned environment prepares the handler during INIT", async () => {
  let called = 0;
  const ok = await prepareForProvisionedConcurrency(
    { AWS_LAMBDA_INITIALIZATION_TYPE: "provisioned-concurrency" },
    async () => void (called += 1),
  );
  assert.equal(ok, true);
  assert.equal(called, 1);
});

test("a failure during provisioned INIT is swallowed, so INIT still succeeds", async () => {
  const ok = await prepareForProvisionedConcurrency(
    { AWS_LAMBDA_INITIALIZATION_TYPE: "provisioned-concurrency" },
    async () => {
      throw new Error("stub: Atlas stalled");
    },
  );
  assert.equal(ok, false);
});

test("importing the module under test did not try to prepare anything", () => {
  // The test process is not a Lambda: the module-level call must be a no-op.
  assert.notEqual(process.env.AWS_LAMBDA_INITIALIZATION_TYPE, "provisioned-concurrency");
});
