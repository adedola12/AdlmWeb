// server/util/demoContext.test.js
// Guards the sharpest edge in the tenancy design.
//
// A mongoose Query is lazy: building it starts nothing, and the database call
// only begins when it is awaited. Hand the query back out of runAsDemo() and the
// scope has already unwound by then, so the tenant filter is applied against the
// WRONG context. In the seeder that meant a "delete the demo rows" call matching
// every real row instead — 310 users and 294 purchases, on production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAsDemo, runWithoutDemo, withoutDemo, isDemoContext } from "./demoContext.js";

// Stands in for a mongoose Query: nothing happens until it is awaited.
class LazyQuery {
  then(resolve) { resolve(isDemoContext()); }
}

test("returning a lazy query out of runAsDemo loses the scope", async () => {
  // Documents the trap rather than endorsing it — this is exactly the shape
  // that made the seeder dangerous, and it must stay visibly broken so nobody
  // reintroduces it thinking it works.
  const scoped = await runAsDemo(() => new LazyQuery());
  assert.equal(scoped, false, "the query runs after the scope has unwound");
});

test("awaiting inside the callback keeps the scope", async () => {
  const scoped = await runAsDemo(async () => await new LazyQuery());
  assert.equal(scoped, true);
});

test("guard-style usage keeps the scope for everything downstream", async () => {
  // demoModeGuard passes next(), so the whole request continuation runs inside.
  let scoped = null;
  await new Promise((done) =>
    runAsDemo(async () => {
      scoped = await new LazyQuery();
      done();
    }),
  );
  assert.equal(scoped, true);
});

test("nested: the broken form restores the DEMO scope, not no scope", async () => {
  // The nastiest version. Inside a demo request, reading the caller's own real
  // user row with the broken form reads demo rows instead — so the session
  // cannot resolve its own role and locks itself out of the screens the role
  // exists to open.
  let leaked = null;
  await new Promise((done) =>
    runAsDemo(async () => {
      leaked = await runWithoutDemo(() => new LazyQuery());
      done();
    }),
  );
  assert.equal(leaked, true, "demo scope leaks back in — this is the bug");
});

test("withoutDemo() suspends the scope even when nested in a demo request", async () => {
  let escaped = null;
  await new Promise((done) =>
    runAsDemo(async () => {
      escaped = await withoutDemo(() => new LazyQuery());
      done();
    }),
  );
  assert.equal(escaped, false, "the auth path must reach real rows");
});

test("withoutDemo() returns the resolved value, not the thenable", async () => {
  const value = await withoutDemo(() => Promise.resolve({ role: "admin" }));
  assert.deepEqual(value, { role: "admin" });
});
