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
      enum: ["announcement", "countdown", "launch", "event", "subscription", "ticket", "thumbBold", "thumbTutorial", "thumbFeatures", "thumbHook"],
      default: "announcement",
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    thumbnailUrl: { type: String, trim: true, default: "" },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Editorial calendar. Deliberately a plan, not an automation: nothing here
    // posts anything. Flyer images are rendered by html2canvas in the browser,
    // so a job with no browser has no image to send — `status` is moved by a
    // person, and `postedAt` records when they say they did it.
    schedule: {
      // Null means unscheduled, which is what the backlog view lists.
      scheduledFor: { type: Date, default: null },
      channels: {
        type: [String],
        default: [],
        validate: {
          validator: (v) =>
            !Array.isArray(v) ||
            v.every((c) =>
              ["instagram", "facebook", "linkedin", "x", "whatsapp", "youtube", "other"].includes(c),
            ),
          message: "Unknown channel",
        },
      },
      status: {
        type: String,
        enum: ["planned", "ready", "posted"],
        default: "planned",
      },
      postedAt: { type: Date, default: null },
      notes: { type: String, default: "", maxlength: 500 },
    },
  },
  { timestamps: true, minimize: false },
);

// The calendar reads by date window, and the due-nudge reads everything not yet
// posted with a date in the past. Both are this index.
FlyerSchema.index({ "schedule.scheduledFor": 1, "schedule.status": 1 });

export const Flyer =
  mongoose.models.Flyer || mongoose.model("Flyer", FlyerSchema);
