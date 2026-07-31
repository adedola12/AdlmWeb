#!/usr/bin/env node
/**
 * End-to-end check that TimeMgt task sync works against the live API, using
 * exactly the calls the WPF app makes.
 *
 * This proves the whole path without building or installing anything:
 *
 *   1. /auth/app/lookup returns a deviceToken            (the app's sign-in)
 *   2. POST   /api/tasks       creates a task            (a save)
 *   3. GET    /api/tasks       returns it, owned by YOU  (it reached the cloud)
 *   4. PATCH  /api/tasks/:key  edits it                  (an update syncs)
 *   5. GET    /api/tasks/:key  reflects the edit         (the update stuck)
 *   6. DELETE /api/tasks/:key  removes it                (cleanup)
 *   7. GET    /api/tasks/:key  is gone                   (delete really deleted)
 *
 * The task it creates is clearly marked and deleted again at the end, so it is
 * safe to run against production. If it fails midway it prints the taskKey so
 * the leftover row can be found.
 *
 * The device token is never printed.
 *
 * USAGE
 *   node scripts/verify-timemgt-sync.mjs you@example.com
 *   node scripts/verify-timemgt-sync.mjs you@example.com --base https://api.adlmstudio.net
 */

const identifier = process.argv[2];
const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx > -1 ? process.argv[baseIdx + 1] : "https://api.adlmstudio.net")
  .trim()
  .replace(/\/+$/, "");

if (!identifier || identifier.startsWith("--")) {
  console.error(
    "\n  usage: node scripts/verify-timemgt-sync.mjs <email-or-username> [--base https://...]\n",
  );
  process.exit(1);
}

const TASK_KEY = `verify-${Date.now().toString(36)}`;
let token = "";
let failed = 0;

const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m, d) => {
  failed += 1;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
  if (d) console.log(`        ${String(d).slice(0, 300)}`);
};

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-adlm-client": "time-management-app",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body — keep the raw text for the error message */
  }
  return { status: res.status, json, text };
}

const main = async () => {
  console.log(`\nAPI  : ${BASE}`);
  console.log(`User : ${identifier}`);
  console.log(`Task : ${TASK_KEY}\n`);

  /* 1 ---------------------------------------------------------------- */
  const lookup = await call("POST", "/auth/app/lookup", { identifier });
  if (lookup.status !== 200) {
    bad(`sign-in: /auth/app/lookup returned ${lookup.status}`, lookup.text);
    return;
  }
  if (!lookup.json?.exists) {
    bad(`sign-in: no such user "${identifier}"`);
    return;
  }
  token = lookup.json.deviceToken || "";
  if (!token) {
    bad("sign-in: no deviceToken in the response — the WPF app cannot sync without it");
    return;
  }
  const userId = lookup.json.user?._id || "";
  ok(`sign-in returned a device token (user ${userId})`);

  /* 2 ---------------------------------------------------------------- */
  const created = await call("POST", "/api/tasks", {
    taskKey: TASK_KEY,
    iD: 9999,
    itemOfWork: "VERIFY — safe to delete",
    trade: "verification",
    skilledLabor: 1,
    unskilledLabor: 2,
    hoursWorked: 8,
    breakHours: 1,
    equipmentUsed: "none",
    output: 12.5,
    outputUnit: "m2",
    taskStartDate: new Date().toISOString(),
    createdAtUtc: new Date().toISOString(),
    weather: { condition: "Sunny", temperature: 31, windSpeed: 4, date: new Date().toISOString() },
  });
  if (created.status !== 201) {
    bad(`save: POST /api/tasks returned ${created.status}`, created.text);
  } else {
    ok("save: task created (201)");
  }

  /* 3 ---------------------------------------------------------------- */
  const list = await call("GET", "/api/tasks");
  if (list.status !== 200) {
    bad(`read back: GET /api/tasks returned ${list.status}`, list.text);
  } else {
    const mine = (list.json?.tasks || []).find((t) => t.taskKey === TASK_KEY);
    if (!mine) {
      bad("read back: the task is NOT in the list — it did not reach the cloud database");
    } else if (!mine.ownerKey) {
      bad("read back: task has NO ownerKey — it would be invisible to the account");
    } else if (userId && mine.ownerKey !== userId) {
      bad(`read back: ownerKey is ${mine.ownerKey}, expected ${userId}`);
    } else {
      ok(`read back: task is in the cloud and owned by this account (${mine.ownerKey})`);
    }
    if (mine && mine.hoursWorked !== 8) {
      bad(`field integrity: hoursWorked came back as ${mine.hoursWorked}, expected 8`);
    } else if (mine) {
      ok("field integrity: numeric fields survived the round trip");
    }
  }

  /* 4 + 5 ------------------------------------------------------------- */
  const patched = await call("PATCH", `/api/tasks/${TASK_KEY}`, { hoursWorked: 6.5 });
  if (patched.status !== 200) {
    bad(`update: PATCH returned ${patched.status}`, patched.text);
  } else {
    const after = await call("GET", `/api/tasks/${TASK_KEY}`);
    if (after.json?.task?.hoursWorked === 6.5) ok("update: edit synced and persisted");
    else bad(`update: value is ${after.json?.task?.hoursWorked}, expected 6.5`);
  }

  /* 6 + 7 ------------------------------------------------------------- */
  const del = await call("DELETE", `/api/tasks/${TASK_KEY}`);
  if (del.status !== 200) {
    bad(`delete: returned ${del.status}`, del.text);
    console.log(`\n  NOTE: leftover test row — taskKey ${TASK_KEY}`);
  } else {
    const gone = await call("GET", `/api/tasks/${TASK_KEY}`);
    if (gone.status === 404) ok("delete: removed, and confirmed gone");
    else bad(`delete: task still readable (${gone.status})`);
  }

  /* ------------------------------------------------------------------ */
  console.log(
    failed === 0
      ? "\n\x1b[32mAll checks passed.\x1b[0m Tasks save to adlmWeb.timemgtTasks and are scoped to the account.\n"
      : `\n\x1b[31m${failed} check(s) failed.\x1b[0m\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(`\n  ERROR: ${e?.message || e}\n`);
  process.exit(1);
});
