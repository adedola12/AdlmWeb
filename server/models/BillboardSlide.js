// A slide in the band that rotates low on every public page.
//
// WHY THIS IS A SCHEDULE AND NOT A BANNER EDITOR
//
// Richard's note on his own screen is the whole design: "if we have an event
// coming up… the details of that particular banner needs to be controlled as
// an admin, where we can push or manage what is on it PER TIME."
//
// Per time is the point. A banner with a save button has to be taken down by
// somebody who remembers to, and the thing nobody remembers is taking down
// last month's event. So every slide carries the window it may run in, the
// band works out what is live when a page loads, and a slide whose end date
// has passed stops on its own.
//
// TWO KINDS, BECAUSE ONE OF THEM HAS A DATE
//
// An announcement is a release, a course opening, a price change. An event is
// the same plus a date, a time and a venue, which the band prints as its own
// line above the copy. The form asks which first, because the answer changes
// what it needs to know.

import mongoose from "mongoose";

const BillboardSlideSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["notice", "event"], default: "notice" },

    // Two or three words above the headline — "New release", "Course open".
    tag: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    sub: { type: String, default: "", trim: true },

    // Fills the left half of the band. Landscape, 1600px or wider.
    art: { type: String, default: "", trim: true },

    cta: { type: String, required: true, trim: true },
    href: { type: String, required: true, trim: true },

    // Event only. Kept as free text rather than a Date for time and venue:
    // "9:30am – 4pm" and "Online, on Teams" are how a person says it, and
    // parsing them into structure would only be to print them back out.
    date: { type: String, default: "", trim: true },
    time: { type: String, default: "", trim: true },
    venue: { type: String, default: "", trim: true },

    // The window. Both optional: empty `from` means start now, empty `to`
    // means run until somebody turns it off. Stored as YYYY-MM-DD strings
    // rather than Dates because the comparison that matters is calendar-day
    // in Lagos, not an instant in UTC — a slide set to end on the 4th should
    // still be up at 11pm on the 4th, whatever a UTC timestamp thinks.
    from: { type: String, default: "" },
    to: { type: String, default: "" },

    // Off keeps it here as a draft and off the site.
    on: { type: Boolean, default: false },

    // The order it rotates in.
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

/** Today in Lagos, as YYYY-MM-DD — the same clock the windows are written in. */
export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

/**
 * What a slide is doing right now.
 *
 * Ordered so the first true answer wins: unpublished beats everything, then
 * not started, then finished. Anything left is live.
 */
export function slideState(s, now = today()) {
  if (!s.on) return "draft";
  if (s.from && s.from > now) return "scheduled";
  if (s.to && s.to < now) return "ended";
  return "live";
}

export const BillboardSlide = mongoose.model("BillboardSlide", BillboardSlideSchema);
