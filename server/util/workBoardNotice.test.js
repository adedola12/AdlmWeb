// server/util/workBoardNotice.test.js — the approver email waits for the board page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardPageIsLive, bundleHasBoardRoute, entryScriptPath, proposalMail } from "./workBoardNotice.js";

const SHELL = '<html><head><script type="module" crossorigin src="/assets/index-C98biTS9.js"></script></head></html>';
const fakeFetch = (pages) => async (url) => {
  const path = new URL(url).pathname;
  if (!(path in pages)) return { ok: false, text: async () => "" };
  return { ok: true, text: async () => pages[path] };
};

test("finds the entry bundle in the SPA shell", () => {
  assert.equal(entryScriptPath(SHELL), "/assets/index-C98biTS9.js");
  assert.equal(entryScriptPath("<html></html>"), null);
});

test("the board route is recognised in the bundle, and only that route", () => {
  assert.ok(bundleHasBoardRoute('{path:"admin/work",lazy:()=>import("./WorkBoard")}'));
  assert.ok(!bundleHasBoardRoute('{path:"admin/workshops"},{path:"admin/releases"}'));
});

test("not live while the bundle lacks the route (the 26 Sep 404)", async () => {
  const f = fakeFetch({ "/": SHELL, "/assets/index-C98biTS9.js": '"admin/releases"' });
  assert.equal(await boardPageIsLive({ fetchImpl: f, base: "https://x.test" }), false);
});

test("live once the bundle carries the route", async () => {
  const f = fakeFetch({ "/": SHELL, "/assets/index-C98biTS9.js": '"admin/work"' });
  assert.equal(await boardPageIsLive({ fetchImpl: f, base: "https://x.test" }), true);
});

test("any failure reads as not live, so the email is held", async () => {
  assert.equal(await boardPageIsLive({ fetchImpl: async () => { throw new Error("offline"); }, base: "https://x.test" }), false);
  assert.equal(await boardPageIsLive({ fetchImpl: fakeFetch({ "/": SHELL }), base: "https://x.test" }), false);
});

test("held proposals go out together in one email", () => {
  const one = proposalMail([{ title: "A", submittedBy: "a@x", businessCase: { problem: "p" } }]);
  assert.match(one.subject, /^New proposal for your approval: A$/);
  const two = proposalMail([{ title: "A", submittedBy: "a@x" }, { title: "B <b>", submittedBy: "b@x" }]);
  assert.equal(two.subject, "2 new proposals for your approval");
  assert.ok(two.lines.some((l) => l.includes("B &lt;b&gt;")));
  assert.match(two.cta.href, /\/admin\/work$/);
});
