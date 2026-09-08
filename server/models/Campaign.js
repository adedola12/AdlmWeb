// A marketing message, from draft to sent.
//
// WHY A RECORD AND NOT JUST A SEND BUTTON
//
// A campaign is the one kind of mail nobody can take back. Everything else
// the studio sends answers something a person just did, goes to exactly one
// address, and is wrong in a way that affects one person. This goes to
// hundreds at once, on somebody's decision rather than a customer's action.
//
// So it is a record before it is a send: drafted, previewed, tested on one
// address, then sent — and afterwards it says who it went to and who it
// skipped. Without the record there is no way to answer "what did we send in
// August, and to whom", which is the first question anybody asks when a
// customer replies angrily to something from six weeks ago.

import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    // The grey line beside the subject in an inbox list. Left empty, mail
    // clients pull in whatever text comes first, which is rarely the line you
    // would have chosen.
    preheader: { type: String, default: "", trim: true },
    heading: { type: String, default: "", trim: true },
    body: { type: String, default: "", trim: true },
    ctaLabel: { type: String, default: "", trim: true },
    ctaHref: { type: String, default: "", trim: true },

    /**
     * Who it goes to.
     *
     * Deliberately a small, closed list rather than a query builder. A free
     * query over the user collection is how somebody accidentally mails
     * everybody at three in the morning; these are the audiences the studio
     * actually has a reason to write to, and each one is a sentence a person
     * can check before pressing send.
     */
    audience: {
      type: String,
      enum: [
        "everyone",
        "customers", // holds at least one active entitlement
        "lapsed", // held one, does not now
        "never-bought", // an account, no entitlement ever
        "product", // holds a particular product
      ],
      default: "everyone",
    },
    // Only meaningful when audience is "product".
    productKey: { type: String, default: "", trim: true, lowercase: true },

    status: {
      type: String,
      enum: ["draft", "sending", "sent", "failed"],
      default: "draft",
      index: true,
    },

    // What happened, kept as figures rather than recomputed later: the
    // audience moves, so counting it again next month answers a different
    // question from the one somebody is asking.
    stats: {
      audience: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      // People in the audience who had opted out. Worth showing: a campaign
      // that "went to 40 of 300" is a fact about consent, not a failure.
      skippedOptedOut: { type: Number, default: 0 },
      skippedUnverified: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    testSentTo: { type: String, default: "", trim: true },
    testSentAt: { type: Date, default: null },

    sentAt: { type: Date, default: null },
    sentByEmail: { type: String, default: "", trim: true },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Campaign = mongoose.model("Campaign", CampaignSchema);
