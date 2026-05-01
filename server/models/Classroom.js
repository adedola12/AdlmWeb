import mongoose from "mongoose";

/**
 * Classroom — an ad-hoc training entry granted by an admin, typically for
 * a company cohort. One Classroom holds N members (users); admins can
 * add/remove members later without losing the title/code/url config.
 *
 * Independent of PaidCourse / PTrainingEvent.
 *
 * Surfaces in each member's "My Courses" section on the dashboard with two
 * buttons: Go to Classroom and Download Certificate.
 */
const ClassroomMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Snapshot of identifying info at add time so deleted users still
    // render legibly in the admin list.
    userEmail: { type: String, trim: true, lowercase: true, default: "" },
    userName: { type: String, trim: true, default: "" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ClassroomSchema = new mongoose.Schema(
  {
    // Cohort members. Indexed on members.userId so /me/classrooms can find
    // every classroom a given user belongs to.
    members: { type: [ClassroomMemberSchema], default: [] },

    // ── Legacy single-user fields (pre-cohort schema) ──
    // Kept so any rows already created before this migration still resolve
    // correctly. New writes go to members[]; reads fall back to these when
    // members[] is empty (see /me/classrooms and /admin/classrooms).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userEmail: { type: String, trim: true, lowercase: true, default: "" },
    userName: { type: String, trim: true, default: "" },

    // Title shown on the dashboard card.
    title: { type: String, required: true, trim: true },

    // Optional description / vendor / context line.
    description: { type: String, default: "", trim: true },

    // Classroom code (e.g. Google Classroom join code). The "Go to Classroom"
    // button uses classroomUrl when set, otherwise constructs
    // https://classroom.google.com/c/{classroomCode}.
    classroomCode: { type: String, default: "", trim: true },
    classroomUrl: { type: String, default: "", trim: true },

    // Optional company tag for admin filtering. Not enforced.
    companyName: { type: String, default: "", trim: true },

    // Set to false to hide from all members without deleting the record.
    isActive: { type: Boolean, default: true },

    // Audit
    createdBy: { type: String, default: "" }, // admin email
  },
  { timestamps: true },
);

ClassroomSchema.index({ "members.userId": 1, isActive: 1 });
ClassroomSchema.index({ userId: 1, isActive: 1 }); // legacy fallback
ClassroomSchema.index({ companyName: 1 });

export const Classroom =
  mongoose.models.Classroom || mongoose.model("Classroom", ClassroomSchema);
