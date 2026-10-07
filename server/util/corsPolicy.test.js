// server/util/corsPolicy.test.js
//
// A refused origin leaves exactly one "cors_rejected" line and gets the same
// 403 it always got, and nothing else gets a different answer or a line. Over
// real HTTP, through the real cors() policy index.js builds and the real error
// middleware it mounts, followed by copies of index.js's own error handlers;
// only the log writer and the clock are stand-ins.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import {
  buildCorsOptions,
  corsRejectionHandler,
  createCorsRejectionLog,
} from "./corsPolicy.js";

const PROD = { NODE_ENV: "production", API_BASE_URL: "https://api.adlmstudio.net", CORS_ORIGINS: "" };
const FIELDS = ["evt", "origin", "method", "path", "ua", "ip"];
const TOO_LARGE = "Payload too large. Increase server JSON limit or send only changed rows.";

/** index.js's error handler after corsRejectionHandler: 413 and 400 for a bad body. */
function bodyErrors(err, _req, res, next) {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: TOO_LARGE });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
  next(err);
}

/** index.js's error handler before the log line existed: the same, then a refusal matched by its words. */
function beforeHandler(err, req, res, next) {
  bodyErrors(err, req, res, (e) =>
    e && /Not allowed by CORS/.test(e.message) ? res.status(403).json({ error: e.message }) : next(e),
  );
}

/** The error handlers index.js mounts now, and the one it mounted before. */
const current = (log) => [corsRejectionHandler(log), bodyErrors];
const BEFORE = [beforeHandler];

/** index.js's order: cors(), the body parser, the routes, then `errors`, the 404 and the 500. */
async function serve({ env = PROD, errors }) {
  const app = express();
  app.use(cors(buildCorsOptions(env)));
  app.options(/.*/, cors(buildCorsOptions(env)));
  app.use(express.json({ limit: "1kb" }));
  app.all("/auth/login", (_req, res) => res.json({ ok: true }));
  // A route whose error quotes the URL, as a Mongoose lookup on a crafted id does.
  app.get("/items/:id", (req) => {
    throw new mongoose.Error.CastError("ObjectId", req.params.id, "_id");
  });
  for (const handler of errors) app.use(handler);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((_err, _req, res, _next) => res.status(500).json({ error: "Server error" }));
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    url: (p = "/auth/login") => `http://127.0.0.1:${srv.address().port}${p}`,
    close: () => new Promise((resolve) => srv.close(resolve)),
  };
}

/** A log whose lines land in `lines` and whose clock is `clock.t`. */
function capture(opts = {}) {
  const lines = [];
  const clock = { t: 1_000_000 };
  const log = createCorsRejectionLog({ now: () => clock.t, write: (l) => lines.push(l), ...opts });
  return { lines, clock, log };
}

test("a refused origin is logged once with the right fields, and still gets the same 403", async () => {
  const { lines, log } = capture();
  const api = await serve({ errors: current(log) });
  // index.js as it was before the log line existed, to compare with.
  const before = await serve({ errors: BEFORE });
  try {
    const req = {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0) TestBrowser/1.0",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "qs@firm.test" }),
    };
    const res = await fetch(api.url(), req);
    const old = await fetch(before.url(), req);

    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "Not allowed by CORS: https://evil.example" });
    assert.equal(old.status, 403);
    const strip = (h) => Object.fromEntries([...h].filter(([k]) => k !== "date"));
    assert.deepEqual(strip(res.headers), strip(old.headers), "same headers as before the log line");

    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes("\n"), "one line");
    assert.deepEqual(JSON.parse(lines[0]), {
      evt: "cors_rejected",
      origin: "https://evil.example",
      method: "POST",
      path: "/auth/login",
      ua: "Mozilla/5.0 (Windows NT 10.0) TestBrowser/1.0",
      ip: "203.0.113.9",
    });

    // A refused preflight is logged too, as OPTIONS: it is what a browser
    // sends first for a JSON POST, and the POST itself never follows.
    const pre = await fetch(api.url(), {
      method: "OPTIONS",
      headers: { origin: "https://other.example", "access-control-request-method": "POST" },
    });
    assert.equal(pre.status, 403);
    assert.deepEqual(await pre.json(), { error: "Not allowed by CORS: https://other.example" });
    assert.equal(lines.length, 2);
    const preLine = JSON.parse(lines[1]);
    assert.equal(preLine.origin, "https://other.example");
    assert.equal(preLine.method, "OPTIONS");
    assert.ok(preLine.ip, "falls back to req.ip without x-forwarded-for");
  } finally {
    await api.close();
    await before.close();
  }
});

test("repeated refusals from one origin log once a minute, and the next line says how many were held back", async () => {
  const { lines, clock, log } = capture();
  const api = await serve({ errors: current(log) });
  try {
    const hit = async (origin) => {
      const res = await fetch(api.url(), { method: "POST", headers: { origin } });
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: `Not allowed by CORS: ${origin}` });
    };

    for (let i = 0; i < 5; i++) await hit("https://evil.example");
    assert.equal(lines.length, 1, "five refusals, one line");
    assert.equal(JSON.parse(lines[0]).suppressed, undefined);

    // Another origin is not held back by the first one's window.
    await hit("https://other.example");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[1]).origin, "https://other.example");

    clock.t += 59_999;
    await hit("https://evil.example");
    assert.equal(lines.length, 2, "still inside the window");

    clock.t += 1;
    await hit("https://evil.example");
    assert.equal(lines.length, 3);
    const next = JSON.parse(lines[2]);
    assert.equal(next.origin, "https://evil.example");
    assert.equal(next.suppressed, 5, "four in the first burst plus one at 59.999 s");

    // The count starts again from the new line.
    await hit("https://evil.example");
    clock.t += 60_000;
    await hit("https://evil.example");
    assert.equal(lines.length, 4);
    assert.equal(JSON.parse(lines[3]).suppressed, 1);
  } finally {
    await api.close();
  }
});

test("allowed origins, the API's own origin and requests with no Origin log nothing", async () => {
  const { lines, log } = capture();
  const api = await serve({ errors: current(log) });
  const dev = await serve({ env: { NODE_ENV: "development", CORS_ORIGINS: "" }, errors: current(log) });
  try {
    for (const origin of ["https://adlmstudio.net", "https://www.adlmstudio.net", "https://api.adlmstudio.net"]) {
      const res = await fetch(api.url(), { method: "POST", headers: { origin } });
      assert.equal(res.status, 200, origin);
      assert.equal(res.headers.get("access-control-allow-origin"), origin);
      const pre = await fetch(api.url(), {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(pre.status, 204, origin);
    }
    // The desktop plugins, curl and server-to-server calls send no Origin.
    assert.equal((await fetch(api.url(), { method: "POST" })).status, 200);
    // Localhost outside production.
    assert.equal((await fetch(dev.url(), { headers: { origin: "http://localhost:5173" } })).status, 200);
    assert.deepEqual(lines, []);

    // And an unrelated error goes past the CORS middleware untouched and unlogged.
    const passed = [];
    corsRejectionHandler(log)(new Error("boom"), {}, {}, (e) => passed.push(e.message));
    assert.deepEqual(passed, ["boom"]);
    assert.deepEqual(lines, []);
  } finally {
    await api.close();
    await dev.close();
  }
});

test("the line carries no cookie, header, query or body values, and long values are cut", async () => {
  const { lines, log } = capture();
  const api = await serve({ errors: current(log) });
  try {
    const longOrigin = `https://${"a".repeat(300)}.example`;
    const res = await fetch(api.url("/auth/login?token=QUERY-SECRET&next=%2Fdashboard"), {
      method: "POST",
      headers: {
        origin: longOrigin,
        cookie: "refresh=COOKIE-SECRET; access=COOKIE-SECRET-2",
        authorization: "Bearer AUTH-SECRET",
        "x-admin-key": "ADMIN-SECRET",
        "x-adlm-client": "CLIENT-SECRET",
        "user-agent": `UA-${"u".repeat(500)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "BODY-SECRET" }),
    });
    assert.equal(res.status, 403);
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0], /SECRET|refresh=|Bearer|dashboard/);

    const line = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(line), FIELDS, "only the six fields");
    assert.equal(line.path, "/auth/login", "no query string");
    assert.equal(line.ua.length, 120);
    assert.ok(line.ua.startsWith("UA-uuu"));
    assert.equal(line.origin, longOrigin.slice(0, 200));
  } finally {
    await api.close();
  }
});

test("the default writer is one console.warn call with the JSON line", () => {
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args);
  try {
    const log = createCorsRejectionLog();
    const req = { method: "GET", path: "/me", ip: "198.51.100.7", headers: { origin: "https://evil.example" } };
    log(req);
    log(req);
  } finally {
    console.warn = original;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.deepEqual(JSON.parse(calls[0][0]), {
    evt: "cors_rejected",
    origin: "https://evil.example",
    method: "GET",
    path: "/me",
    ua: "",
    ip: "198.51.100.7",
  });
});

test("a client inventing origins cannot grow the map, and held-back counts survive the trim where they can", () => {
  const { lines, clock, log } = capture({ maxOrigins: 2 });
  const req = (origin) => ({ method: "GET", path: "/", ip: "127.0.0.1", headers: { origin } });

  log(req("https://a.example"));
  log(req("https://b.example"));
  clock.t += 1;
  log(req("https://b.example")); // held back: b now has one pending
  clock.t += 60_000;
  // Full: a's window is over with nothing pending, so a goes, and b stays.
  log(req("https://c.example"));
  log(req("https://b.example"));
  assert.equal(JSON.parse(lines.at(-1)).suppressed, 1, "b's count was kept");

  // Nothing is over now, so the longest-unlogged (c) makes room for d; c is
  // then a stranger again and logs straight away.
  log(req("https://d.example"));
  log(req("https://c.example"));
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).origin),
    ["https://a.example", "https://b.example", "https://c.example", "https://b.example", "https://d.example", "https://c.example"],
  );

  // A map with room for none still keeps one, rather than trimming forever.
  const tiny = capture({ maxOrigins: 0 });
  tiny.log(req("https://a.example"));
  tiny.log(req("https://b.example"));
  assert.equal(tiny.lines.length, 2);
});

test('a body that says "Not allowed by CORS" is still a bad body: the same 400 or 413 as before, and no line', async () => {
  const { lines, log } = capture();
  // Sees each error on its way in, to show the parse error really quotes the body.
  const messages = [];
  const spy = (err, _req, _res, next) => {
    messages.push(err.message);
    next(err);
  };
  const api = await serve({ errors: [spy, ...current(log)] });
  const before = await serve({ errors: BEFORE });
  try {
    const cases = [
      // Refused by body-parser's strict check, before JSON.parse runs.
      { body: "Not allowed by CORS", status: 400, error: "Invalid JSON body.", quoted: true },
      // Refused by JSON.parse itself, which quotes a source this short in full.
      { body: "[Not allowed by CORS", status: 400, error: "Invalid JSON body.", quoted: true },
      // Over the limit: never parsed at all.
      { body: JSON.stringify({ note: "Not allowed by CORS ".repeat(100) }), status: 413, error: TOO_LARGE },
    ];
    // No Origin (the desktop plugins, curl) and the site's own origin.
    for (const origin of [undefined, "https://adlmstudio.net"]) {
      for (const c of cases) {
        const init = {
          method: "POST",
          headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
          body: c.body,
        };
        messages.length = 0;
        const res = await fetch(api.url(), init);
        const old = await fetch(before.url(), init);
        const what = `${c.body.slice(0, 30)} from ${origin ?? "no Origin"}`;
        assert.equal(res.status, c.status, what);
        assert.deepEqual(await res.json(), { error: c.error }, what);
        assert.equal(old.status, c.status, what);
        assert.deepEqual(await old.json(), { error: c.error }, what);
        if (c.quoted) assert.match(messages[0], /Not allowed by CORS/, `${what}: the parse error quotes the body`);
      }
    }
    assert.deepEqual(lines, [], "no false refusal in the log");
  } finally {
    await api.close();
    await before.close();
  }
});

test("an error that only quotes the words keeps the 403 it always had, but writes no line", async () => {
  const { lines, log } = capture();
  const api = await serve({ errors: current(log) });
  const before = await serve({ errors: BEFORE });
  try {
    // A crafted id: the route's CastError quotes it, and has no body-parser `type`.
    const init = { headers: { origin: "https://adlmstudio.net" } };
    const res = await fetch(api.url("/items/Not%20allowed%20by%20CORS"), init);
    const old = await fetch(before.url("/items/Not%20allowed%20by%20CORS"), init);
    assert.equal(res.status, 403);
    assert.equal(old.status, 403);
    const body = await res.json();
    assert.deepEqual(body, await old.json(), "the same answer as before");
    assert.match(body.error, /^Cast to ObjectId failed for value "Not allowed by CORS"/);
    assert.deepEqual(lines, [], "no false refusal of the site's own origin");
  } finally {
    await api.close();
    await before.close();
  }
});

test("a writer that throws never changes the answer, and only the policy's own refusal reaches the writer", async () => {
  const answer = (handler, err) => {
    let sent;
    const res = {
      status(code) {
        sent = { code };
        return this;
      },
      json(body) {
        sent.body = body;
        return this;
      },
    };
    handler(err, { headers: {} }, res, () => assert.fail("next"));
    return sent;
  };
  let calls = 0;
  const handler = corsRejectionHandler(() => {
    calls += 1;
    throw new Error("log sink down");
  });

  // The error the real origin check hands to cors().
  const refusal = await new Promise((resolve) => buildCorsOptions(PROD).origin("https://evil.example", resolve));
  assert.deepEqual(answer(handler, refusal), { code: 403, body: { error: "Not allowed by CORS: https://evil.example" } });
  assert.equal(calls, 1, "the writer ran, and threw");

  // The same words in an error the policy did not raise: the same 403, no call.
  const lookalike = new Error("Not allowed by CORS: https://adlmstudio.net");
  assert.deepEqual(answer(handler, lookalike), { code: 403, body: { error: lookalike.message } });
  assert.equal(calls, 1);
});

test("index.js mounts the handler after cors() and ahead of its other error handlers, and answers a refusal nowhere else", () => {
  // index.js cannot be imported here (it connects to the database), so the
  // order the tests above rebuild is checked against its source instead.
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js"), "utf8");
  const at = (needle) => {
    const i = src.indexOf(needle);
    assert.notEqual(i, -1, `index.js has ${needle}`);
    return i;
  };
  at('import { buildCorsOptions, corsRejectionHandler } from "./util/corsPolicy.js";');
  const corsAt = at("app.use(cors(corsOptions));");
  const handlerAt = at("app.use(corsRejectionHandler());");
  const firstErrorHandlerAt = at("app.use((err,");
  assert.ok(corsAt < handlerAt, "after cors()");
  assert.ok(handlerAt < firstErrorHandlerAt, "before the other error handlers");
  // The 413 and 400 that bodyErrors above copies are still there, after it.
  assert.ok(handlerAt < at('err?.type === "entity.too.large"'), "413 after it");
  assert.ok(handlerAt < at('err?.type === "entity.parse.failed"'), "400 after it");
  at(`"${TOO_LARGE}"`);
  at('res.status(400).json({ error: "Invalid JSON body." })');
  assert.equal(src.split("corsRejectionHandler()").length - 1, 1, "mounted once");
  assert.doesNotMatch(src, /\/Not allowed by CORS\//, "no second place answers a refusal");
});
