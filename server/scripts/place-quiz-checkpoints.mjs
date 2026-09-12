// Work out where in each lecture its quiz questions belong.
//
// Every question already exists and every lecture is transcribed with
// timestamps. What is missing is the join: which second of the lecture each
// question is about. Done by hand that is 170 judgements against 34 recordings
// totalling some fifty hours, which is why it has not been done.
//
// HOW IT DECIDES
//
// The model is given the lecture as timestamped windows and the questions WITH
// their answers and explanations — it is not being asked to answer them, it is
// being asked where each answer is taught. It returns a second, and a short
// quote from the transcript at that point so a person reviewing can check the
// claim without opening the video.
//
// The rule it is held to: place the checkpoint just AFTER the point is made.
// A question asked before its answer has been explained is a trick, and the
// whole argument for asking during the lecture is that the explanation is
// still fresh.
//
// NOTHING IS PUBLISHED HERE
//
// These quizzes are live. A bad timestamp is not a quiet flaw, it is a
// question interrupting a student at a moment that makes no sense — so this
// writes a draft file and stops. Applying it is a second, deliberate command.
//
//   node scripts/place-quiz-checkpoints.mjs --dry            one lecture, nothing saved
//   node scripts/place-quiz-checkpoints.mjs                  draft every lecture
//   node scripts/place-quiz-checkpoints.mjs --sku=BIM-MEP-25 one course
//   node scripts/place-quiz-checkpoints.mjs --review         read the draft back
//   node scripts/place-quiz-checkpoints.mjs --apply          write them to the quizzes
//   node scripts/place-quiz-checkpoints.mjs --unplace        take them all off again

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => (args.find((a) => a.startsWith(`${f}=`)) || `${f}=${d}`).split("=")[1];

const DRY = has("--dry");
const APPLY = has("--apply");
const REVIEW = has("--review");
const UNPLACE = has("--unplace");
const ONLY_SKU = val("--sku", "");
const LIMIT = Number(val("--limit", DRY ? 1 : 0)) || 0;
const OUT = path.resolve(val("--out", path.join(process.cwd(), "scripts", "checkpoint-draft.json")));

/* ── the shape of a lecture the model reads ────────────────────────────── */

const clock = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(n / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

/** Transcribe's segments, merged into windows of roughly WINDOW seconds. */
function windows(parsed, WINDOW = 45) {
  const segs = Array.isArray(parsed?.results?.audio_segments) ? parsed.results.audio_segments : [];
  const out = [];
  let open = null;
  for (const s of segs) {
    const at = Math.max(0, Math.round(Number(s.start_time) || 0));
    const text = String(s.transcript || "").trim();
    if (!text) continue;
    if (!open || at - open.at >= WINDOW) {
      open = { at, text };
      out.push(open);
    } else {
      open.text += ` ${text}`;
    }
  }
  return out;
}

const SYSTEM = `You place quiz questions inside a recorded lecture.

You are given a lecture as timestamped windows, and the questions that have
already been written about it — each with its correct answer and the
explanation a student is shown.

For each question, find the moment in the lecture where that answer is
explained, and give the second JUST AFTER the explanation finishes. The
student should have heard the point before being asked about it. Placing a
question before its answer is taught is the one thing you must never do.

Rules:
- Use only the transcript. If a question is not covered anywhere in this
  lecture, say so with atSec null rather than guessing.
- Never place a checkpoint in the first 60 seconds or the last 60 seconds.
- Keep checkpoints at least 120 seconds apart from each other.
- Questions need not be in lecture order. Place each where its own answer is.
- Quote up to 15 words from the transcript at the point you chose, so a person
  can check you without opening the video.
- Every window is labelled [t=SECONDS HH:MM:SS]. atSec is that SECONDS number.
  Copy it; never convert the clock yourself.

Reply with JSON only, no prose, no code fence:
{"placements":[{"q":1,"atSec":305,"quote":"...","why":"..."}]}
q is the question number as given. atSec is a whole number of seconds, or null.
why is at most 12 words on what is being taught there.`;

/* ── the model's reply, checked before it is trusted ───────────────────── */

function parseReply(raw) {
  const text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON in the reply");

  try {
    const obj = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
    if (Array.isArray(obj?.placements)) return obj.placements;
  } catch {
    /* fall through and salvage what closed */
  }

  // A reply that hit the token ceiling stops mid-array and JSON.parse rejects
  // the whole thing — losing four good placements because the fifth was cut
  // off. One lecture failed in exactly that way. So each complete {...} is
  // pulled out on its own and the truncated tail is discarded.
  const out = [];
  const from = text.indexOf("[", text.indexOf('"placements"'));
  if (from < 0) throw new Error("no placements array");
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
          out.push(JSON.parse(text.slice(open, i + 1)));
        } catch {
          /* not a placement after all */
        }
        open = -1;
      }
    }
  }
  if (!out.length) throw new Error("no placements array");
  return out;
}

/**
 * The rules the model was given, enforced rather than hoped for.
 *
 * A model asked for "at least 120 seconds apart" mostly obliges, and mostly is
 * not a property — a checkpoint eight seconds after the last one is a student
 * answering two questions back to back in the middle of a sentence.
 */
function police(placements, { duration, count }) {
  const HEAD = 60;
  const TAIL = 60;
  const GAP = 120;

  const notes = [];
  const kept = [];

  const rows = placements
    .map((p) => ({
      q: Number(p.q),
      atSec: p.atSec == null ? null : Math.round(Number(p.atSec)),
      quote: String(p.quote || "").trim().slice(0, 160),
      why: String(p.why || "").trim().slice(0, 120),
    }))
    .filter((p) => Number.isInteger(p.q) && p.q >= 1 && p.q <= count)
    .sort((a, b) => (a.atSec ?? Infinity) - (b.atSec ?? Infinity));

  for (const p of rows) {
    if (p.atSec == null) {
      notes.push(`q${p.q}: not covered in this lecture — left unplaced`);
      kept.push({ ...p, atSec: null });
      continue;
    }
    if (!Number.isFinite(p.atSec) || p.atSec <= 0) {
      notes.push(`q${p.q}: nonsense timestamp — dropped`);
      kept.push({ ...p, atSec: null });
      continue;
    }
    if (duration && p.atSec > duration - TAIL) {
      notes.push(`q${p.q}: ${clock(p.atSec)} is past the end — dropped`);
      kept.push({ ...p, atSec: null });
      continue;
    }
    if (p.atSec < HEAD) {
      notes.push(`q${p.q}: ${clock(p.atSec)} is in the opening minute — dropped`);
      kept.push({ ...p, atSec: null });
      continue;
    }
    const last = kept.filter((k) => k.atSec != null).pop();
    if (last && p.atSec - last.atSec < GAP) {
      notes.push(
        `q${p.q}: ${clock(p.atSec)} is ${p.atSec - last.atSec}s after q${last.q} — dropped, too close`,
      );
      kept.push({ ...p, atSec: null });
      continue;
    }
    kept.push(p);
  }

  return { kept: kept.sort((a, b) => a.q - b.q), notes };
}

/* ── go ────────────────────────────────────────────────────────────────── */

await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.AUTH_DB || "adlmWeb" });
const { PaidCourse } = await import("../models/PaidCourse.js");
const { Quiz } = await import("../models/Quiz.js");

function readDraft() {
  if (!fs.existsSync(OUT)) {
    console.log(`no draft at ${OUT} — run without --apply first`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(OUT, "utf8"));
}

if (UNPLACE) {
  const all = await Quiz.find({});
  let n = 0;
  for (const q of all) {
    let touched = false;
    for (const x of q.questions || []) {
      if (x.atSec != null) {
        x.atSec = null;
        touched = true;
        n += 1;
      }
    }
    if (touched) await q.save();
  }
  console.log(`${n} checkpoint(s) removed. Every question is asked at the end again.`);
  await mongoose.disconnect();
  process.exit(0);
}

if (REVIEW || APPLY) {
  const draft = readDraft();
  let placed = 0;
  let unplaced = 0;

  for (const lec of draft.lectures) {
    console.log(`\n${lec.sku}/${lec.code} — ${lec.title}`);
    if (lec.error) {
      console.log(`  could not be drafted: ${lec.error}`);
      continue;
    }
    for (const p of lec.placements) {
      const q = lec.questions[p.q - 1];
      if (p.atSec == null) {
        unplaced += 1;
        console.log(`  q${p.q}  —        ${q?.prompt?.slice(0, 66) || ""}`);
      } else {
        placed += 1;
        console.log(`  q${p.q}  ${clock(p.atSec)}  ${q?.prompt?.slice(0, 66) || ""}`);
        console.log(`         why: ${p.why}`);
        if (p.quote) console.log(`         "${p.quote}"`);
      }
    }
    for (const n of lec.notes || []) console.log(`  · ${n}`);
  }

  console.log(`\n${placed} placed, ${unplaced} left at the end of the module`);

  if (APPLY) {
    let written = 0;
    for (const lec of draft.lectures) {
      if (lec.error) continue;
      const quiz = await Quiz.findOne({ courseSku: lec.sku, moduleCode: lec.code });
      if (!quiz) continue;
      lec.placements.forEach((p) => {
        const q = quiz.questions[p.q - 1];
        if (q) q.atSec = p.atSec;
      });
      await quiz.save();
      written += 1;
    }
    console.log(`\nwritten to ${written} quiz(zes). --unplace takes them all off again.`);
  } else {
    console.log(`\nthis is the draft only. --apply writes it; --unplace undoes that.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

/* ── drafting ──────────────────────────────────────────────────────────── */

const { getObjectText } = await import("../utils/awsS3.js");
const { createMessage, providerConfigured } = await import("../services/aiClient.js");
const { flushAiUsage } = await import("../services/aiUsage.js");

if (!providerConfigured?.()) {
  console.log("no AI provider is configured — set ANTHROPIC_API_KEY (or the Bedrock vars).");
  process.exit(1);
}

const courses = await PaidCourse.find(ONLY_SKU ? { sku: ONLY_SKU } : {})
  .select("sku title modules")
  .lean();

const todo = [];
for (const c of courses) {
  for (const m of c.modules || []) {
    if (m.transcriptStatus !== "COMPLETED" || !m.transcriptKey) continue;
    todo.push({
      sku: c.sku,
      courseTitle: c.title,
      code: m.code,
      title: m.title,
      key: m.transcriptKey,
      duration: Number(m.durationSec) || 0,
    });
  }
}

console.log(`${todo.length} transcribed lecture(s)${LIMIT ? `, doing ${LIMIT}` : ""}\n`);

const lectures = [];
let done = 0;
let failures = 0;

for (const l of todo) {
  if (LIMIT && done >= LIMIT) break;
  if (failures >= 3) {
    console.log("three failures in a row — stopping rather than burning credit");
    break;
  }
  done += 1;

  const quiz = await Quiz.findOne({ courseSku: l.sku, moduleCode: l.code }).lean();
  if (!quiz || !(quiz.questions || []).length) {
    console.log(`${l.sku}/${l.code}  no quiz — skipped`);
    continue;
  }

  try {
    const parsed = JSON.parse(await getObjectText(l.key));
    const win = windows(parsed);
    if (win.length < 5) throw new Error("transcript too short to place anything in");

    // The duration the model is told is the transcript's own end, which is
    // more reliable than durationSec — that is unset on most of these.
    const duration = l.duration || win[win.length - 1].at + 30;

    const asked = quiz.questions
      .map(
        (q, i) =>
          `${i + 1}. ${q.prompt}\n   answer: ${q.options?.[q.correctIndex] || "?"}\n   explanation: ${q.explanation || "(none)"}`,
      )
      .join("\n\n");

    // Labelled with the number that is actually wanted back, not only a
    // clock. On one lecture the model read "[00:02:20]" as two hours twenty
    // and answered 8400 for a point at 2m20s — every placement landed past
    // the end of a 95 minute recording. The guard caught all five, but the
    // cause was the label: asking for seconds while showing only HH:MM:SS
    // invites the model to do the conversion, and that is where it slipped.
    const body = win.map((w) => `[t=${w.at}s ${clock(w.at)}] ${w.text}`).join("\n");

    const reply = await createMessage({
      system: SYSTEM,
      maxTokens: 2000,
      temperature: 0.2,
      meta: { feature: "course-quiz-draft" },
      messages: [
        {
          role: "user",
          content:
            `Course: ${l.courseTitle}\nLecture: ${l.title}\nRuns to ${clock(duration)}.\n\n` +
            `--- the questions ---\n${asked}\n\n--- the lecture ---\n${body}`,
        },
      ],
    });

    const raw = reply?.content?.map?.((c) => c.text || "").join("") ?? reply?.text ?? String(reply);
    const { kept, notes } = police(parseReply(raw), {
      duration,
      count: quiz.questions.length,
    });

    lectures.push({
      sku: l.sku,
      code: l.code,
      title: l.title,
      duration,
      questions: quiz.questions.map((q) => ({ prompt: q.prompt })),
      placements: kept,
      notes,
    });

    const n = kept.filter((k) => k.atSec != null).length;
    console.log(`${l.sku}/${l.code}  ${n} of ${quiz.questions.length} placed${notes.length ? `  (${notes.length} note${notes.length === 1 ? "" : "s"})` : ""}`);
    failures = 0;
  } catch (e) {
    failures += 1;
    console.log(`${l.sku}/${l.code}  FAILED — ${e.message}`);
    lectures.push({ sku: l.sku, code: l.code, title: l.title, error: e.message });
  }
}

// The metering rows are written after the reply comes back, and disconnecting
// beats them — so the books are closed before the connection is.
await flushAiUsage();

if (!DRY) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), lectures }, null, 2));
  console.log(`\ndraft written to ${OUT}`);
  console.log("--review reads it back, --apply writes it to the quizzes");
} else {
  console.log("\nDRY RUN — nothing was written. Drop --dry to draft them all.");
  for (const lec of lectures) {
    for (const p of lec.placements || []) {
      if (p.atSec == null) continue;
      console.log(`  ${clock(p.atSec)}  q${p.q}  ${p.why}`);
      if (p.quote) console.log(`            "${p.quote}"`);
    }
    for (const n of lec.notes || []) console.log(`  · ${n}`);
  }
}

await mongoose.disconnect();
