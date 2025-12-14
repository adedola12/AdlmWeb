import mongoose from "mongoose";

const trainingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },

    mode: {
      type: String,
      enum: ["online", "office", "conference"],
      required: true,
    },

    date: { type: Date, required: true },

    city: { type: String, default: "" },
    country: { type: String, default: "" },
    venue: { type: String, default: "" },

    attendees: { type: Number, default: 0 },
    tags: [{ type: String }],

    // ✅ NEW: multiple images
    imageUrls: { type: [String], required: true, default: [] },

    // (optional) keep old field for backward compatibility if you already have data
    // imageUrl: { type: String },
  },
  { timestamps: true }
);

export const Training = mongoose.model("Training", trainingSchema);
