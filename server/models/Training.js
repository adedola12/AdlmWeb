// server/models/Training.js
import mongoose from "mongoose";

const trainingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },

    // "online", "office", or "conference"
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

    imageUrl: { type: String, required: true }, // Cloudinary URL
  },
  { timestamps: true }
);

export const Training = mongoose.model("Training", trainingSchema);
