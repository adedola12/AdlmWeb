// server/models/ClientNetError.js
//
// A browser telling us a request to the API never completed.
//
// Y.S. Associates' dashboard read "Failed to fetch" for two months and the
// server logged nothing, because a request that never arrives leaves no trace
// on the server. The site now reports those failures itself (see
// client/src/lib/netFailureBeacon.js), so a customer stuck behind a bad
// network shows up in the morning report instead of on a phone call weeks
// later.
//
// The identity fields are whatever the browser claims. They are good enough
// to tell staff who to ring and must never be trusted for anything else.

import mongoose from "mongoose";

const ClientNetErrorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, trim: true, lowercase: true, default: "", maxlength: 200 },
    // API path only, never the query string.
    path: { type: String, trim: true, default: "", maxlength: 200 },
    method: { type: String, trim: true, default: "", maxlength: 10 },
    // The site page the person was on.
    page: { type: String, trim: true, default: "", maxlength: 200 },
    online: { type: Boolean, default: null },
    message: { type: String, trim: true, default: "", maxlength: 200 },
    ua: { type: String, trim: true, default: "", maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// A month is enough to see a pattern, and the collection stays small.
ClientNetErrorSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const ClientNetError =
  mongoose.models.ClientNetError || mongoose.model("ClientNetError", ClientNetErrorSchema);

export default ClientNetError;
