import mongoose from "mongoose";

/**
 * One person's notes against one lesson.
 *
 * His Notes tab says "Notes are kept against the lesson on your account", and
 * that sentence is the whole specification: not in the browser, not in the
 * tab, on the account — so they survive a new laptop and are there when
 * somebody comes back to the lesson six months later.
 *
 * One row per person per lesson, upserted. Notes are the person's own writing
 * about material they paid for, so nothing here is exposed to admin screens or
 * to anybody else; the only reader is the account that wrote it.
 */
const LessonNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseSku: { type: String, required: true, trim: true },
    moduleCode: { type: String, required: true, trim: true },

    // Capped so a paste of something enormous cannot be used to fill the
    // collection. Long enough that nobody writing in good faith will meet it.
    body: { type: String, default: "", maxlength: 20000 },
  },
  { timestamps: true },
);

LessonNoteSchema.index(
  { userId: 1, courseSku: 1, moduleCode: 1 },
  { unique: true },
);

export const LessonNote =
  mongoose.models.LessonNote || mongoose.model("LessonNote", LessonNoteSchema);
