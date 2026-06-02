import mongoose from "mongoose";

// A saved flyer from the admin Flyer Engine. `data` is the full flyer config
// object (the client's flyer contract — see
// client/src/features/flyers/lib/defaults.js); we keep it as a flexible Mixed
// blob so the engine can evolve its fields without server migrations. Images
// inside `data` are Cloudinary/R2 URLs (uploaded via /admin/media/*), not
// base64, so documents stay small.
const FlyerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 200 },
    template: {
      type: String,
      trim: true,
      enum: ["announcement", "countdown", "launch", "event"],
      default: "announcement",
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    thumbnailUrl: { type: String, trim: true, default: "" },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

export const Flyer =
  mongoose.models.Flyer || mongoose.model("Flyer", FlyerSchema);
