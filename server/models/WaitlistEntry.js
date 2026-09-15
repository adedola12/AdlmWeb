// server/models/WaitlistEntry.js
//
// Product-waitlist and enquiry captures from the public marketing pages.
//
// One collection rather than one per form: the CIVIQ waitlist and the four
// solutions message forms differ only by which page they came from and which
// fields they filled, so `topic` carries that and the rest is shared. The
// alternative was five near-identical models and five admin screens.
//
// Every form on the redesigned pages posted to a thank-you page and sent
// nothing anywhere — this is what they post to instead.
import mongoose from "mongoose";

const WaitlistEntrySchema = new mongoose.Schema(
  {
    // Which form this came from, e.g. "CIVIQ waitlist". Taken from the form's
    // hidden `topic` field so a new form needs no schema change.
    topic: { type: String, trim: true, required: true, maxlength: 120, index: true },

    name: { type: String, trim: true, required: true, maxlength: 140 },
    // Stored lowercase so the duplicate check below is case-insensitive.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      maxlength: 200,
      index: true,
    },
    org: { type: String, trim: true, default: "", maxlength: 200 },

    // CIVIQ asks which Civil 3D version they are on; other forms leave it blank.
    civil3d: { type: String, trim: true, default: "", maxlength: 80 },
    message: { type: String, trim: true, default: "", maxlength: 4000 },

    // Where they were when they submitted, for attribution. Not user-supplied
    // beyond the page path — never trust it for anything but reporting.
    sourcePath: { type: String, trim: true, default: "", maxlength: 300 },

    status: {
      type: String,
      enum: ["new", "contacted", "converted", "archived"],
      default: "new",
      index: true,
    },
    // Free-text for whoever works the list.
    note: { type: String, trim: true, default: "", maxlength: 2000 },

    // Set when someone submits the same topic + email twice, so a repeat
    // signup bumps a counter instead of creating a second row to chase.
    submissions: { type: Number, default: 1 },
  },
  { timestamps: true },
);

// The list is worked newest-first, usually filtered by topic or status.
WaitlistEntrySchema.index({ createdAt: -1 });
// One row per person per form — enforced in the route, and here so a race
// between two concurrent submissions cannot create a duplicate.
WaitlistEntrySchema.index({ topic: 1, email: 1 }, { unique: true });

export const WaitlistEntry =
  mongoose.models.WaitlistEntry ||
  mongoose.model("WaitlistEntry", WaitlistEntrySchema);

export default WaitlistEntry;
