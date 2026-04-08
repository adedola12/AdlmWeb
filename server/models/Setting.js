import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    fxRateNGNUSD: { type: Number, default: 0.001 }, // 1 NGN = 0.001 USD (example)
    mobileAppUrl: { type: String, default: "" }, // APK / mobile app download link
    installerHubUrl: { type: String, default: "" }, // Installer Hub setup file download link
    installerHubVideoUrl: { type: String, default: "" }, // Setup guide video URL
  },
  { timestamps: true }
);

export const Setting = mongoose.model("Setting", SettingSchema);
