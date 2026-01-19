import mongoose from "mongoose";

const VideoSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const FreebieSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 140 },
    description: { type: String, trim: true, default: "", maxlength: 8000 },

    imageUrl: { type: String, trim: true, default: "" },
    downloadUrl: { type: String, trim: true, default: "" },

    videos: { type: [VideoSchema], default: [] },

    published: { type: Boolean, default: true },

    // optional
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const Freebie =
  mongoose.models.Freebie || mongoose.model("Freebie", FreebieSchema);
