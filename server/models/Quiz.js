import mongoose from "mongoose";

/**
 * A quiz attached to one module of a course — the platform equivalent of the
 * "Understanding 5D BIM QUIZ" that currently only exists in Google Classroom.
 *
 * Correct answers live here and are stripped before the quiz is sent to a
 * student; grading happens server-side so the answer key never reaches the
 * browser.
 */
const QuestionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    options: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 6,
        message: "A question needs between 2 and 6 options.",
      },
    },
    correctIndex: { type: Number, default: 0 },
    // Shown after submission, right or wrong — the teaching happens here.
    explanation: { type: String, default: "" },

    /**
     * Where in the lecture this question belongs, in seconds.
     *
     * A quiz at the end of a two-hour session asks about something the student
     * heard ninety minutes ago, and the honest answer to most of it is "I do
     * not remember" rather than "I did not understand". A question asked at
     * the moment the point was made is a different question: it catches the
     * misunderstanding while the explanation is still on screen behind it.
     *
     * So a question can be anchored to a second, and the player stops there
     * and asks it.
     *
     * null means not anchored, which is what every question written before
     * this field existed is. Those are asked the old way, at the end, so
     * nothing that already works changes until somebody places it.
     */
    atSec: { type: Number, default: null, min: 0 },
  },
  { _id: true },
);

const QuizSchema = new mongoose.Schema(
  {
    courseSku: { type: String, index: true, required: true },
    moduleCode: { type: String, index: true, required: true },
    title: { type: String, default: "" },
    intro: { type: String, default: "" },
    passMark: { type: Number, default: 60 }, // percent
    // 0 = unlimited. Attempts are always recorded either way.
    maxAttempts: { type: Number, default: 0 },
    questions: { type: [QuestionSchema], default: [] },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true },
);

QuizSchema.index({ courseSku: 1, moduleCode: 1 }, { unique: true });

export const Quiz =
  mongoose.models.Quiz || mongoose.model("Quiz", QuizSchema);

const QuizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    email: { type: String, default: "" },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", index: true },
    courseSku: { type: String, index: true },
    moduleCode: { type: String, index: true },

    answers: { type: [Number], default: [] },
    score: { type: Number, default: 0 }, // percent
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

QuizAttemptSchema.index({ userId: 1, courseSku: 1, moduleCode: 1 });

export const QuizAttempt =
  mongoose.models.QuizAttempt ||
  mongoose.model("QuizAttempt", QuizAttemptSchema);
