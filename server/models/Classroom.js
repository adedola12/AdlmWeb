import mongoose from "mongoose";

/**
 * Classroom — an ad-hoc training entry granted to a single user by an admin.
 *
 * Independent of PaidCourse / PTrainingEvent: this is for bespoke trainings
 * (e.g. a Revit class arranged for one company) where the admin just needs
 * to drop a Google Classroom code in front of the trained user without
 * standing up a full course catalog entry.
 *
 * Surfaces in the user's "My Courses" section on the dashboard with two
 * buttons: Go to Classroom and Download Certificate.
 */
const ClassroomSchema = new mongoose.Schema(
  {
    // The user this classroom is granted to. The admin picks them via the
    // /admin/classrooms/users-suggest autocomplete.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot of identifying info at grant time so deleted users don't
    // orphan the record's display.
    userEmail: { type: String, trim: true, lowercase: true, default: "" },
    userName: { type: String, trim: true, default: "" },

    // Title shown on the user's dashboard card.
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

    // Set to false to hide from the user without deleting the record.
    isActive: { type: Boolean, default: true },

    // Audit
    createdBy: { type: String, default: "" }, // admin email
  },
  { timestamps: true },
);

ClassroomSchema.index({ userId: 1, isActive: 1 });
ClassroomSchema.index({ companyName: 1 });

export const Classroom =
  mongoose.models.Classroom || mongoose.model("Classroom", ClassroomSchema);
