// server/util/prospecting/writer.test.js
//
// The email writer's rules, and the drafting run. The model is a stand-in
// that returns scripted answers, so nothing is called and nothing is spent.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EM_DASH, FOOTER, OPT_OUT, SIGN_OFF, BRIEFS_PATH, buildWriterPrompt, checkDraft, checkEmail, checkSubject,
  composeEmails, loadBriefs, parseBriefs, parseEmails, stripSignOff, writeDraft, DraftRejected,
} from "./writer.js";
import { runDraftWriter } from "./drafter.js";
import { createStore } from "./store.js";
import { memoryModels } from "./memoryModels.js";
import { OutreachDraft } from "../../models/OutreachDraft.js";

const GOOD = {
  subject: "Your Ikeja mall cost plan",
  first: "Dear Tunde,\n\nI read about the cost plan your team prepared for the Ikeja retail mall. HERON measures from 2D drawings and scanned sheets and builds the bill of quantities as you go. Could we have a 20 minute call next week so I can show you on one of your own drawings?",
  followUp1: "Dear Tunde,\n\nA short addition to my last note. HERON also handles valuations and variations, so the measurement you do at tender carries into the post-contract work.",
  followUp2: "Dear Tunde,\n\nThis is my last note on this. If a 20 minute look at HERON would be useful later in the year, I would be glad to arrange it.",
};
const answer = (o) => `<emails>${JSON.stringify(o)}</emails>`;

/* ── the rules ──────────────────────────────────────────────────────── */

test("a plain, specific email with a 20 minute ask passes", () => {
  assert.deepEqual(checkDraft(GOOD), []);
});

test("an em dash is refused, in the body and the subject", () => {
  assert.equal(EM_DASH.charCodeAt(0), 0x2014);
  assert.ok(checkEmail(`We measure faster ${EM_DASH} and cheaper. A 20 minute call?`).some((p) => /em dash/.test(p)));
  assert.ok(checkEmail("We measure faster -- and cheaper. A 20 minute call?").some((p) => /em dash/.test(p)));
  assert.ok(checkSubject(`Takeoff ${EM_DASH} faster`).length);
  // A hyphen in a word is fine.
  assert.deepEqual(checkEmail("A 20-minute call about cost-planning?"), []);
});

test("the stock openers are refused", () => {
  for (const s of ["I hope this email finds you well.", "Hope you're well.", "I trust this email finds you in good health.", "I wanted to reach out about HERON."]) {
    assert.ok(checkEmail(`${s} Could we have a 20 minute call?`).some((p) => /stock opener/.test(p)), s);
  }
});

test("hype words, links and exclamation marks are refused", () => {
  const p = checkEmail("Our revolutionary, seamless tool! See https://adlm.example. 20 minute call?");
  assert.ok(p.some((x) => /Hype words: revolutionary, seamless/.test(x)));
  assert.ok(p.some((x) => /link/.test(x)));
  assert.ok(p.some((x) => /exclamation/.test(x)));
});

test("the first email must ask for a 20 minute call; follow-ups need not", () => {
  assert.ok(checkEmail("Would you like a demo sometime?", "first").some((p) => /20 minute/.test(p)));
  assert.deepEqual(checkEmail("One more useful point for you.", "followUp"), []);
  for (const s of ["a 20 minute call", "a 20-minute call", "20 min on Zoom", "20 minutes of your time"]) {
    assert.deepEqual(checkEmail(`Could we have ${s}?`, "first"), [], s);
  }
});

test("length limits: 150 words first, 90 for follow-ups", () => {
  const words = (n) => Array(n).fill("word").join(" ");
  assert.deepEqual(checkEmail(`${words(140)} 20 minute call?`, "first"), []);
  assert.ok(checkEmail(`${words(160)} 20 minute call?`, "first").some((p) => /Too long/.test(p)));
  assert.ok(checkEmail(words(95), "followUp").some((p) => /Too long/.test(p)));
});

test("the model may not write about the sender, or its own opt-out", () => {
  assert.ok(checkEmail("I work with Adedolapo Quasim at ADLM Studio. 20 minute call?").some((p) => /FROM Adedolapo/.test(p)));
  assert.ok(checkEmail("I am the CEO of ADLM Studio. 20 minute call?").some((p) => /FROM Adedolapo/.test(p)));
  assert.ok(checkEmail("20 minute call?\n\nReply 'stop' to opt out.").some((p) => /opt-out/.test(p)));
});

test("a first subject cannot be blank, long, shouty or a fake reply", () => {
  assert.ok(checkSubject("").length);
  assert.ok(checkSubject("x".repeat(61)).length);
  assert.ok(checkSubject("Big news!").length);
  assert.ok(checkSubject("Re: our chat").length);
});

/* ── composing ──────────────────────────────────────────────────────── */

test("every email ends with the sign-off and then the one-line opt-out", () => {
  const emails = composeEmails(GOOD);
  assert.equal(emails.length, 3);
  for (const e of emails) {
    assert.ok(e.body.endsWith(`${SIGN_OFF}\n\n${OPT_OUT}`));
    assert.ok(e.body.trim().split("\n").at(-1) === "Reply 'stop' and I won't email again.");
  }
  assert.equal(SIGN_OFF, "Adedolapo Quasim\nCEO, ADLM Studio");
});

test("follow-ups are threaded under the first subject on days 3 and 7", () => {
  const emails = composeEmails(GOOD);
  assert.deepEqual(emails.map((e) => [e.step, e.dayOffset, e.subject]), [
    [0, 0, "Your Ikeja mall cost plan"],
    [1, 3, "Re: Your Ikeja mall cost plan"],
    [2, 7, "Re: Your Ikeja mall cost plan"],
  ]);
});

test("a composed draft is valid for the OutreachDraft model", () => {
  const d = new OutreachDraft({ prospectId: "a".repeat(24), contactId: "b".repeat(24), profileId: "c".repeat(24), product: "heron", emails: composeEmails(GOOD) });
  assert.equal(d.validateSync(), undefined);
});

test("the footer adds no em dash, so a clean draft stays clean", () => {
  assert.ok(!FOOTER.includes(EM_DASH));
});

/* ── briefs ─────────────────────────────────────────────────────────── */

test("config/products.md has all five sections, and the writer never sees TODO lines", () => {
  const briefs = loadBriefs(BRIEFS_PATH);
  assert.deepEqual(Object.keys(briefs).sort(), ["about", "heron", "mep", "quiv", "rategen"]);
  for (const [k, b] of Object.entries(briefs)) {
    assert.ok(["placeholder", "draft", "ready"].includes(b.status), k);
    assert.ok(!/TODO/i.test(b.text), `${k} leaks a TODO`);
    assert.ok(!/^Status:/im.test(b.text), `${k} leaks its Status line`);
  }
});

test("a section with no Status line counts as placeholder", () => {
  assert.equal(parseBriefs("## QUIV\n\nSome text.").quiv.status, "placeholder");
  assert.equal(parseBriefs("## QUIV\n\nStatus: Ready\n\nText.").quiv.status, "ready");
});

test("the prompt carries the research and only the matched product's brief", () => {
  const { user } = buildWriterPrompt({
    prospect: { companyName: "Adeyemi QS", location: "Lagos", whatTheyDo: "Bills of quantities.", recentProjects: ["Ikeja mall"], matchedProduct: "heron" },
    contact: { name: "Tunde Adeyemi", title: "Managing Partner" },
    brief: "HERON BRIEF",
    about: "ABOUT BRIEF",
  });
  assert.match(user, /Greet them as: Tunde/);
  assert.match(user, /Ikeja mall/);
  assert.match(user, /HERON BRIEF/);
  assert.match(user, /ABOUT BRIEF/);
});

test("parseEmails needs all four fields", () => {
  assert.deepEqual(parseEmails(answer(GOOD)).subject, GOOD.subject);
  assert.throws(() => parseEmails(answer({ subject: "x", first: "y" })), /missing "followUp1"/);
  assert.throws(() => parseEmails("no tags"), /no <emails>/);
});

/* ── writing with retries ───────────────────────────────────────────── */

const prospect = { _id: "p1", domain: "a.example", companyName: "Adeyemi QS", matchedProduct: "heron", profileId: "prof", recentProjects: [] };
const contact = { _id: "c1", name: "Tunde Adeyemi", email: "t@a.example" };
const briefs = { about: { status: "ready", text: "About." }, heron: { status: "ready", text: "HERON." } };
const scripted = (...answers) => {
  const calls = [];
  const create = async (req) => {
    calls.push(req);
    return { text: answers.shift(), model: "test-model" };
  };
  return { create, calls };
};

test("a clean first answer is used as is, metered as prospect-email-draft", async () => {
  const { create, calls } = scripted(answer(GOOD));
  const out = await writeDraft({ prospect, contact, briefs, create });
  assert.equal(out.attempts, 1);
  assert.equal(calls[0].meta.feature, "prospect-email-draft");
  assert.equal(out.emails[0].subject, GOOD.subject);
});

test("a rule break is sent back once with the problems listed, and the rewrite is used", async () => {
  const bad = { ...GOOD, first: `I hope this email finds you well ${EM_DASH} quick one. 20 minute call?` };
  const { create, calls } = scripted(answer(bad), answer(GOOD));
  const out = await writeDraft({ prospect, contact, briefs, create });
  assert.equal(out.attempts, 2);
  const feedback = calls[1].messages.at(-1).content;
  assert.match(feedback, /em dash/);
  assert.match(feedback, /stock opener/);
});

test("a draft that still breaks the rules after the rewrite is not saved", async () => {
  const bad = { ...GOOD, first: "Our revolutionary tool. 20 minute call?" };
  const { create } = scripted(answer(bad), answer(bad));
  await assert.rejects(writeDraft({ prospect, contact, briefs, create }), DraftRejected);
});

test("no brief for the product is an error, not a vague email", async () => {
  const { create } = scripted(answer(GOOD));
  await assert.rejects(writeDraft({ prospect: { ...prospect, matchedProduct: "mep" }, contact, briefs, create }), /No product brief/);
});

/* ── the drafting run ───────────────────────────────────────────────── */

async function queued() {
  const models = memoryModels();
  const store = createStore(models);
  const { _id, ...fields } = prospect;
  const [p] = await models.Prospect.insertMany([{ ...fields, status: "new", foundDay: "2026-09-26", sources: [{ url: "https://a.example" }] }]);
  const [c] = await models.ProspectContact.insertMany([{ prospectId: p._id, name: "Tunde Adeyemi", email: "t@a.example", primary: true }]);
  return { models, store, p, c };
}

test("drafting puts the draft in the queue as pending_review and marks the prospect drafted", async () => {
  const { models, store, p } = await queued();
  const { create } = scripted(answer(GOOD));
  const r = await runDraftWriter({ store, briefs, create, log: () => {} });
  assert.equal(r.drafted.length, 1);
  assert.equal(models.OutreachDraft.rows[0].status, "pending_review");
  assert.equal(models.OutreachDraft.rows[0].emails.length, 3);
  assert.equal(models.Prospect.rows.find((x) => x._id === p._id).status, "drafted");
});

test("the live run skips a product whose brief is not marked ready", async () => {
  const { models, store } = await queued();
  const { create, calls } = scripted(answer(GOOD));
  const r = await runDraftWriter({ store, briefs: { ...briefs, heron: { status: "draft", text: "x" } }, create, log: () => {} });
  assert.equal(calls.length, 0, "no model call on a draft brief");
  assert.deepEqual(r.skipped.map((s) => s.reason), ["brief_draft"]);
  assert.match(models.Prospect.rows[0].statusNote, /HERON brief/);
});

test("a prospect without a primary contact is never drafted", async () => {
  const { models, store } = await queued();
  models.ProspectContact.rows[0].primary = false;
  const { create, calls } = scripted(answer(GOOD));
  await runDraftWriter({ store, briefs, create, log: () => {} });
  assert.equal(calls.length, 0);
});

test("an opt-out that lands while the model is writing wins", async () => {
  const { models, store } = await queued();
  const create = async () => {
    await store.optOut("t@a.example");
    return { text: answer(GOOD), model: "m" };
  };
  const r = await runDraftWriter({ store, briefs, create, log: () => {} });
  assert.deepEqual(r.skipped.map((s) => s.reason), ["suppressed"]);
  assert.equal(models.OutreachDraft.rows.length, 0);
});

test("running twice never makes a second draft for the same prospect", async () => {
  const { models, store } = await queued();
  await runDraftWriter({ store, briefs, create: scripted(answer(GOOD)).create, log: () => {} });
  models.Prospect.rows[0].status = "new"; // as if someone reset it
  const r = await runDraftWriter({ store, briefs, create: scripted(answer(GOOD)).create, log: () => {} });
  assert.deepEqual(r.skipped.map((s) => s.reason), ["already_drafted"]);
  assert.equal(models.OutreachDraft.rows.length, 1);
});

test("a failed draft is noted on the prospect and the run carries on", async () => {
  const { models, store } = await queued();
  const bad = answer({ ...GOOD, first: "No ask here." });
  const r = await runDraftWriter({ store, briefs, create: scripted(bad, bad).create, log: () => {} });
  assert.equal(r.failed.length, 1);
  assert.match(models.Prospect.rows[0].statusNote, /Draft failed: .*20 minute/);
  assert.equal(models.Prospect.rows[0].status, "new");
});

/* ── claims, greetings and stray sign-offs (from the first real preview) ── */

test("implied customers and unmeasured results are refused", () => {
  for (const s of [
    "We work with cost consultants like Kaduna Road.",
    "It suits firms like yours.",
    "Many university departments are finding students need this.",
    "Most QS firms find this useful.",
    "It saves hours on every bill.",
    "It speeds up takeoff considerably.",
  ]) {
    assert.ok(checkEmail(`${s} Could we have a 20 minute call?`).some((p) => /Only claim what the product brief states/.test(p)), s);
  }
  // Plain statements of what the product does are fine.
  assert.deepEqual(checkEmail("HERON measures from scanned sheets. Could we have a 20 minute call?"), []);
});

test("the first email's ask must be a question", () => {
  assert.ok(checkEmail("Would you be open to a 20 minute call.").some((p) => /question mark/.test(p)));
});

test("all three emails must open with the same greeting", () => {
  const mixed = { ...GOOD, followUp1: GOOD.followUp1.replace("Dear Tunde,", "Hi Tunde,") };
  assert.ok(checkDraft(mixed).some((p) => /greet differently/.test(p)));
  const none = { ...GOOD, followUp2: "Just one more note." };
  assert.ok(checkDraft(none).some((p) => /greeting line/.test(p)));
});

test("a stray sign-off is cut off in code instead of failing the draft", async () => {
  const signed = { ...GOOD, first: `${GOOD.first}\n\nBest regards,\nAdedolapo Quasim\nCEO, ADLM Studio`, followUp1: `${GOOD.followUp1}\n\nThanks,\nAdedolapo` };
  const { create, calls } = scripted(answer(signed));
  const out = await writeDraft({ prospect, contact, briefs, create });
  assert.equal(calls.length, 1, "no rewrite needed");
  assert.equal(out.emails[0].body.match(/Adedolapo Quasim/g).length, 1, "exactly one sign-off");
  assert.ok(!/Best regards/.test(out.emails[0].body));
});

test("stripping a sign-off never eats the body", () => {
  assert.equal(stripSignOff("Dear Tunde,\n\nThanks for the tender note last week.\n\nRegards,\nAdedolapo"), "Dear Tunde,\n\nThanks for the tender note last week.");
  assert.equal(stripSignOff("Dear Tunde,\n\nOne line."), "Dear Tunde,\n\nOne line.");
});

test("a follow-up may not invent which day the last email went", () => {
  assert.ok(checkEmail("I sent a note on Monday about RateGen.", "followUp").some((p) => /invents when/.test(p)));
  assert.deepEqual(checkEmail("Following my last note about RateGen.", "followUp"), []);
});

test("sign-offs in other shapes are cut off too", () => {
  for (const tail of ["Best,\nAdedolapo", "Warm regards,\nAdedolapo Quasim, CEO, ADLM Studio", "Regards\nAdedolapo Quasim\nCEO\nADLM Studio", "Yours faithfully,\nAdedolapo Quasim\nFounder and CEO"]) {
    assert.equal(stripSignOff(`Dear Bola,\n\nOne point.\n\n${tail}`), "Dear Bola,\n\nOne point.", tail);
  }
});

test("products are named as the brand writes them", async () => {
  const { productName } = await import("./writer.js");
  assert.equal(productName("rategen"), "RateGen");
  assert.equal(productName("heron"), "HERON");
});

test("claims seen in the second preview are refused", () => {
  for (const s of [
    "Many cost consultants I speak with spend weeks on this.",
    "Most estimating teams we speak with still use spreadsheets.",
    "I work with contractors pricing large tenders.",
    "It could save your commercial team real time.",
    "It typically saves that back and forth.",
    "We have built [RateGen] for you.",
  ]) {
    assert.ok(checkEmail(`${s} Could we have a 20 minute call?`).some((p) => /Only claim what the product brief states/.test(p)), s);
  }
});

test("ordinary sentences still pass the claim rules", () => {
  for (const s of [
    "RateGen has over 500 Nigerian materials built in.",
    "Your team can add its own materials to the library.",
    "I saw that you were shortlisted for the Abuja hospital tender.",
    "HERON works from scanned or photographed sheets.",
  ]) {
    assert.deepEqual(checkEmail(`${s} Could we have a 20 minute call?`), [], s);
  }
});

test("the prompt names the product plainly, with no brackets to copy", () => {
  const { user } = buildWriterPrompt({
    prospect: { companyName: "X", matchedProduct: "rategen", recentProjects: [] },
    contact: { name: "Bola Ade" },
    brief: "B",
    about: "A",
  });
  assert.match(user, /^Product name: RateGen$/m);
  assert.ok(!/\(RateGen\)|\[RateGen\]/.test(user));
});
