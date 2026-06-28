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

    // Owner — matches the user's _id or identifier from the ADLM auth system
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
    // Use the same collection the WPF app writes to
    collection: process.env.TIMEMGT_COLLECTION || "LaborTasks",
    // Don't add __v — WPF doesn't set it and it clutters documents
    versionKey: false,
  }
);

// Virtual: net hours (mirrors WPF computed property)
laborTaskSchema.virtual("netHoursWorked").get(function () {
  return Math.max(0, (this.hoursWorked || 0) - (this.breakHours || 0));
});

/**
 * Returns the model bound to a specific mongoose Connection.
 * Called from routes with the TimeMgt connection so the model
 * targets the right cluster without polluting the main adlmWeb connection.
 */
export function getLaborTaskModel(conn) {
  // Reuse cached model if already registered on this connection
  if (conn.models.LaborTask) return conn.models.LaborTask;
  return conn.model("LaborTask", laborTaskSchema);
}
