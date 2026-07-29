/**
 * Creates or updates a module quiz from a JSON file, so quizzes can be
 * authored before the admin UI for them exists.
 *
 *   node scripts/seed-quiz.mjs --file scripts/quiz.example.json
 *   node scripts/seed-quiz.mjs --file my-quiz.json --apply
 *
 * Upserts on (courseSku, moduleCode) — re-running replaces that module's quiz
 * rather than creating a second one.
 */
import "dotenv/config";
import fs from "node:fs";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { Quiz } from "../models/Quiz.js";

const APPLY = process.argv.includes("--apply");
const fileIndex = process.argv.indexOf("--file");
const file = fileIndex === -1 ? "" : process.argv[fileIndex + 1];

if (!file) {
  console.error("Usage: node scripts/seed-quiz.mjs --file <quiz.json> [--apply]");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(file, "utf8"));
const problems = [];

if (!spec.courseSku) problems.push("courseSku is required");
if (!spec.moduleCode) problems.push("moduleCode is required");
if (!Array.isArray(spec.questions) || !spec.questions.length) {
  problems.push("questions must be a non-empty array");
}

(spec.questions || []).forEach((q, i) => {
  const n = i + 1;
  if (!q.prompt) problems.push(`q${n}: prompt is required`);
  if (!Array.isArray(q.options) || q.options.length < 2) {
    problems.push(`q${n}: needs at least 2 options`);
  } else if (
    !Number.isInteger(q.correctIndex) ||
    q.correctIndex < 0 ||
    q.correctIndex >= q.options.length
  ) {
    problems.push(
      `q${n}: correctIndex ${q.correctIndex} is not one of the ${q.options.length} options`,
    );
  }
});

if (problems.length) {
  console.error("This quiz will not load:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

await connectDB();

const course = await PaidCourse.findOne({ sku: spec.courseSku }).lean();
if (!course) {
  console.error(`No course with sku "${spec.courseSku}".`);
  process.exit(1);
}
const module = (course.modules || []).find((m) => m.code === spec.moduleCode);
if (!module) {
  console.error(
    `Course "${spec.courseSku}" has no module "${spec.moduleCode}". ` +
      `Available: ${(course.modules || []).map((m) => m.code).join(", ")}`,
  );
  process.exit(1);
}

console.log(`course:  ${course.title}`);
console.log(`module:  ${module.code} — ${module.title}`);
console.log(`quiz:    ${spec.title || "(untitled)"}`);
console.log(`         ${spec.questions.length} questions, pass mark ${spec.passMark ?? 60}%`);
console.log(`         published: ${spec.isPublished === true}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to save it.");
  process.exit(0);
}

const quiz = await Quiz.findOneAndUpdate(
  { courseSku: spec.courseSku, moduleCode: spec.moduleCode },
  {
    courseSku: spec.courseSku,
    moduleCode: spec.moduleCode,
    title: spec.title || "",
    intro: spec.intro || "",
    passMark: Number(spec.passMark ?? 60),
    maxAttempts: Number(spec.maxAttempts ?? 0),
    isPublished: spec.isPublished === true,
    questions: spec.questions.map((q) => ({
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || "",
    })),
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);

console.log(`\nSaved (${quiz._id}).`);
process.exit(0);
