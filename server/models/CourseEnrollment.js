import mongoose from "mongoose";

const CourseEnrollmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, index: true },
    courseSku: { type: String, index: true },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    completedModules: { type: [String], default: [] },
    certificateUrl: { type: String },
    certificateIssuedAt: { type: Date },

    /* ── the certificate as a thing that can be withdrawn ──────────────────
     *
     * Richard, on his own screen: "if I want to revoke a certificate, how do I
     * revoke a certificate." Until now there was nothing to revoke — a
     * certificate was a PDF at a URL and a date, with no state and no way to
     * say it should no longer be honoured.
     *
     * WHAT REVOKING CAN AND CANNOT DO HERE
     *
     * It cannot unpublish the PDF. The file sits on Cloudinary at a public
     * URL and whoever downloaded it still has it — no record in this database
     * changes that, and pretending otherwise would be the worst kind of
     * comfort.
     *
     * What it does is make the certificate fail verification, which is the
     * thing an employer or a tender board actually checks. That is why the
     * reference below is stored rather than derived: it is printed on the
     * certificate and typed into the verify page, so it has to survive a
     * reissue and mean the same thing on both sides.
     */

    // Stable, public, and quotable. Assigned on first issue and never reused.
    certificateRef: { type: String, default: "", index: true },

    // "issued" is the normal path — every module passed. "reissued" is a
    // fresh copy of the same pass. "revoked" is withdrawn, and it is the
    // reason this field exists at all.
    certificateState: {
      type: String,
      enum: ["issued", "reissued", "revoked"],
      default: "issued",
    },

    // Never optional in practice: every path that sets a state other than the
    // automatic one demands a reason, because a certificate that was withdrawn
    // for reasons nobody wrote down cannot be explained to the person holding
    // it, or to an employer who asks.
    certificateWhy: { type: String, default: "" },

    // Set only when a certificate was issued by hand, where there is no run of
    // quiz attempts to average. Left null on the normal path so the mark is
    // read from the attempts and cannot drift from them.
    certificateMark: { type: Number, default: null },

    certificateStateAt: { type: Date, default: null },
    certificateStateBy: { type: String, default: "" },
    accessStartedAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
    classroomLastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CourseEnrollment =
  mongoose.models.CourseEnrollment ||
  mongoose.model("CourseEnrollment", CourseEnrollmentSchema);
