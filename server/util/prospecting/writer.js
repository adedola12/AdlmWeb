// server/util/prospecting/writer.js
//
// Writes the three outreach emails for one prospect contact: a first email and
// follow-ups for day 3 and day 7. Goes through aiClient.createMessage, so it
// runs on AGENT_PROVIDER (Bedrock) and is metered as "prospect-email-draft".
//
// The writing rules are enforced in CODE, not only in the prompt:
//   - checkEmail() rejects em dashes, the banned openers, hype words, links,
//     exclamation marks, over-long emails, and a first email with no 20 minute
//     call ask. A draft that breaks a rule is sent back once with the list of
//     problems; if the second attempt still breaks one, no draft is saved.
//   - The sign-off and the opt-out line are never written by the model. Code
//     appends them to every email, so they are always present and always
//     worded exactly the same.
//   - Follow-up subjects are "Re: <first subject>", so phase 2's Sender keeps
//     the three in one thread.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Built from its code point, never typed, so a find-and-replace sweep of em
// dashes across the codebase can never silently delete the check below.
export const EM_DASH = String.fromCharCode(0x2014);

export const SIGN_OFF = "Adedolapo Quasim\nCEO, ADLM Studio";
export const OPT_OUT = "Reply 'stop' and I won't email again.";
export const FOOTER = `\n\n${SIGN_OFF}\n\n${OPT_OUT}`;
const MAX_ATTEMPTS = 2;

export const BRIEFS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "config", "products.md");

/* ───────────────────────────── product briefs ───────────────────────────── */

const SECTION_KEYS = { "about adlm studio": "about", quiv: "quiv", heron: "heron", mep: "mep", rategen: "rategen" };

/**
 * config/products.md → { about, quiv, heron, mep, rategen }, each
 * { status, text }. `text` has the Status line and every TODO line removed:
 * the writer must never see an instruction meant for the person editing.
 */
export function parseBriefs(markdown) {
  const out = {};
  const parts = String(markdown).split(/^## +/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = part.slice(0, nl).trim().toLowerCase();
    const key = SECTION_KEYS[heading];
    if (!key) continue;
    const body = part.slice(nl + 1);
    const status = (body.match(/^Status:\s*(\w+)/im)?.[1] || "placeholder").toLowerCase();
    const text = body
      .split("\n")
      .filter((l) => !/^Status:/i.test(l.trim()))
      .join("\n")
      .split(/\n\s*\n/)
      .filter((para) => !/^\s*TODO:/i.test(para))
      .join("\n\n")
      .trim();
    out[key] = { status, text };
  }
  return out;
}

export function loadBriefs(file = BRIEFS_PATH) {
  return parseBriefs(fs.readFileSync(file, "utf8"));
}

/* ───────────────────────────── the rules ───────────────────────────── */

const BANNED_OPENERS = [
  /hope (this|my) (email|message|note) finds you/i,
  /hope you('| a)re (well|doing well)/i,
  /trust this (email|message) finds you/i,
  /i am writing to (introduce|reach out)/i,
  /\bi wanted to reach out\b/i,
];
const HYPE = [
  "revolutionary", "revolutionise", "revolutionize", "game-changer", "game changer", "cutting-edge",
  "cutting edge", "world-class", "best-in-class", "state-of-the-art", "seamless", "seamlessly",
  "synergy", "unlock", "supercharge", "skyrocket", "effortless", "next-level", "disrupt",
  "transform your", "guaranteed", "amazing", "incredible",
];

// Claims the writer has no grounds for: an implied customer base, or results
// the brief does not state. The brief is the only source of claims.
const UNSUPPORTED = [
  [/\b(i|we) (already )?work with\b/i, "implies existing customers"],
  [/\b(clients|customers|firms|departments) like (yours|you)\b/i, "implies existing customers"],
  [/\b(i|we) (speak|talk|deal) with\b/i, "implies existing customers"],
  // "many cost consultants", "most estimating teams we speak with": up to
  // three words between the quantifier and the noun.
  [/\b(many|most|several|other)\s+(\w+\s+){0,3}?(firms|companies|consultan\w*|departments|contractors|universities|surveyors|qss|teams|clients|customers|practices)\b/i, "claims what other firms do"],
  [/\b(save|saves|saving|cut|cuts|reduce|reduces)\b(\s+\w+){0,4}?\s+(\d+%|time|hours|days|weeks|clicks|effort|back and forth)\b/i, "claims a saving"],
  [/\b(considerably|dramatically|significantly|typically)\b/i, "claims an unmeasured result"],
  [/\[[^\]]*\]/, "is a placeholder in square brackets"],
  [/\b(on|last|this past) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, 'invents when an earlier email was sent; say "my last note" instead'],
];

export const WORD_LIMIT = { first: 150, followUp: 90 };
const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

/**
 * Every rule a single email body (without the footer) breaks. Empty means it
 * passes. `kind` is "first" or "followUp".
 */
export function checkEmail(body, kind = "first") {
  const b = String(body || "");
  const problems = [];
  if (!b.trim()) return ["The email is empty."];
  if (b.includes(EM_DASH) || /\s--\s/.test(b)) problems.push("Uses an em dash. Use a comma, a full stop or a hyphen instead.");
  for (const re of BANNED_OPENERS) if (re.test(b)) problems.push(`Uses a stock opener ("${b.match(re)[0]}"). Start with something specific to them.`);
  const lower = b.toLowerCase();
  const hype = HYPE.filter((w) => lower.includes(w));
  if (hype.length) problems.push(`Hype words: ${hype.join(", ")}. Say what it does plainly.`);
  if (/https?:\/\/|www\./i.test(b)) problems.push("Contains a link. Cold emails go without links.");
  if (b.includes("!")) problems.push("Uses an exclamation mark.");
  const limit = WORD_LIMIT[kind] || WORD_LIMIT.first;
  const n = wordCount(b);
  if (n > limit) problems.push(`Too long: ${n} words, the limit is ${limit}.`);
  // A trailing sign-off is already cut off by stripSignOff, so a name left in
  // the body is the model writing ABOUT him ("I work with Adedolapo...").
  if (/adedolapo|ceo,? (of )?adlm/i.test(b)) {
    problems.push('Names Adedolapo or his title. The email is FROM Adedolapo: write as "I", never name him, never sign off.');
  }
  if (/reply .?stop/i.test(b) || /unsubscribe/i.test(b)) problems.push("Contains an opt-out line. Leave it out; it is added automatically.");
  if (kind === "first" && !/\b20[\s-]?min(ute)?s?\b/i.test(b)) problems.push("The first email must ask for a 20 minute call.");
  if (kind === "first" && !b.includes("?")) problems.push("The ask must be a question, ending with a question mark.");
  for (const [re, why] of UNSUPPORTED) {
    const m = b.match(re);
    if (m) problems.push(`"${m[0]}" ${why}. Only claim what the product brief states.`);
  }
  return problems;
}

/** "Dear Tunde," → "dear tunde". Null when the email has no greeting line. */
export function greetingOf(body) {
  const first = String(body || "").trim().split("\n")[0].trim();
  const m = first.match(/^(dear|hello|hi|good (morning|afternoon|day))\b[^,]*,?$/i);
  return m ? first.replace(/,$/, "").toLowerCase() : null;
}

/**
 * Removes a sign-off the model added anyway ("Best regards,\nAdedolapo...")
 * from the end of an email. Cheaper than rejecting a good draft over it, and
 * safe: code appends the real one.
 */
export function stripSignOff(body) {
  const lines = String(body || "").replace(/\s+$/, "").split("\n");
  const signOff = /^(best|kind|warm|warmest)?\s*(regards|wishes)?[,.]?$|^(thanks|thank you|sincerely|cheers|respectfully|yours( sincerely| faithfully| truly)?)[,.]?$|adedolapo|^(ceo|founder)\b|^adlm( studio)?[,.]?$/i;
  while (lines.length && (signOff.test(lines.at(-1).trim()) || !lines.at(-1).trim())) lines.pop();
  return lines.join("\n");
}

/** Problems with a subject line. */
export function checkSubject(subject) {
  const s = String(subject || "").trim();
  const problems = [];
  if (!s) problems.push("The subject is empty.");
  if (s.length > 60) problems.push(`Subject too long: ${s.length} characters, the limit is 60.`);
  if (s.includes(EM_DASH)) problems.push("Subject uses an em dash.");
  if (s.includes("!")) problems.push("Subject uses an exclamation mark.");
  if (/^re:/i.test(s)) problems.push('The first subject must not start with "Re:".');
  return problems;
}

/* ───────────────────────────── the prompt ───────────────────────────── */

const SYSTEM = `You write first-contact sales emails AS Adedolapo Quasim, CEO of ADLM Studio, in the first person ("I", "we at ADLM Studio"). He is writing personally to one person at one firm. Never mention him by name or title in the text; his signature is added below it. You write three emails: a first email, a follow-up for day 3 and a follow-up for day 7.

How they must read:
- Short, plain and specific to this firm's actual work, using the research you are given. Mention one real detail about them in the first email.
- One clear ask: a 20 minute call. The first email must ask for it in those words ("20 minute call" or "20-minute call"), as a question ending with a question mark.
- Say what the product does for someone like them, using only the facts in the product brief. Never invent customers, figures, features or prices. Do not say or imply that ADLM already works with firms like theirs, or what "many firms" do, and do not claim time savings or results the brief does not give.
- No hype. No exclamation marks. No links. No em dashes; use commas or full stops.
- Never open with "I hope this email finds you well" or anything like it.
- Nigerian professional tone: courteous, direct, not American-salesy. Open all three emails with exactly the same greeting line, "Dear <first name>,".
- First email under 150 words. Each follow-up under 90 words, adds one new, useful point, and refers back briefly. The day 7 follow-up is the last one and says so politely.
- Do NOT write a sign-off, a signature or an opt-out line. They are added automatically after your text.
- Write the product name exactly as given on the "Product name:" line, with no brackets or quotes around it.
- Never say which day an earlier email was sent. Refer to it as "my last note".

Reply with the result only, as JSON inside <emails></emails> tags:
<emails>{"subject": "", "first": "", "followUp1": "", "followUp2": ""}</emails>
The subject is plain, under 60 characters, and specific to them.`;

// How each product is written in an email.
export const PRODUCT_NAMES = { quiv: "QUIV", heron: "HERON", mep: "the ADLM MEP plugin", rategen: "RateGen" };
export const productName = (key) => PRODUCT_NAMES[key] || String(key || "");

export function buildWriterPrompt({ prospect, contact, brief, about }) {
  const firstName = String(contact.name || "").trim().split(/\s+/)[0] || "";
  const lines = [
    `Recipient: ${contact.name || "(name unknown, greet with Hello,)"}${contact.title ? `, ${contact.title}` : ""}`,
    firstName ? `Greet them as: ${firstName}` : "",
    `Firm: ${prospect.companyName} (${prospect.location || "Nigeria"})`,
    `What they do: ${prospect.whatTheyDo || "unknown"}`,
    prospect.recentProjects?.length ? `Recent work: ${prospect.recentProjects.join("; ")}` : "Recent work: none found",
    "",
    "About ADLM Studio:",
    about || "(no brief)",
    "",
    `Product name: ${productName(prospect.matchedProduct)}`,
    "Product brief:",
    brief,
  ].filter((l) => l !== null);
  return { system: SYSTEM, user: lines.join("\n") };
}

/* ───────────────────────────── parsing ───────────────────────────── */

export function parseEmails(text) {
  const all = [...String(text || "").matchAll(/<emails>([\s\S]*?)<\/emails>/g)];
  if (!all.length) throw new Error("Writer answer had no <emails> block.");
  const o = JSON.parse(all[all.length - 1][1].trim());
  for (const k of ["subject", "first", "followUp1", "followUp2"]) {
    if (typeof o?.[k] !== "string") throw new Error(`Writer answer is missing "${k}".`);
  }
  return {
    subject: o.subject.trim(),
    first: stripSignOff(o.first.trim()),
    followUp1: stripSignOff(o.followUp1.trim()),
    followUp2: stripSignOff(o.followUp2.trim()),
  };
}

/** Every problem across the three emails, each prefixed with which email. */
export function checkDraft(d) {
  const problems = [
    ...checkSubject(d.subject).map((p) => `Subject: ${p}`),
    ...checkEmail(d.first, "first").map((p) => `First email: ${p}`),
    ...checkEmail(d.followUp1, "followUp").map((p) => `Day 3 follow-up: ${p}`),
    ...checkEmail(d.followUp2, "followUp").map((p) => `Day 7 follow-up: ${p}`),
  ];
  const greetings = [d.first, d.followUp1, d.followUp2].map(greetingOf);
  if (greetings.some((g) => !g)) problems.push('Every email must open with a greeting line, "Dear <first name>,".');
  else if (new Set(greetings).size > 1) problems.push(`The three emails greet differently (${greetings.join(" / ")}). Use the same greeting in all three.`);
  return problems;
}

/** The three stored emails, with the footer appended and threaded subjects. */
export function composeEmails(d) {
  const re = `Re: ${d.subject}`;
  return [
    { step: 0, dayOffset: 0, subject: d.subject, body: d.first + FOOTER },
    { step: 1, dayOffset: 3, subject: re, body: d.followUp1 + FOOTER },
    { step: 2, dayOffset: 7, subject: re, body: d.followUp2 + FOOTER },
  ];
}

export class DraftRejected extends Error {
  constructor(problems) {
    super(`Draft still broke the writing rules after ${MAX_ATTEMPTS} attempts: ${problems.join(" | ")}`);
    this.problems = problems;
  }
}

/* ───────────────────────────── the call ───────────────────────────── */

/**
 * Writes and checks the emails for one contact. `create` is
 * aiClient.createMessage (passed in so tests need no provider).
 * @returns {{ emails, model, attempts }}
 */
export async function writeDraft({ prospect, contact, briefs, create }) {
  const brief = briefs?.[prospect.matchedProduct]?.text;
  if (!brief) throw new Error(`No product brief for "${prospect.matchedProduct}" in config/products.md.`);
  const { system, user } = buildWriterPrompt({ prospect, contact, brief, about: briefs.about?.text });

  const messages = [{ role: "user", content: user }];
  let problems = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const out = await create({
      system,
      messages,
      maxTokens: 2000,
      meta: { feature: "prospect-email-draft", product: prospect.matchedProduct },
    });
    let draft;
    try {
      draft = parseEmails(out.text);
      problems = checkDraft(draft);
    } catch (err) {
      problems = [String(err?.message || err)];
    }
    if (!problems.length) return { emails: composeEmails(draft), model: out.model || "", attempts: attempt };

    messages.push({ role: "assistant", content: out.text || "(empty)" });
    messages.push({
      role: "user",
      content: `That breaks these rules:\n- ${problems.join("\n- ")}\n\nRewrite all three emails fixing every one, and reply in the same <emails> format.`,
    });
  }
  throw new DraftRejected(problems);
}
