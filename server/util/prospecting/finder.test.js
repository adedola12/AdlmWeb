// server/util/prospecting/finder.test.js
//
// The prospect finder: parsing Claude's research, picking contacts, and the
// daily run. Uses the recorded sample responses and the in-memory models, so
// no API key, no spend and no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildResearchRequest, collectSearchedUrls, extractCompaniesJson, parseResearch, researchCompanies, researchCostUsd, runResearchCall, urlKey } from "./research.js";
import { pickContacts, titleScore, toContact } from "./hunter.js";
import { runProspectFinder, runFailed } from "./finder.js";
import { createStore } from "./store.js";
import { memoryModels } from "./memoryModels.js";
import { SEED_PROFILES } from "../../config/prospectingProfiles.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(fs.readFileSync(path.join(dir, "fixtures", "research.sample.json"), "utf8")).responses;
const qsProfile = { _id: "p-qs", ...SEED_PROFILES[0] };
const NOON_LAGOS = new Date("2026-09-26T11:00:00Z");

/* ── the research request ───────────────────────────────────────────── */

test("the request uses current web search, Nigeria, adaptive thinking and a refusal fallback", () => {
  const body = buildResearchRequest({ profile: qsProfile, want: 7, knownDomains: ["old.example"] });
  const tool = body.tools[0];
  assert.equal(tool.type, "web_search_20260209");
  assert.equal(tool.user_location.country, "NG");
  assert.equal(tool.user_location.timezone, "Africa/Lagos");
  assert.ok(tool.max_uses >= 1 && tool.max_uses <= 20);
  assert.deepEqual(body.thinking, { type: "adaptive" });
  assert.equal(body.fallbacks, "default");
  assert.equal(body.model, "claude-opus-5");
  const prompt = body.messages[0].content;
  assert.match(prompt, /QS consultancies in Lagos and Abuja/);
  assert.match(prompt, /old\.example/);
  assert.match(prompt, /up to 7/);
});

/* ── parsing and the hallucination guard ────────────────────────────── */

test("URLs compare without fragment, trailing slash or case", () => {
  assert.equal(urlKey("https://A.example/x/#top"), urlKey("https://a.example/x"));
  assert.equal(urlKey("not a url"), null);
});

test("every searched URL is collected, including from citations", () => {
  const urls = collectSearchedUrls([
    ...SAMPLE["qs-consultancies-lagos-abuja"].content,
    { type: "text", text: "x", citations: [{ type: "web_search_result_location", url: "https://cited.example/p", title: "Cited" }] },
  ]);
  assert.ok(urls.has(urlKey("https://adeyemi-qs.example/about")));
  assert.ok(urls.has(urlKey("https://cited.example/p")));
});

test("a company whose sources were never searched is dropped, not stored", () => {
  const { candidates, dropped } = parseResearch(SAMPLE["qs-consultancies-lagos-abuja"].content);
  assert.ok(!candidates.some((c) => c.companyName.startsWith("Unverified")));
  assert.deepEqual(dropped.map((d) => d.reason), ["no_verified_source"]);
});

test("kept sources are only the verified ones, deduplicated", () => {
  const { candidates } = parseResearch(SAMPLE["qs-consultancies-lagos-abuja"].content);
  const adeyemi = candidates.find((c) => c.companyName.startsWith("Adeyemi"));
  assert.equal(adeyemi.sources.length, 2);
  assert.ok(adeyemi.sources.every((s) => s.url.startsWith("https://adeyemi-qs.example/")));
  assert.ok(adeyemi.sources[0].title.length > 0);
});

test("the last <companies> block wins, and a missing one is an error", () => {
  const blocks = [{ type: "text", text: '<companies>[{"a":1}]</companies> then <companies>[]</companies>' }];
  assert.deepEqual(extractCompaniesJson(blocks), []);
  assert.throws(() => extractCompaniesJson([{ type: "text", text: "no tags" }]), /no <companies>/);
});

test("cost is tokens plus one cent per search", () => {
  const cost = researchCostUsd({ model: "claude-opus-5", usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, searches: 10 } });
  assert.equal(cost, 5.1);
});

test("sample mode needs no key and makes no network call", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = await researchCompanies({ profile: qsProfile, want: 5, mode: "sample", fetchImpl: () => { throw new Error("network used"); } });
    assert.equal(r.candidates.length, 3);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

/* ── the API loop ───────────────────────────────────────────────────── */

const reply = (data) => async () => ({ ok: true, json: async () => data });

test("a paused search turn is resumed with the assistant turn and no new user message", async () => {
  const bodies = [];
  const answers = [
    { stop_reason: "pause_turn", content: [{ type: "server_tool_use", name: "web_search", id: "s1", input: {} }], usage: { input_tokens: 10, output_tokens: 1 } },
    { stop_reason: "end_turn", content: [{ type: "text", text: "<companies>[]</companies>" }], usage: { input_tokens: 20, output_tokens: 2, server_tool_use: { web_search_requests: 3 } } },
  ];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return reply(answers.shift())();
  };
  const out = await runResearchCall({ model: "claude-opus-5", messages: [{ role: "user", content: "go" }] }, { fetchImpl });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1].messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(out.usage.inputTokens, 30);
  assert.equal(out.usage.searches, 4); // 1 counted from blocks + 3 reported
  assert.equal(out.blocks.length, 2);
});

test("a refusal is an error, never an empty result", async () => {
  const fetchImpl = reply({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] });
  await assert.rejects(runResearchCall({ messages: [] }, { fetchImpl }), /declined.*cyber/);
});

test("an API error surfaces its message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "credit balance is too low" } }) });
  await assert.rejects(runResearchCall({ messages: [] }, { fetchImpl }), /credit balance/);
});

/* ── contacts ───────────────────────────────────────────────────────── */

const person = (title, confidence, extra = {}) => ({ email: `${title.replace(/\W/g, "").toLowerCase()}@f.example`, title, confidence, type: "personal", ...extra });

test("a full title match outranks a partial one", () => {
  const targets = ["Managing Partner", "Director"];
  assert.ok(titleScore("Managing Partner", targets) > titleScore("Partner", targets));
  assert.equal(titleScore("Site Engineer", targets), 0);
});

test("only matching titles are kept, best first, generic and low-confidence never", () => {
  const picked = pickContacts(
    [person("Site Engineer", 99), person("Director", 80), person("Managing Partner", 75), person("Info", 99, { type: "generic" }), person("Senior Partner", 50)],
    ["Managing Partner", "Director", "Senior Partner"],
    { floor: 70 },
  );
  assert.deepEqual(picked.map((c) => c.title), ["Managing Partner", "Director"]);
});

test("when no title matches, only the single most confident person is kept", () => {
  const picked = pickContacts([person("Site Engineer", 90), person("Accountant", 95)], ["Director"], { floor: 70 });
  assert.deepEqual(picked.map((c) => c.title), ["Accountant"]);
});

test("Hunter records keep their public sources", () => {
  const c = toContact({ value: "a@f.example", first_name: "Ade", last_name: null, position: "Director", confidence: 91, type: "personal", sources: [{ uri: "https://f.example/team" }] });
  assert.equal(c.name, "Ade");
  assert.deepEqual(c.source.urls, ["https://f.example/team"]);
  assert.equal(c.source.provider, "hunter");
});

/* ── the daily run ──────────────────────────────────────────────────── */

async function sampleRun({ cap = 20, profiles = SEED_PROFILES, research, findContacts } = {}) {
  const models = memoryModels();
  await models.IdealCustomerProfile.insertMany(profiles.map((p) => ({ ...p, active: true })));
  const store = createStore(models);
  const report = await runProspectFinder({
    store,
    loadProfiles: () => models.IdealCustomerProfile.find({ active: true }).lean(),
    research: research || ((a) => researchCompanies({ ...a, mode: "sample" })),
    findContacts: findContacts || ((d) => import("./hunter.js").then((h) => h.domainSearch(d, { mode: "sample" }))),
    now: NOON_LAGOS,
    cap,
    log: () => {},
  });
  return { models, report };
}

test("a sample run adds each firm once, with a primary contact where one exists", async () => {
  const { models, report } = await sampleRun();
  assert.equal(report.added, 6);
  assert.equal(models.Prospect.rows.length, 6);
  assert.equal(new Set(models.Prospect.rows.map((p) => p.domain)).size, 6);
  const contractors = report.profiles.find((p) => p.profile === "contractors-nigeria");
  assert.ok(contractors.skipped.some((s) => s.domain === "adeyemi-qs.example" && s.reason === "already_a_prospect"));
  const primaries = models.ProspectContact.rows.filter((c) => c.primary);
  assert.equal(primaries.length, 5); // the polytechnic has nobody
  assert.equal(models.Prospect.rows.find((p) => p.domain === "qs.sample-poly.example").statusNote, "No contact found.");
});

test("the daily cap holds across the whole run", async () => {
  const { models, report } = await sampleRun({ cap: 3 });
  assert.equal(models.Prospect.rows.length, 3);
  assert.equal(report.added, 3);
});

test("the cap is shared: the first profile cannot take the whole day", async () => {
  const { report } = await sampleRun({ cap: 3 });
  assert.equal(report.profiles[0].share, 1);
  assert.equal(report.profiles[0].added.length, 1);
  assert.ok(report.profiles.slice(1).some((p) => p.added.length > 0));
});

test("with the cap already used, no research call is made at all", async () => {
  let calls = 0;
  const { report } = await sampleRun({ cap: 0, research: async () => { calls++; return { candidates: [] }; } });
  assert.equal(calls, 0);
  assert.ok(report.profiles.every((p) => p.skippedReason === "daily_cap"));
});

test("one profile failing does not stop the others, and the run is not marked failed", async () => {
  const { report } = await sampleRun({
    research: async (a) => {
      if (a.profile.key === "contractors-nigeria") throw new Error("credit balance is too low");
      return researchCompanies({ ...a, mode: "sample" });
    },
  });
  assert.equal(report.errors.length, 1);
  assert.ok(report.added > 0);
  assert.equal(runFailed(report), false);
});

test("every profile failing marks the run failed, so the job alarm fires", async () => {
  const { report } = await sampleRun({ research: async () => { throw new Error("no key"); } });
  assert.equal(runFailed(report), true);
});

test("a contact search failure is noted on the prospect, and the run carries on", async () => {
  const { models, report } = await sampleRun({ findContacts: async () => { throw new Error("Hunter 429"); } });
  assert.equal(report.added, 6);
  assert.ok(models.Prospect.rows.every((p) => /Contact search failed: Hunter 429/.test(p.statusNote)));
});
