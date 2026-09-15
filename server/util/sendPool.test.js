// Send-pool tests.
//
// The pool is what replaced "sleep between every message" across the three
// mass senders, so the two properties it has to hold are the two the sleep was
// holding by accident: never more than N in flight, and never more than R
// started per second. Both are asserted against a fake clock — a test that
// proves a rate limiter by actually waiting is a test nobody runs twice.
//
// The third property is the one that matters most in production and is easiest
// to lose in a refactor: one bad address must not take the run with it. A
// rejected promise escaping into the Promise.all inside mapWithPool would
// abandon everybody queued behind the failure, which is precisely the
// behaviour the old sequential loops were written to avoid.

import test from "node:test";
import assert from "node:assert/strict";

import { createSendPool, mapWithPool } from "./sendPool.js";

/**
 * A clock that only moves when a sleep asks it to.
 *
 * Sleepers are released one at a time, earliest wake first, with the clock
 * advanced to that sleeper's wake time just before it resumes. One release per
 * macrotask is the important part and was worth a first attempt getting wrong:
 * resolving them all in a single microtask drain runs every release before any
 * of the woken tasks continue, so all ten would read the clock at the END of
 * the burst and every measured gap would be zero. The setTimeout gives the
 * resumed task its turn before the next one is woken.
 */
function fakeClock() {
  let t = 0;
  const waiters = [];
  let draining = false;

  function schedule() {
    if (draining) return;
    draining = true;
    setTimeout(function step() {
      if (!waiters.length) {
        draining = false;
        return;
      }
      waiters.sort((a, b) => a.at - b.at);
      const next = waiters.shift();
      t = Math.max(t, next.at);
      next.resolve();
      setTimeout(step, 0);
    }, 0);
  }

  return {
    now: () => t,
    sleep(ms) {
      return new Promise((resolve) => {
        waiters.push({ at: t + ms, resolve });
        schedule();
      });
    },
    get time() {
      return t;
    },
  };
}

test("never runs more than `concurrency` tasks at once", async () => {
  const clock = fakeClock();
  let inFlight = 0;
  let peak = 0;

  await mapWithPool(
    Array.from({ length: 50 }, (_, i) => i),
    async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await clock.sleep(10);
      inFlight -= 1;
    },
    { concurrency: 5, sleep: clock.sleep, now: clock.now },
  );

  assert.equal(peak, 5);
  assert.equal(inFlight, 0);
});

test("holds the per-second rate across a burst", async () => {
  const clock = fakeClock();
  const startedAt = [];

  await mapWithPool(
    Array.from({ length: 10 }, (_, i) => i),
    async () => {
      startedAt.push(clock.time);
    },
    { concurrency: 10, ratePerSecond: 5, sleep: clock.sleep, now: clock.now },
  );

  // Five per second is one every 200ms. Ten sends therefore span 1800ms from
  // the first to the last — nine gaps, not ten, because the first goes
  // immediately.
  assert.equal(startedAt.length, 10);
  assert.equal(startedAt[0], 0);
  assert.equal(startedAt.at(-1), 1800);
  for (let i = 1; i < startedAt.length; i += 1) {
    assert.ok(
      startedAt[i] - startedAt[i - 1] >= 200,
      `gap ${i} was ${startedAt[i] - startedAt[i - 1]}ms, under the 200ms the rate allows`,
    );
  }
});

test("with no rate limit, concurrency is the only ceiling", async () => {
  const clock = fakeClock();
  const started = [];

  await mapWithPool(
    [1, 2, 3, 4],
    async (n) => {
      started.push(clock.time);
      await clock.sleep(n);
    },
    { concurrency: 4, sleep: clock.sleep, now: clock.now },
  );

  assert.deepEqual(started, [0, 0, 0, 0]);
});

test("a failure is settled, not thrown, and does not stop the rest", async () => {
  const seen = [];

  const results = await mapWithPool(
    ["a", "boom", "c"],
    async (item) => {
      seen.push(item);
      if (item === "boom") throw new Error("address rejected");
      return item.toUpperCase();
    },
    { concurrency: 1 },
  );

  assert.deepEqual(seen, ["a", "boom", "c"], "the run continued past the failure");
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, false, true],
  );
  assert.equal(results[0].value, "A");
  assert.equal(results[1].error.message, "address rejected");
  assert.equal(results[2].value, "C");
});

test("results come back in input order, not completion order", async () => {
  const clock = fakeClock();

  const results = await mapWithPool(
    [30, 20, 10],
    async (ms) => {
      await clock.sleep(ms);
      return ms;
    },
    { concurrency: 3, sleep: clock.sleep, now: clock.now },
  );

  assert.deepEqual(
    results.map((r) => r.value),
    [30, 20, 10],
  );
});

test("onResult fires per item and cannot break the send", async () => {
  const reported = [];

  const results = await mapWithPool(
    ["one", "two"],
    async (item) => item,
    {
      concurrency: 2,
      onResult: (item, result) => {
        reported.push([item, result.ok]);
        throw new Error("the progress counter is not the product");
      },
    },
  );

  assert.equal(reported.length, 2);
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true],
  );
});

test("the pool reports how much work is outstanding", async () => {
  const clock = fakeClock();
  const pool = createSendPool({ concurrency: 1, sleep: clock.sleep, now: clock.now });

  const runs = [pool.run(() => clock.sleep(5)), pool.run(() => clock.sleep(5))];
  assert.equal(pool.pending, 2);

  await Promise.all(runs);
  assert.equal(pool.pending, 0);
});
