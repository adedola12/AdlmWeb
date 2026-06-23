import mongoose from "mongoose";

// Per-service-type constants for the MEP build-up engine. One document per user
// (a firm's house standards). Values are merged over SERVICE_TYPE_DEFAULTS at
// read time, so a user only needs to store the values they actually override.
const ServiceTypeConstantSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, lowercase: true }, // pipe | duct | cable | conduit | tray | fixture | equipment | custom
    measure: { type: String, enum: ["length", "count"], default: "length" },
    unit: { type: String, default: "m" },
    standardLength: { type: Number, default: 0 }, // metres per stick/bundle (0 = continuous, no bundling)
    connectorRule: {
      type: String,
      enum: ["perBreak", "perStick", "none"],
      default: "perBreak",
    },
    connectorsPerJoint: { type: Number, default: 1 },
    fittingUpliftPercent: { type: Number, default: 0 }, // % allowance on material for fittings
  },
  { _id: false },
);

const ServiceConstantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      unique: true,
    },
    unitSystem: { type: String, enum: ["metric", "imperial"], default: "metric" },
    types: { type: [ServiceTypeConstantSchema], default: [] },
  },
  { timestamps: true },
);

export const ServiceConstant =
  mongoose.models.ServiceConstant ||
  mongoose.model("ServiceConstant", ServiceConstantSchema);
