import mongoose from "mongoose";

const DeviceBindingSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
    boundAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    // Fingerprint algorithm version, as the client reports it:
    //   1 = legacy, MAC-based (and the ArchiCAD client)
    //   2 = a stable id, but NOT one recipe. The Installer Hub and most apps
    //       send SHA256(CPUId|BIOS SN|Board SN) ("hw2"); the shipped QUIV
    //       Revit plugin sends SHA256("v2|" + MachineGuid + "|" + UserName)
    //       ("mgu2"). The same PC therefore has two different v2 ids.
    // Used for the seamless one-time migration from v1 → v2. Which recipe a
    // row holds is `scheme` below (util/deviceIdentity.js).
    fpVersion: { type: Number, default: 1, min: 1 },

    // Provenance, recorded from DEVICE_SCHEME_AWARE_BINDING onwards (older
    // rows have none of these; util/deviceIdentity.js infers them). No
    // defaults on purpose: "absent" is what marks a row as written before.
    //   source   "installer-hub" (bind-device) | "app" (a desktop sign-in)
    //   scheme   "hw2" | "mgu2" | "v1": the recipe behind `fingerprint`
    //   client   x-adlm-client header, or the User-Agent product token
    source: { type: String, trim: true },
    scheme: { type: String, trim: true },
    client: { type: String, trim: true },
    // Set when an app sign-in took this seat over from an Installer Hub row:
    // the Hub's id and device name are kept here for support.
    installerFingerprint: { type: String, trim: true },
    installerName: { type: String },
    adoptedAt: { type: Date },
    // Last time an app sign-in matched or wrote this row. A row with this set
    // is app use and is never adopted away from its machine.
    appSeenAt: { type: Date },
  },
  { _id: false },
);

const EntitlementSchema = new mongoose.Schema(
  {
    productKey: { type: String, required: true, trim: true, lowercase: true },

    status: {
      type: String,
      enum: ["active", "inactive", "disabled", "expired"],
      default: "inactive",
    },

    expiresAt: { type: Date },

    seats: { type: Number, default: 1, min: 1 },
    devices: { type: [DeviceBindingSchema], default: [] },

    licenseType: {
      type: String,
      enum: ["personal", "organization"],
      default: "personal",
    },
    organizationName: { type: String, trim: true, default: "" },

    deviceFingerprint: { type: String, trim: true },
    deviceBoundAt: { type: Date },

    notify: {
      lastSentAt: { type: Date, default: null },
      lastSentKind: { type: String, enum: ["pre", "post"], default: null },
      lastSentDays: { type: Number, default: null },
    },

    // ── Auto-renewal (opt-in, NGN card charges via stored Paystack token) ──
    // All fields are additive so desktop plugins (which read productKey /
    // status / expiresAt / seats / devices) are unaffected.
    autoRenew: { type: Boolean, default: false },
    // Renewal term in months, seeded from the original purchase line
    // (periods × interval, capped at 12). Price is recomputed at charge time.
    autoRenewMonths: { type: Number, default: 1, min: 1, max: 12 },
    renewal: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
      // Expiry the current attempt-cycle belongs to — when expiresAt moves
      // (successful renewal or manual purchase) the counter resets.
      cycleExpiryAt: { type: Date, default: null },
    },

    // Extra project slots purchased by the user for this product.
    // Admin sets this when approving a storage add-on purchase.
    extraProjectSlots: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      index: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    username: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
      trim: true,
    },

    avatarUrl: { type: String, default: "" },

    // Beta programme: the user agreed, from inside a desktop plugin, to have
    // its diagnostic log sent to ADLM automatically. Written by POST
    // /usage/beta and by the first successful POST /usage/logs. Read by the
    // admin usage view; nothing else depends on it.
    betaTester: {
      optedIn: { type: Boolean, default: false },
      productKey: { type: String, default: "", trim: true, lowercase: true },
      since: { type: Date, default: null },
      leftAt: { type: Date, default: null },
    },

    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },

    // Locked certificate name — set once on first certificate download, immutable after.
    certificateFirstName: { type: String, default: "", trim: true },
    certificateLastName: { type: String, default: "", trim: true },
    certificateNameLockedAt: { type: Date, default: null },
    whatsapp: { type: String, default: "", trim: true },
    // WhatsApp number proved by a code sent over WhatsApp (util/whatsappVerify.js).
    // Tied to the exact number: changing the number clears it.
    whatsappVerified: { type: Boolean, default: false },
    whatsappVerifiedAt: { type: Date, default: null },
    whatsappVerifiedNumber: { type: String, default: "" },
    whatsappCodeHash: { type: String, default: "" },
    // The number the pending code went to: a code proves that number only.
    whatsappCodeNumber: { type: String, default: "" },
    whatsappCodeExpires: { type: Date, default: null },
    whatsappCodeSentAt: { type: Date, default: null },
    whatsappCodeAttempts: { type: Number, default: 0 },

    // Optional user-supplied profile details.
    location: { type: String, default: "", trim: true },
    firmName: { type: String, default: "", trim: true },

    zone: {
      type: String,
      enum: [
        "north_west",
        "north_east",
        "north_central",
        "south_west",
        "south_east",
        "south_south",
      ],
      default: null,
    },

    // The state the user prices in. Preferred over `zone` everywhere both are
    // present; `zone` is kept because it is what older clients send and what
    // the price evidence is actually graded at. Not an enum: the valid list
    // lives in util/states.js and validating in two places guarantees they
    // drift apart.
    state: { type: String, default: null, trim: true, lowercase: true },

    // Empty for an account created through Google or Microsoft, because
    // there is no password to hash. That is not a loose end to tidy up: the
    // desktop plugins sign in through POST /auth/login with an ADLM password,
    // so a social-only account cannot use QUIV, HERON or any of the others
    // until the person sets one. See POST /me/password, and the prompt the
    // website shows them after a social sign-in.
    passwordHash: { type: String, default: "" },

    // Subject claims from the identity providers, NOT emails.
    //
    // The provider's `sub` is the stable identifier; an email address can be
    // changed by its owner and reassigned by a workspace administrator, so
    // matching on email alone would eventually hand one person's ADLM account
    // to whoever inherited their address. Email is used only to LINK a social
    // login to an existing account on first use, and only when the provider
    // says it has verified it.
    googleId: { type: String, default: null, index: true, sparse: true },
    microsoftId: { type: String, default: null, index: true, sparse: true },
    autodeskId: { type: String, default: null, index: true, sparse: true },

    // Role key — references a Role.key (see server/models/Role.js). No enum so
    // admins can create custom roles; validated against existing roles on
    // assignment. "user" is the default no-admin-access role.
    role: {
      type: String,
      default: "user",
      lowercase: true,
      trim: true,
    },

    disabled: { type: Boolean, default: false },
    // Why and when, for a disable that was not done by hand (so an admin
    // reading the account can tell a closed ghost from a banned user).
    disabledReason: { type: String, default: "" },
    disabledAt: { type: Date, default: null },
    // The one "confirm your email or the account closes" reminder, and so the
    // start of the 14-day clock (util/unconfirmedSweep.js).
    emailVerifyReminderAt: { type: Date, default: null },

    // Break-glass "God" support account flag. On its own this does NOTHING —
    // God powers only activate when this is true AND the email is also listed
    // in the GOD_ACCOUNT_EMAILS deploy env var (see server/util/godAccount.js).
    // Grants a fully-audited, OTP-gated super-admin that bypasses device/seat
    // binding so the technical team can sign in on any machine to fix issues.
    isGod: { type: Boolean, default: false },

    // Per-user security preferences. stepUpEnabled = require an emailed OTP
    // before sensitive actions (deleting projects, locking/unlocking a
    // contract). Off by default — opt-in from the profile page.
    security: {
      stepUpEnabled: { type: Boolean, default: false },
    },

    entitlements: { type: [EntitlementSchema], default: [] },

    // Saved card for auto-renewals — Paystack's reusable authorization token
    // plus display metadata. NEVER the PAN/CVV (see util/paymentMethods.js).
    // The sensitive paths are select:false so ordinary user queries (and any
    // route that echoes the user document) can't leak them; the renewal cron
    // opts in with .select("+paymentMethod.authorizationCode").
    paymentMethod: {
      provider: { type: String, default: "paystack" },
      authorizationCode: { type: String, select: false },
      signature: { type: String, select: false },
      last4: { type: String, default: "" },
      expMonth: { type: String, default: "" },
      expYear: { type: String, default: "" },
      cardType: { type: String, default: "" },
      bank: { type: String, default: "" },
      countryCode: { type: String, default: "" },
      reusable: { type: Boolean, default: false },
      savedAt: { type: Date },
    },

    // What this account wants to hear about.
    //
    // Defaults are the three that concern something the person is paying for
    // or relying on; marketing is off unless asked for, which is the only
    // defensible default for it. Absent on older accounts, so every read has
    // to fall back to these rather than to false — an account created before
    // this field existed should not silently stop receiving its invoices.
    notifications: {
      productUpdates: { type: Boolean, default: true },
      billing: { type: Boolean, default: true },
      seatsAndMembers: { type: Boolean, default: true },
      coursesAndEvents: { type: Boolean, default: false },
    },

    refreshVersion: { type: Number, default: 1 },
    welcomeEmailSentAt: { type: Date, default: null },

    /* ── is this a real address? ──────────────────────────────────────────
     *
     * Nothing checked, until now. Signup created the account and handed back
     * a working token, so anybody could register with an address they had
     * invented and the studio would carry them forever — and every mail sent
     * to them would bounce quietly.
     *
     * The code is stored HASHED. It is six digits, which is small enough that
     * a leaked database plus a plaintext column would let somebody verify
     * another person's address at leisure. Same reasoning as a password, on a
     * shorter secret.
     */
    emailVerified: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date, default: null },
    emailVerifyHash: { type: String, default: "" },
    emailVerifyExpires: { type: Date, default: null },
    // Rate limiting lives on the record rather than in memory, so restarting
    // the server is not a way to get around it.
    emailVerifySentAt: { type: Date, default: null },
    emailVerifyAttempts: { type: Number, default: 0 },
    // Unconfirmed accounts: verification codes sent today, and how many times
    // the address was changed while confirming (routes/auth.js limits both).
    emailVerifyResends: { type: Number, default: 0 },
    emailVerifyResendDay: { type: String, default: "" },
    emailChangeCount: { type: Number, default: 0 },

    /* ── does this address still accept mail? ─────────────────────────────
     *
     * `emailVerified` says somebody proved the address existed once.
     * This says whether it still works, which is a different question and one
     * only the receiving server can answer — by rejecting a message.
     *
     * Set from SES bounce and complaint events (util/mailFeedback.js). ONLY a
     * PERMANENT bounce lands here: a full mailbox or a server having an
     * afternoon is a Transient bounce and means nothing about tomorrow, so
     * treating it as death would quietly unsubscribe people for an outage they
     * had no part in.
     *
     * WHAT IT BLOCKS, AND WHAT IT DOES NOT
     *
     * Bulk mail only — campaigns, broadcasts, video announcements. Continuing
     * to mail a dead address is how a sender's reputation is spent, and there
     * is nobody at the other end to benefit.
     *
     * It deliberately does NOT gate receipts, resets or licence mail. If this
     * flag is ever set wrongly, a customer who cannot receive a password reset
     * is locked out of software they paid for, whereas a receipt sent to a
     * genuinely dead address merely fails — the same way it does today. SES's
     * own account-level suppression list already refuses those sends at the
     * API, which is the right place for it: one list, applied to everything,
     * that we do not have to keep correct ourselves.
     */
    emailUndeliverable: { type: Boolean, default: false, index: true },
    emailUndeliverableAt: { type: Date, default: null },
    /** "bounce" or "complaint" — why we stopped. */
    emailUndeliverableReason: { type: String, default: "" },
    /** The receiving server's own words, trimmed. What support actually needs. */
    emailUndeliverableDetail: { type: String, default: "" },

    /* ── does this person want marketing mail? ────────────────────────────
     *
     * Default true, because an ADLM account is a business relationship and
     * telling a customer their software gained a feature is a reasonable
     * thing to do. What matters is that saying no is easy and is obeyed.
     *
     * THIS FLAG ONLY EVER GOVERNS MARKETING.
     *
     * Receipts, licence activations, renewal failures, password resets and
     * support replies ignore it entirely. Somebody who opts out of the
     * newsletter has not opted out of being told their card was declined,
     * and a system that conflated the two would be both useless and,
     * for the billing ones, arguably unlawful.
     */
    emailPrefs: {
      marketing: { type: Boolean, default: true },
      marketingChangedAt: { type: Date, default: null },
      // Why it went off. "asked" is somebody clicking unsubscribe; "bounced"
      // is us switching it off because the address stopped accepting mail.
      marketingOffReason: { type: String, default: "" },

      /**
       * "Tell me when ADLM Studio publishes a video."
       *
       * A SEPARATE switch from `marketing`, not a sub-case of it. Somebody who
       * does not want offers may well still want the tutorials — those are the
       * reason a lot of these accounts exist — and folding the two together
       * would mean the only way to keep the videos is to keep the offers.
       *
       * Default true, and read with `!== false` everywhere, so an account
       * created before this field existed is opted IN rather than silently
       * dropped from the list.
       */
      videoUpdates: { type: Boolean, default: true },
      videoUpdatesChangedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
