// server/models/Suppression.js
//
// The permanent do-not-contact list for outbound prospecting. Checked before
// a prospect or contact is added and (phase 2) before anything is sent.
// Nothing in the app removes a row: an opt-out is forever (NDPA 2023).
//
// Stores a SHA-256 of the lowercased email, not the address. That is what
// lets the delete-on-request action erase a person's data completely while
// still honouring their opt-out: we can recognise the address if it turns up
// again without holding it.
//
// A row may instead suppress a whole company domain ("do not contact anyone
// at this firm"). Company domains are not personal data, so they are stored
// in the clear.
import mongoose from "mongoose";

export const SUPPRESSION_REASONS = [
  "opt_out",          // replied "stop" or asked not to be emailed
  "deletion_request", // asked for their data to be deleted
  "bad_fit",          // a reviewer ruled the whole firm out
  "manual",           // added by an admin
];

const SuppressionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["email", "domain"], required: true },
    // kind "email": hex SHA-256 of the normalised address (hashEmail).
    emailHash: { type: String, trim: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
    // kind "domain": the normalised company domain (normaliseDomain).
    domain: { type: String, trim: true, lowercase: true, maxlength: 253 },

    reason: { type: String, enum: SUPPRESSION_REASONS, required: true },
    note: { type: String, trim: true, default: "", maxlength: 1000 },
    addedBy: { type: String, trim: true, lowercase: true, default: "" },
  },
  { timestamps: true },
);

SuppressionSchema.pre("validate", function requireKey() {
  if (this.kind === "email" && !this.emailHash) this.invalidate("emailHash", "An email suppression needs emailHash.");
  if (this.kind === "domain" && !this.domain) this.invalidate("domain", "A domain suppression needs domain.");
});

SuppressionSchema.index({ emailHash: 1 }, { unique: true, partialFilterExpression: { kind: "email" } });
SuppressionSchema.index({ domain: 1 }, { unique: true, partialFilterExpression: { kind: "domain" } });

export const Suppression = mongoose.models.Suppression || mongoose.model("Suppression", SuppressionSchema);

export default Suppression;
