// A sample model the studio ships: for a course, or to demonstrate a product.
//
// ONE LIBRARY, TWO AUDIENCES
//
// A course model and a demo model are the same asset with a different reader.
// Keeping them apart would mean the same Revit file uploaded twice and one copy
// going stale the first time the building changed. So they share a library and
// differ by `purpose` and by who may download them.
//
// THE FILE IS NEVER PUBLIC
//
// Only `fileKey` is stored — a key into the private store — never a URL. The
// download is a short-lived signed link minted per request, so a leaked link
// expires and nothing can be served by holding an address. The Installer Hub is
// the reason this is stated rather than assumed: its builds went to a public
// prefix with the URL pasted into a setting, and that link was still being
// handed out a year later.

import mongoose from "mongoose";
import { MODEL_ACCESS, MODEL_PURPOSES } from "../util/demoModelFile.js";

const DemoModelSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    // Which software it is for — the catalogue key (revit, planswift, mep,
    // civil3d, archicad, rategen). Drives "sample models for QUIV".
    productKey: { type: String, trim: true, lowercase: true, default: "", index: true },

    // Matches ProjectModelSchema's three, so a demo model can be attached to a
    // project slot without translating anything.
    discipline: {
      type: String,
      enum: ["architectural", "structural", "mep", ""],
      default: "",
    },

    purpose: { type: String, enum: MODEL_PURPOSES, default: "demo", index: true },

    // Set when purpose is "course". THE SKU, not the ObjectId: a learner's
    // enrolment is keyed by courseSku (models/CourseEnrollment.js), so holding
    // an _id here would mean the enrolment check could never match and every
    // course model would be refused to the students it was made for.
    // Not a hard ref either — a model can outlive the course it was made for,
    // and losing the file because a course was deleted is worse than an orphan.
    courseSku: { type: String, trim: true, default: "", index: true },
    courseTitle: { type: String, trim: true, default: "" },

    access: { type: String, enum: MODEL_ACCESS, default: "signed-in" },

    // ── The file ──
    // A KEY, never a URL. See the note at the top.
    fileKey: { type: String, trim: true, default: "" },
    fileName: { type: String, trim: true, default: "" },
    format: { type: String, trim: true, default: "" },
    sizeBytes: { type: Number, default: 0 },
    // Which backend holds it, so a store migration does not orphan the row.
    storage: { type: String, trim: true, default: "" },

    // Nothing is offered until an admin says so: an upload is finished in two
    // steps (presign, then confirm), and a half-uploaded model must not appear
    // in a course.
    published: { type: Boolean, default: false, index: true },

    uploadedBy: { type: String, trim: true, lowercase: true, default: "" },
    uploadedAt: { type: Date, default: null },
    downloads: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// The two questions the screens ask: "what is published for this product" and
// "what belongs to this course".
DemoModelSchema.index({ published: 1, productKey: 1, purpose: 1 });
DemoModelSchema.index({ courseSku: 1, published: 1 });

/** A model is only offerable once its file has actually landed. */
DemoModelSchema.methods.isReady = function isReady() {
  return Boolean(this.fileKey && this.uploadedAt);
};

export const DemoModel =
  mongoose.models.DemoModel || mongoose.model("DemoModel", DemoModelSchema);

export default DemoModel;
