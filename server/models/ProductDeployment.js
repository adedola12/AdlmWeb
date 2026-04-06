import mongoose from "mongoose";

const InstallOperationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["copyDirectory", "copyFile", "createShortcut", "hideDirectory", "runExe"],
      default: "copyDirectory",
    },
    source: { type: String, trim: true, default: "." },
    target: { type: String, trim: true, required: true },
    overwrite: { type: Boolean, default: true },
    cleanTargetOnUpdate: { type: Boolean, default: false },
    preservePatterns: { type: [String], default: [] },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const ProductDeploymentSchema = new mongoose.Schema(
  {
    productKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    displayName: { type: String, trim: true, default: "" },
    packageUri: { type: String, trim: true, default: "" },
    packageKind: {
      type: String,
      enum: ["file", "zip"],
      default: "file",
    },
    version: { type: String, trim: true, default: "" },
    installArguments: { type: String, trim: true, default: "" },
    waitForExit: { type: Boolean, default: false },
    markInstalledAfterLaunch: { type: Boolean, default: true },
    requiresElevation: { type: Boolean, default: true },
    operations: { type: [InstallOperationSchema], default: [] },
    enabled: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
    updatedBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true, minimize: false },
);

export const ProductDeployment =
  mongoose.models.ProductDeployment ||
  mongoose.model("ProductDeployment", ProductDeploymentSchema);

