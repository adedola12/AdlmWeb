import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    fxRateNGNUSD: { type: Number, default: 0.001 }, // 1 NGN = 0.001 USD (example)
    mobileAppUrl: { type: String, default: "" }, // APK / mobile app download link
    installerHubUrl: { type: String, default: "" }, // Installer Hub setup file download link
    installerHubVideoUrl: { type: String, default: "" }, // Setup guide video URL
    installerHubGuideUrl: { type: String, default: "" }, // Installer Hub user guide PDF link

    // Force-reinstall broadcast: when set, all clients show a banner instructing
    // users to redownload the Installer Hub, watch the setup video, reinstall, and
    // redownload all software updates. Cleared by setting forceReinstallActive=false.
    forceReinstallActive: { type: Boolean, default: false },
    forceReinstallMessage: { type: String, default: "" },
    forceReinstallAt: { type: Date, default: null },

    // ── Dashboard notice ──
    // A plain announcement banner, deliberately separate from the
    // force-reinstall broadcast above. That one is NOT a notification: it
    // revokes every device binding and bumps refreshVersion on every user,
    // signing the whole fleet out and forcing re-activation. So there was no
    // way to tell customers "a new Installer Hub is out" without also logging
    // them all out, and routine announcements simply went unsent. This is the
    // missing tool.
    //
    // Purely informational: changes no entitlement, revokes nothing. Cleared
    // by setting noticeActive=false.
    noticeActive: { type: Boolean, default: false },
    noticeTitle: { type: String, default: "", trim: true },
    noticeMessage: { type: String, default: "" },
    // "info" | "success" | "warn" — drives the banner's colour only.
    noticeLevel: { type: String, default: "info", trim: true },
    noticeLinkUrl: { type: String, default: "", trim: true },
    noticeLinkLabel: { type: String, default: "", trim: true },
    noticeAt: { type: Date, default: null },

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

    // ── AI credit pool (AWS) ──
    // What the AI-usage dashboard burns down against. Kept here rather than in
    // env so finance can update the grant without a deploy. Falls back to
    // AWS_CREDIT_TOTAL_USD when unset.
    aiCreditLabel: { type: String, default: "AWS credit" },
    aiCreditTotalUsd: { type: Number, default: 0, min: 0 },
    aiCreditStartAt: { type: Date, default: null },
    aiCreditExpiresAt: { type: Date, default: null },
    // Spend already consumed on AWS before this dashboard started metering
    // (or outside it — e.g. plugin traffic hitting the AI service directly).
    aiCreditOpeningSpendUsd: { type: Number, default: 0, min: 0 },

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
