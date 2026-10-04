// infra/lambda/release-watch/gate.test.mjs
//
// Run: node --test infra/lambda/release-watch/gate.test.mjs
//
// The watcher checks what LANDED on main (its first-parent line), not every
// commit a merge carries. Checking each carried commit on its own flagged old
// branch work that arrived inside an approved merge: 25-27 Sep 2026 sent the
// approver hourly alerts about 16-19 Sep commits that were never a problem.
import test from "node:test";
import assert from "node:assert/strict";
import { landedOnMain, newCommits, approvedByApprover } from "./gate.mjs";

const c = (sha, ...parents) => ({ sha, parents: parents.map((p) => ({ sha: p })), commit: { message: sha } });

// main: base -> m1 (merge of PR #10, carrying branch commits b1, b2)
//            -> d1 (direct push)  -> m2 (merge of PR #11, carrying b3)
const base = "base";
const commits = [c("b1", base), c("b2", "b1"), c("m1", base, "b2"), c("d1", "m1"), c("b3", "d1"), c("m2", "d1", "b3")];

test("only what landed on main is checked, oldest first", () => {
  assert.deepEqual(landedOnMain("m2", commits).map((x) => x.sha), ["m1", "d1", "m2"]);
});

test("the walk stops where the last vetted commit already covers main", () => {
  // Vetted up to m1: only d1 and m2 are new.
  const fresh = commits.filter((x) => ["d1", "b3", "m2"].includes(x.sha));
  assert.deepEqual(landedOnMain("m2", fresh).map((x) => x.sha), ["d1", "m2"]);
});

test("a vetted point off main's line (inside an old merge) still works", () => {
  // The live pointer on 27 Sep sat on a branch commit carried in by a merge.
  const fresh = commits.filter((x) => x.sha !== "b1");
  assert.deepEqual(landedOnMain("m2", fresh).map((x) => x.sha), ["m1", "d1", "m2"]);
});

test("a long backlog is read across pages, not cut at the first one", async () => {
  const pages = {
    1: { status: "ahead", total_commits: 3, commits: [c("a", "x"), c("b", "a")] },
    2: { status: "ahead", total_commits: 3, commits: [c("h", "b")] },
  };
  const seen = [];
  const get = async (path) => {
    seen.push(path);
    return pages[Number(/[?&]page=(\d+)/.exec(path)[1])];
  };
  const out = await newCommits("o/r", "x", "h", get);
  assert.deepEqual(out.commits.map((x) => x.sha), ["a", "b", "h"]);
  assert.equal(seen.length, 2);
  assert.deepEqual(landedOnMain("h", out.commits).map((x) => x.sha), ["a", "b", "h"]);
});

test("rewritten history is still reported", async () => {
  assert.equal(await newCommits("o/r", "x", "h", async () => null), null);
  assert.equal((await newCommits("o/r", "x", "h", async () => ({ status: "diverged", commits: [] }))).status, "diverged");
});

test("a direct push and an unapproved merge are still flagged; an approved merge passes", async () => {
  const get = async (path) => {
    if (path.endsWith("/commits/d1/pulls")) return [];
    if (path.endsWith("/commits/m1/pulls")) return [{ number: 10, merged_at: "t", base: { ref: "main" } }];
    if (path.endsWith("/commits/m2/pulls")) return [{ number: 11, merged_at: "t", base: { ref: "main" } }];
    if (path.includes("/pulls/10/reviews")) return [{ state: "APPROVED", user: { login: "RichardEnoch" } }];
    if (path.includes("/pulls/11/reviews")) return [{ state: "COMMENTED", user: { login: "RichardEnoch" } }];
    throw new Error(`unexpected ${path}`);
  };
  assert.deepEqual(await approvedByApprover("o/r", "m1", "richardenoch", get), { ok: true, pr: 10 });
  assert.deepEqual(await approvedByApprover("o/r", "d1", "richardenoch", get), { ok: false, pr: null });
  assert.deepEqual(await approvedByApprover("o/r", "m2", "richardenoch", get), { ok: false, pr: 11 });
});

test("a repo released from another branch checks pull requests into that branch", async () => {
  const get = async (path) => {
    if (path.endsWith("/commits/r1/pulls")) return [{ number: 7, merged_at: "t", base: { ref: "release" } }];
    if (path.includes("/pulls/7/reviews")) return [{ state: "APPROVED", user: { login: "RichardEnoch" } }];
    throw new Error(`unexpected ${path}`);
  };
  assert.deepEqual(await approvedByApprover("o/r", "r1", "richardenoch", get, "release"), { ok: true, pr: 7 });
  // The same approved PR does not count for a different release branch.
  assert.deepEqual(await approvedByApprover("o/r", "r1", "richardenoch", get), { ok: false, pr: null });
});
