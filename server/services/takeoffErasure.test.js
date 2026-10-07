// server/services/takeoffErasure.test.js
//
// Deleting a user deletes their Takeoff Time Log records (privacy policy,
// "Take-off timing"). The hooks are exercised as mongoose would run them, with
// the two deletes stubbed, so no database is needed.
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { TakeoffSession } from "../models/TakeoffSession.js";
import { TakeoffCalibration } from "../models/TakeoffCalibration.js";
import { eraseTakeoffRecords, registerTakeoffErasure } from "./takeoffErasure.js";
import { User } from "../models/User.js";

const A = new mongoose.Types.ObjectId();
const B = new mongoose.Types.ObjectId();

function stubDeletes() {
  const calls = { sessions: [], calibrations: [] };
  mock.method(TakeoffSession, "deleteMany", async (filter) => {
    calls.sessions.push(filter);
    return { deletedCount: filter.userId.$in.length * 3 };
  });
  mock.method(TakeoffCalibration, "deleteMany", async (filter) => {
    calls.calibrations.push(filter);
    return { deletedCount: filter.userId.$in.length };
  });
  return calls;
}

afterEach(() => mock.restoreAll());

/** A schema stand-in that records what registerTakeoffErasure hooks. */
function captureHooks() {
  const hooks = [];
  const schema = {
    pre: (op, opts, fn) => hooks.push({ when: "pre", op, opts, fn }),
    post: (op, opts, fn) => hooks.push({ when: "post", op, opts, fn }),
  };
  registerTakeoffErasure(schema);
  const find = (when, op, query) => hooks.find((h) => h.when === when && h.op === op && h.opts.query === query);
  return { hooks, find };
}

test("erases a user's sessions and calibration answers", async () => {
  const calls = stubDeletes();
  const gone = await eraseTakeoffRecords([A]);
  assert.deepEqual(gone, { sessions: 3, calibrations: 1 });
  assert.equal(String(calls.sessions[0].userId.$in[0]), String(A));
  assert.equal(String(calls.calibrations[0].userId.$in[0]), String(A));
});

test("nothing to erase: no delete is sent", async () => {
  const calls = stubDeletes();
  assert.deepEqual(await eraseTakeoffRecords([]), { sessions: 0, calibrations: 0 });
  assert.deepEqual(await eraseTakeoffRecords(["not-an-id"]), { sessions: 0, calibrations: 0 });
  assert.equal(calls.sessions.length, 0);
});

test("every mongoose way of deleting a user is hooked", () => {
  const { find } = captureHooks();
  for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"]) {
    assert.ok(find("pre", op, true), `${op}: no pre hook`);
    assert.ok(find("post", op, true), `${op}: no post hook`);
  }
  // A document's own deleteOne (user.deleteOne()).
  assert.ok(find("post", "deleteOne", false), "document deleteOne: no post hook");
});

test("a query delete erases the users it matched, after the delete", async () => {
  const calls = stubDeletes();
  const { find } = captureHooks();
  const query = {
    getFilter: () => ({ email: /@gone\.com$/ }),
    model: { find: () => ({ distinct: async () => [A, B] }) },
  };

  await find("pre", "deleteMany", true).fn.call(query);
  assert.equal(calls.sessions.length, 0, "nothing is erased before the delete runs");

  await find("post", "deleteMany", true).fn.call(query);
  assert.deepEqual(calls.sessions[0].userId.$in.map(String), [String(A), String(B)]);
  assert.deepEqual(calls.calibrations[0].userId.$in.map(String), [String(A), String(B)]);
});

test("a delete that matched no user erases nothing", async () => {
  const calls = stubDeletes();
  const { find } = captureHooks();
  const query = { getFilter: () => ({}), model: { find: () => ({ distinct: async () => [] }) } };
  await find("pre", "findOneAndDelete", true).fn.call(query);
  await find("post", "findOneAndDelete", true).fn.call(query);
  assert.equal(calls.sessions.length, 0);
});

test("a document's own deleteOne erases that user", async () => {
  const calls = stubDeletes();
  const { find } = captureHooks();
  await find("post", "deleteOne", false).fn.call({ _id: A });
  assert.equal(String(calls.sessions[0].userId.$in[0]), String(A));
});

test("the real User model carries the hooks", () => {
  // Kareem keeps a model's hooks by operation name; ours are there alongside any others.
  const pres = User.schema.s.hooks._pres;
  const posts = User.schema.s.hooks._posts;
  for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"]) {
    assert.ok((pres.get(op) || []).length > 0, `User: no pre ${op} hook`);
    assert.ok((posts.get(op) || []).length > 0, `User: no post ${op} hook`);
  }
});
