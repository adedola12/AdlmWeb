import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    fxRateNGNUSD: { type: Number, default: 0.001 }, // 1 NGN = 0.001 USD (example)
    mobileAppUrl: { type: String, default: "" }, // APK / mobile app download link
    installerHubUrl: { type: String, default: "" }, // Installer Hub setup file download link
    installerHubVideoUrl: { type: String, default: "" }, // Setup guide video URL

    // Force-reinstall broadcast: when set, all clients show a banner instructing
    // users to redownload the Installer Hub, watch the setup video, reinstall, and
    // redownload all software updates. Cleared by setting forceReinstallActive=false.
    forceReinstallActive: { type: Boolean, default: false },
    forceReinstallMessage: { type: String, default: "" },
    forceReinstallAt: { type: Date, default: null },

    // ── VAT / Tax ──
    // When vatEnabled is true and the matching apply* flag is set, the server
    // adds VAT to the total of that document type. The label (e.g. "VAT 7.5%")
    // is what shows in checkout summaries, receipts, quotes, and invoice PDFs.
    vatEnabled: { type: Boolean, default: false },
    vatPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatLabel: { type: String, default: "VAT", trim: true },
    vatApplyToPurchases: { type: Boolean, default: true },
    vatApplyToQuotes: { type: Boolean, default: true },
    vatApplyToInvoices: { type: Boolean, default: true },

    // ── Proposal counter-sign ──
    // Stable, unique code for the ADLM founder / main account. Embedded in the
    // counter-sign QR on every proposal. Auto-generated once on first use.
    founderSignatureCode: { type: String, default: "" },
    founderSignatureName: {
      type: String,
      default: "Adedolapo Quasim · Founder, ADLM Studio",
    },
  },
  { timestamps: true }
);

export const Setting = mongoose.model("Setting", SettingSchema);
