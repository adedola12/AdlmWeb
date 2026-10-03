// The server's copy of the live-tip rules must say exactly what the client's
// says: Ada's project_tips tool and the strip on the work-project tabs are the
// same advice, and two copies that drift would have her contradict the page.
//
// Same pattern as routes/me.projectsRollup.test.js: the test imports the
// client module directly; the runtime code never does.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as server from "./projectTips.js";

const NOW = new Date("2026-10-03T09:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const FIXTURES = [
  {},
  { items: [{ qty: 1, rate: 0 }, { qty: 2, rate: 5 }] },
  { _ratesMasked: true, items: [{ qty: 1, rate: 0 }], budgetItems: [{ qty: 1, rate: 0 }] },
  {
    contract: { locked: true, lockedAt: daysAgo(60) },
    items: [{ qty: 1, rate: 10, percentComplete: 10, percentCompleteUpdatedAt: daysAgo(20), actualRate: 20 }],
    budgetItems: [{ qty: 2, rate: 0 }],
    projectManagement: { tasks: [{ name: "t", endDate: daysAgo(2), percentComplete: 0 }] },
  },
  {
    contract: { locked: true, lockedAt: daysAgo(30) },
    items: [{ qty: 1, rate: 10 }],
    valuationEvents: [{ markedAt: daysAgo(15) }],
  },
  { finalAccount: { finalized: true }, items: [{ qty: 1, rate: 10, completed: true, completedAt: daysAgo(1) }] },
];

test("server tips match the client tips on every fixture, tab and edit right", async () => {
  const client = await import("../../client/src/features/tips/tipsModel.js");
  assert.equal(server.STALL_DAYS, client.STALL_DAYS);
  assert.equal(server.OVERSPEND_RATIO, client.OVERSPEND_RATIO);
  for (const p of FIXTURES) {
    for (const tab of ["", "overview", "bill", "rates", "pm"]) {
      for (const canEdit of [true, false]) {
        const opts = { now: NOW, tab, canEdit };
        assert.deepEqual(server.projectTips(p, opts), client.projectTips(p, opts), JSON.stringify({ p, opts }));
      }
    }
  }
});

test("server tips: a stalled, overspent, unprogrammed job says so", () => {
  const ids = server.projectTips(FIXTURES[3], { now: NOW }).map((t) => t.id);
  assert.deepEqual(ids, ["overspend", "stalled", "overdue-tasks", "budget-zero"]);
});
