// server/models/LatestItem.js
//
// The "Latest from ADLM" band that rotates near the foot of every marketing
// page. Richard's version had four items typed into the markup, so keeping it
// current meant a code change and a deploy. These rows are what it renders
// instead, edited from Admin → Latest from ADLM.
//
// One collection rather than pulling live from courses / changelogs / videos:
// the band is an editorial choice about what to put in front of a visitor this
// week, not a feed. `kind` records where an item came from so the admin list
// can be filtered, and `ctaHref` points wherever the real thing lives.
import mongoose from "mongoose";

// Drives the default chip above the headline, matching the wording his own
// four items used ("New release", "Course open", "In development").
export const KINDS = {
  "whats-new": "New release",
  software: "Software update",
  course: "Course open",
  video: "New video",
  linkedin: "From LinkedIn",
  development: "In development",
  custom: "",
};

const LatestItemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: Object.keys(KINDS),
      default: "custom",
      index: true,
    },
    // Overrides the chip implied by `kind`. Blank means use the default.
    tag: { type: String, trim: true, default: "", maxlength: 40 },

    title: { type: String, trim: true, required: true, maxlength: 200 },
    blurb: { type: String, trim: true, default: "", maxlength: 400 },

    imageUrl: { type: String, trim: true, default: "", maxlength: 600 },

    ctaLabel: { type: String, trim: true, default: "Read more", maxlength: 60 },
    // Either an app path ("/whats-new") or an absolute URL (a LinkedIn post).
    // The renderer picks a router Link or a plain external anchor from this.
    ctaHref: { type: String, trim: true, default: "", maxlength: 600 },

    published: { type: Boolean, default: true, index: true },
    // Lowest first, so the band reads in the order the admin arranged it.
    sort: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

// The band asks for "published, in order, newest as tiebreak" on every page
// load, so index exactly that.
LatestItemSchema.index({ published: 1, sort: 1, createdAt: -1 });

export const LatestItem =
  mongoose.models.LatestItem || mongoose.model("LatestItem", LatestItemSchema);

export default LatestItem;
