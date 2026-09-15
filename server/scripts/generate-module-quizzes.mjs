/**
 * Drafts a quiz for each lecture from that lecture's own transcript.
 *
 *   node scripts/generate-module-quizzes.mjs                    # plan
 *   node scripts/generate-module-quizzes.mjs --apply --limit 1  # draft one
 *   node scripts/generate-module-quizzes.mjs --apply            # draft the rest
 *
 * EVERYTHING IT WRITES IS A DRAFT. `isPublished` stays false, which is the
 * schema's own default, and nothing reaches a student until a tutor opens the
 * quiz in the admin screen and publishes it. That is deliberate and not a
 * setting to flip in here: this writes assessment content for a paid course
 * from a machine transcript that is itself imperfect — the transcripts render
 * COBie as "Kobe" forty-three times — so a person who knows the material has to
 * read every question before anybody is marked on it.
 *
 * Grounded in the transcript rather than in general knowledge: the model is
 * given the lecture text and told to ask about what was actually taught in it.
 * A question the tutor never covered is worse than no question.
 *
 * --limit and --sku bound a first run, and three failures in a row stops it —
 * the same shape as transcribe-course-videos.mjs, for the same reason.
 */
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { Quiz } from "../models/Quiz.js";
import { getObjectText } from "../utils/awsS3.js";
import { createMessage, providerConfigured } from "../services/aiClient.js";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const argOf = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : "";
};
const ONLY_SKU = argOf("--sku");
const LIMIT = Number(argOf("--limit") || 0) || 0;
const COUNT = Number(argOf("--questions") || 0) || 5;

const SYSTEM = `You write short multiple-choice checks for a quantity-surveying
and BIM training course taught by ADLM Studio in Nigeria.

You are given the machine transcript of one recorded lecture. Write questions
ONLY about material that lecture actually covers. Do not draw on general
knowledge of the subject, and do not ask about anything the transcript does not
discuss.

The transcript is automatic and imperfect. Where a term is obviously
mis-transcribed, use the correct term in your question — "Kobe" is COBie,
"Redvit" or "Reddit" is Revit, "Plan Swift" is PlanSwift, "Costex" is CostX,
"AutoCard" is AutoCAD, "Navice work" is Navisworks. If a passage is too garbled
to be sure what was meant, do not build a question on it.

Each question must:
- test understanding, not recall of a phrase
- have exactly four options, one clearly correct and three plausible to
  somebody who half-followed the lesson
- carry an explanation of one or two sentences saying WHY the answer is right,
  because the explanation is the part the student learns from

Write in British English. Keep prompts under 220 characters.`;

const SCHEMA_NOTE = `Return ONLY a JSON object, no prose and no code fence:
{"title":"...","intro":"...","questions":[{"prompt":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]}`;

async function lectures() {
  const q = ONLY_SKU ? { sku: ONLY_SKU } : {};
  const courses = await PaidCourse.find(q).select("sku title modules").lean();
  const out = [];
  for (const c of courses) {
    for (const m of c.modules || []) {
      if (m.transcriptStatus !== "COMPLETED" || !m.transcriptKey) continue;
      out.push({ sku: c.sku, courseTitle: c.title, code: m.code, title: m.title, key: m.transcriptKey });
    }
  }
  return out;
}

/** Transcribe's JSON, reduced to the prose the model should read. */
function transcriptText(parsed) {
  return String(parsed?.results?.transcripts?.[0]?.transcript || "").trim();
}

/** The model's reply, validated before it is allowed near the database. */
function parseQuiz(raw, count) {
  const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the reply");

  // A reply that ran into the token ceiling stops mid-array, and JSON.parse
  // rejects the whole thing — losing four good questions because the fifth was
  // cut off. So: try the whole object first, and if that fails, pull out the
  // question objects that DID close and keep those.
  let obj;
  try {
    obj = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
  } catch {
    const objects = [];
    // Balance braces to find each complete {...} inside "questions".
    const from = text.indexOf("[", text.indexOf('"questions"'));
    if (from < 0) throw new Error("reply was truncated before any question");
    let depth = 0;
    let open = -1;
    for (let i = from; i < text.length; i += 1) {
      if (text[i] === "{") {
        if (depth === 0) open = i;
        depth += 1;
      } else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0 && open >= 0) {
          try {
            objects.push(JSON.parse(text.slice(open, i + 1)));
          } catch {
            // A question that will not parse on its own is simply dropped.
          }
          open = -1;
        }
      }
    }
    if (!objects.length) throw new Error("reply was truncated before any question closed");
    const titleMatch = /"title"\s*:\s*"([^"]*)"/.exec(text);
    const introMatch = /"intro"\s*:\s*"([^"]*)"/.exec(text);
    obj = {
      title: titleMatch?.[1] || "",
      intro: introMatch?.[1] || "",
      questions: objects,
    };
    console.warn(`  (reply was truncated — salvaged ${objects.length} complete question(s))`);
  }

  const questions = (Array.isArray(obj.questions) ? obj.questions : [])
    .map((q) => ({
      prompt: String(q?.prompt || "").trim(),
      options: (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean),
      correctIndex: Number.isInteger(q?.correctIndex) ? q.correctIndex : -1,
      explanation: String(q?.explanation || "").trim(),
    }))
    // The schema demands 2..6 options and the grader indexes into them, so a
    // correctIndex pointing outside the list would mark everyone wrong.
    .filter((q) => q.prompt && q.options.length >= 2 && q.options.length <= 6)
    .filter((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length);

  if (!questions.length) throw new Error("no usable questions survived validation");
  return {
    title: String(obj.title || "").trim().slice(0, 120),
    intro: String(obj.intro || "").trim().slice(0, 400),
    questions: questions.slice(0, count),
  };
}

await connectDB();

if (!providerConfigured()) {
  console.error(
    "No AI provider is configured — set the Bedrock/Anthropic credentials this\n" +
      "server already uses for Ada before running this.",
  );
  process.exit(1);
}

const all = await lectures();
const saved = await Quiz.find({}).select("courseSku moduleCode isPublished").lean();
const existing = new Set(saved.map((q) => `${q.courseSku}/${q.moduleCode}`));

// A published quiz is a tutor's own work, or a draft they have read and
// approved. --force is for re-drafting what this script wrote, not for
// overwriting that — so published quizzes are excluded from it entirely.
const published = new Set(
  saved.filter((q) => q.isPublished).map((q) => `${q.courseSku}/${q.moduleCode}`),
);

const todo = all
  .filter((l) => !published.has(`${l.sku}/${l.code}`))
  .filter((l) => FORCE || !existing.has(`${l.sku}/${l.code}`));

if (published.size) {
  console.log(`${published.size} published quiz(zes) left alone — --force does not touch those.`);
}

console.log(`${all.length} lecture(s) with a transcript · ${existing.size} already have a quiz`);
console.log(`${todo.length} would be drafted${LIMIT ? `, capped at ${LIMIT}` : ""}`);
for (const l of todo.slice(0, LIMIT || todo.length)) console.log(`  ${l.sku}/${l.code} — ${l.title}`);

if (!APPLY) {
  console.log("\nRe-run with --apply to draft them. Everything is written unpublished.");
  process.exit(0);
}

let made = 0;
let attempted = 0;
let failures = 0;

for (const l of todo) {
  if (LIMIT && attempted >= LIMIT) break;
  if (failures >= 3) break;
  attempted += 1;
  try {
    const text = transcriptText(JSON.parse(await getObjectText(l.key)));
    if (text.length < 500) throw new Error("transcript too short to ask about");

    const reply = await createMessage({
      system: SYSTEM,
      maxTokens: 8000,
      temperature: 0.3,
      meta: { feature: "course-quiz-draft" },
      messages: [
        {
          role: "user",
          content:
            `Course: ${l.courseTitle}\nLesson: ${l.title}\n\n` +
            `Write ${COUNT} questions on this lecture.\n\n${SCHEMA_NOTE}\n\n` +
            `--- transcript ---\n${text}`,
        },
      ],
    });

    const body = reply?.content?.map?.((c) => c.text || "").join("") ?? reply?.text ?? String(reply);
    const quiz = parseQuiz(body, COUNT);

    await Quiz.findOneAndUpdate(
      { courseSku: l.sku, moduleCode: l.code },
      {
        $set: {
          title: quiz.title || `Check: ${l.title}`.slice(0, 120),
          intro: quiz.intro,
          questions: quiz.questions,
          passMark: 60,
          maxAttempts: 0,
          // Never published from here. See the header.
          isPublished: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    made += 1;
    failures = 0;
    console.log(`drafted ${l.sku}/${l.code} — ${quiz.questions.length} questions`);
  } catch (e) {
    failures += 1;
    console.error(`FAILED  ${l.sku}/${l.code}: ${e?.message || e}`);
  }
}

if (failures >= 3) {
  console.error("\nStopped after three failures in a row — that is a setup problem, not a bad lecture.");
}
console.log(`\n${made} quiz draft(s) written, all unpublished. Review and publish them in /admin.`);
process.exit(0);
