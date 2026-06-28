import mongoose from "mongoose";

const weatherConditionSchema = new mongoose.Schema(
  {
    condition: { type: String, default: "" },
    temperature: { type: Number, default: 0 },
    windSpeed: { type: Number, default: 0 },
    date: { type: Date },
  },
  { _id: false }
);

const laborTaskSchema = new mongoose.Schema(
  {
    // WPF primary key — a guid string used for upserts
    taskKey: { type: String, required: true, unique: true, index: true },

    // Owner — the authenticated user's _id from the ADLM auth system
    ownerKey: { type: String, index: true },

    // Audit timestamps (WPF sets these; Express preserves them on update)
    createdAtUtc: { type: Date, default: () => new Date() },
    updatedAtUtc: { type: Date, default: () => new Date() },

    // Task fields (matching WPF LaborTask exactly)
    iD: { type: Number, default: 0 },
    itemOfWork: { type: String, default: "" },
    trade: { type: String, default: "" },
    skilledLabor: { type: Number, default: 0 },
    unskilledLabor: { type: Number, default: 0 },
    hoursWorked: { type: Number, default: 0 },
    breakHours: { type: Number, default: 0 },
    equipmentUsed: { type: String, default: "" },
    output: { type: Number, default: 0 },
    outputUnit: { type: String, default: "units" },
    taskStartDate: { type: Date },
    taskEndDate: { type: Date },

    weather: { type: weatherConditionSchema, default: null },
  },
  {
    // Stored in the main adlmWeb DB alongside all other collections
    collection: "timemgtTasks",
    versionKey: false,
  }
);

laborTaskSchema.virtual("netHoursWorked").get(function () {
  return Math.max(0, (this.hoursWorked || 0) - (this.breakHours || 0));
});

// Singleton model bound to the default mongoose connection (adlmWeb).
// Guard against model re-registration during hot-reload in development.
export const LaborTask =
  mongoose.models.TimeMgtTask ||
  mongoose.model("TimeMgtTask", laborTaskSchema);
