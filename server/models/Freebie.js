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
    // Where on the website this appears. His design's most useful column: the
    // panel can fill a table all day, but if the site has no place for the
    // thing, a visitor never sees it. Empty means nobody has said where.
    slot: { type: String, default: "" },

    title: { type: String, trim: true, required: true, maxlength: 140 },
    description: { type: String, trim: true, default: "", maxlength: 8000 },
    productKey: { type: String, trim: true, lowercase: true, default: "" },

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
