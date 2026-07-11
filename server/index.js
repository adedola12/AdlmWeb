import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB } from "./db.js";
import cron from "node-cron";
import { runExpiryNotifier } from "./util/expiryNotifier.js";
import { runAutoRenewals } from "./util/autoRenew.js";
import { ensureRolesSeeded } from "./util/rbac.js";
import { authLimiter, deviceLimiter, generalLimiter } from "./middleware/rateLimiter.js";

import { registerDynamicMetaRoutes } from "./routes/meta.dynamic.js";

// routes
import wellKnownRoutes from "./routes/wellKnown.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import meBillingRoutes from "./routes/me.billing.js";
import meDeploymentsRoutes from "./routes/me.deployments.js";
import meCourses from "./routes/meCourses.js";
import adminRoutes from "./routes/admin.js";
import adminDeploymentsRoutes from "./routes/admin.deployments.js";
import adminCourses from "./routes/adminCourses.js";
import adminSoftwares from "./routes/admin.softwares.js";
import adminClassrooms from "./routes/admin.classrooms.js";
import meClassrooms from "./routes/me.classrooms.js";
import adminCourseGrading from "./routes/adminCourseGrading.js";
import purchaseRoutes from "./routes/purchase.js";
import learnPublic from "./routes/Learn.js";
import adminLearn from "./routes/admin.learn.js";
import adminMediaRoutes from "./routes/admin.media.js";
import productsPublic from "./routes/products.js";
import adminProducts from "./routes/admin.products.js";
import adminSettings from "./routes/admin.settings.js";
import projectRoutes from "./routes/projects.js";
import projectsPmRoutes from "./routes/projects.pm.js";
import reportsRoutes from "./routes/reports.js";
import archicadRoutes from "./routes/archicad.routes.js";

import meMediaRoutes from "./routes/me-media.js";
import webhooksRouter from "./routes/webhooks.js";
import adminBunny from "./routes/adminBunny.js";
import trainingsPublic from "./routes/trainings.js";
import adminTrainings from "./routes/admin.trainings.js";
import showcasePublic from "./routes/showcase.js";
import adminShowcase from "./routes/admin.showcase.js";
import changelogsPublic from "./routes/changelogs.js";
import adminChangelogs from "./routes/admin.changelogs.js";
import meOrdersRoutes from "./routes/meOrders.js";
import couponsPublic from "./routes/coupons.js";
import adminCoupons from "./routes/admin.coupons.js";
import helpbotRoutes from "./routes/helpbot.js";
import agentRoutes from "./routes/agent.js";
import geoRoutes from "./routes/geo.js";

import meTrainingsRoutes from "./routes/me-trainings.js";
import ptrainingsPublic from "./routes/ptrainings.js";
import mePTrainingsRoutes from "./routes/me-ptrainings.js";
import adminPTrainings from "./routes/admin.ptrainings.js";

/* -------------------- RateGen (LEGACY) -------------------- */
import rategenRouter from "./routes/rategen.js";
import adminRateGen from "./routes/admin.rategen.js";

/* -------------------- RateGen (NEW / v2) -------------------- */
import rategenLibraryPublic from "./routes/rategen.library.js";
import servicesRouter from "./routes/services.js";
import ratesCompute from "./routes/rates.compute.js";
import adminRateGenLibrary from "./routes/admin.rategen.library.js";
import adminRateGenRates from "./routes/admin.rategen.rates.js";
import adminRateGenCompute from "./routes/admin.rategen.compute.js";
import adminRateGenMaster from "./routes/admin.rategen.master.js";

import freebiesPublic from "./routes/freebies.js";
import adminFreebies from "./routes/admin.freebies.js";
import adminFlyers from "./routes/admin.flyers.js";
import entitlementsRouter from "./routes/entitlements.js";
import adminUsersLite from "./routes/admin.usersLite.js";
import projectsBoqRoutes from "./routes/projects.boq.js";
import modelCheckRoutes from "./routes/model-checks.js";

import trainingLocationsPublic from "./routes/training-locations.js";
import adminTrainingLocations from "./routes/admin.training-locations.js";
import adminInvoices from "./routes/admin.invoices.js";
import adminProposals from "./routes/admin.proposals.js";
import adminRoles from "./routes/admin.roles.js";
import proposalsPublic from "./routes/proposals.public.js";
import quoteRoutes from "./routes/quote.js";
import settingsPublicRoutes from "./routes/settings.public.js";
import taskRoutes from "./routes/tasks.js";
import adminTimeMgtRoutes from "./routes/admin.timemgt.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);

/* -------- CORS (MUST be BEFORE body parsers) -------- */
const IS_PROD = process.env.NODE_ENV === "production";

// Base whitelist from env, plus explicit production origins
const envWhitelist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Exact, vetted production origins — no wildcards
const PROD_ORIGINS = [
  "https://adlmstudio.net",
  "https://www.adlmstudio.net",
  "https://adlm-web.vercel.app",
];

const whitelist = Array.from(new Set([...envWhitelist, ...PROD_ORIGINS]));

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (whitelist.includes(origin)) return cb(null, true);
    // Localhost only allowed in non-production for dev work
    if (!IS_PROD && /^http:\/\/localhost:\d+$/.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-admin-key",
    "x-adlm-client",
    "x-adlm-fp-version",
    "X-Requested-With",
  ],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* -------- security -------- */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://js.paystack.co",
          "https://checkout.flutterwave.com",
          "https://www.googletagmanager.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: [
          "'self'",
          "https://api.paystack.co",
          "https://api.flutterwave.com",
          "https://api.cloudinary.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
          "https://stats.g.doubleclick.net",
        ],
        frameSrc: [
          "https://js.paystack.co",
          "https://checkout.flutterwave.com",
          "https://www.googletagmanager.com",
          "https://www.google.com",
          "https://www.google.com/maps",
          "https://maps.google.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: process.env.NODE_ENV === "production",
  }),
);

// gzip/deflate all responses. Biggest single mobile-load win; desktop plugin
// HTTP clients already negotiate decompression, so this is transparent to them.
app.use(compression());
app.use(cookieParser());
// Webhooks MUST be mounted before express.json — Paystack signature
// verification hashes the raw body, and once express.json has consumed the
// stream, express.raw inside the router is skipped and the HMAC check breaks.
app.use("/webhooks", webhooksRouter);
// Raised from 2mb: a bill plus embedded materialItems (100s of lines, each with an
// elementIds[] array) in one revit-project payload can exceed 2mb.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: false, limit: "16mb" }));
// Structured, parseable access logs in production; colourful logs locally.
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Lightweight health/readiness probe for uptime checks & load balancers.
// Public and dependency-free so it answers even while the DB is reconnecting.
app.get(["/health", "/healthz"], (_req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = states[mongoose.connection?.readyState] ?? "unknown";
  res.json({ ok: true, db: dbState, uptime: Math.round(process.uptime()) });
});

/* =========================
   ✅ API ROUTES (FIRST)
   ========================= */

// Public JWKS endpoint so plugins can fetch the RS256 public key for
// license token validation. Must come BEFORE any auth middleware — it is
// meant to be reached anonymously from end-user machines.
app.use("/.well-known", wellKnownRoutes);

// Best-effort audit trail for the break-glass God support account. Mounted
// before the routes so it observes every mutating request, but it never gates
// (per-route auth still applies). See server/middleware/auditGod.js.
import { auditGod } from "./middleware/auditGod.js";
app.use(auditGod);

// Apply rate limiting to auth and device endpoints
app.use("/auth", authLimiter, authRoutes);
// Billing must mount before the broad /me router so its paths win.
app.use("/me/billing", meBillingRoutes);
app.use("/me", meRoutes);
app.use("/me/deployments", deviceLimiter, meDeploymentsRoutes);
app.use("/me/courses", meCourses);
app.use("/purchase", purchaseRoutes);

app.use("/learn", learnPublic);
app.use("/products", productsPublic);
// Public project dashboard route (no auth required)
import { getPublicDashboard } from "./routes/projects.js";
app.get("/projects/public/:token", getPublicDashboard);
app.get("/api/projects/public/:token", getPublicDashboard);

app.use("/projects", projectRoutes);
app.use("/api/projects", projectRoutes);

app.use("/projects", projectsPmRoutes);
app.use("/api/projects", projectsPmRoutes);

// Report export payloads (Project / PM / Management) — see routes/reports.js.
app.use("/reports", reportsRoutes);
app.use("/api/reports", reportsRoutes);

app.use("/api/archicad", archicadRoutes);

app.use("/me/media", meMediaRoutes);
app.use("/me/orders", meOrdersRoutes);

app.use("/me/trainings", meTrainingsRoutes);
app.use("/ptrainings", ptrainingsPublic);
app.use("/me/ptrainings", mePTrainingsRoutes);

app.use("/trainings", trainingsPublic);
app.use("/showcase", showcasePublic);
// Public "What's New" product changelogs (read-only).
app.use("/changelogs", changelogsPublic);
app.use("/coupons", couponsPublic);
app.use("/helpbot", helpbotRoutes);
app.use("/agent", agentRoutes);
app.use("/geo", geoRoutes);

// Public settings (no auth) — mobile app URL etc.
import { Setting } from "./models/Setting.js";
app.get("/settings/mobile-app-url", async (_req, res) => {
  try {
    const s = await Setting.findOne({ key: "global" }).lean();
    res.json({ mobileAppUrl: s?.mobileAppUrl || "" });
  } catch {
    res.json({ mobileAppUrl: "" });
  }
});

// Public force-reinstall broadcast — read by the site-wide banner.
// Returns active=false (and no other fields) when nothing is broadcasting.
app.get("/settings/force-reinstall", async (_req, res) => {
  try {
    const s = await Setting.findOne({ key: "global" }).lean();
    if (!s?.forceReinstallActive) return res.json({ active: false });
    res.json({
      active: true,
      message: s.forceReinstallMessage || "",
      triggeredAt: s.forceReinstallAt || null,
      installerHubUrl: s.installerHubUrl || "",
      installerHubVideoUrl: s.installerHubVideoUrl || "",
    });
  } catch {
    res.json({ active: false });
  }
});

/* =========================
   ✅ ADMIN ROUTES
   ========================= */
app.use("/admin/learn", adminLearn);
app.use("/admin/media", adminMediaRoutes);

app.use("/admin/trainings", adminTrainings);
app.use("/admin/showcase", adminShowcase);
app.use("/admin/changelogs", adminChangelogs);

app.use("/admin/coupons", adminCoupons);
app.use("/admin/products", adminProducts);
app.use("/admin/deployments", adminDeploymentsRoutes);
app.use("/admin/courses", adminCourses);
app.use("/admin/softwares", adminSoftwares);
app.use("/admin/classrooms", adminClassrooms);
app.use("/me/classrooms", meClassrooms);
app.use("/admin/course-grading", adminCourseGrading);
app.use("/admin/settings", adminSettings);

app.use("/admin/ptrainings", adminPTrainings);
app.use("/admin/bunny", adminBunny);

/* -------------------- RateGen routes -------------------- */
app.use("/rategen", rategenRouter);
app.use("/admin/rategen", adminRateGen);

app.use("/rategen-v2", rategenLibraryPublic);
app.use("/rategen-v2", ratesCompute);
app.use("/rategen-v2", servicesRouter);

app.use("/admin/rategen-v2", adminRateGenRates);
app.use("/admin/rategen-v2", adminRateGenMaster);
app.use("/admin/rategen-v2/library", adminRateGenLibrary);

app.use("/admin/rategen-compute", adminRateGenCompute);
app.use("/api/rates", ratesCompute);

app.use("/admin/users-lite", adminUsersLite);

app.use("/freebies", freebiesPublic);
app.use("/admin/freebies", adminFreebies);
app.use("/admin/flyers", adminFlyers);
app.use("/admin/training-locations", adminTrainingLocations);
app.use("/admin/invoices", adminInvoices);
app.use("/admin/proposals", adminProposals);
// UAC / role management — mount BEFORE the catch-all "/admin" so it isn't swallowed.
app.use("/admin/roles", adminRoles);

// Support tickets + audit log / break-glass management — also BEFORE the
// catch-all "/admin" so their staff-grantable ("support") and admin-exclusive
// ("audit") gates apply instead of the catch-all's admin-only middleware.
import adminSupport from "./routes/admin.support.js";
import adminAudit from "./routes/admin.audit.js";
app.use("/admin/support-tickets", adminSupport);
app.use("/admin/audit-log", adminAudit);

// IMPORTANT: keep this catch-all "/admin" mount AFTER all the more-specific
// "/admin/<feature>" mounts above. adminRoutes runs requireAuth+requireAdmin
// as router-level middleware, which rejects mini_admin with 403. If it
// matched first, mini_admin requests to /admin/invoices, /admin/freebies,
// and /admin/training-locations would be blocked before reaching the
// staff-aware routers above.
app.use("/admin", adminRoutes);
app.use("/training-locations", trainingLocationsPublic);
app.use("/quote", quoteRoutes);
app.use("/proposals", proposalsPublic);
app.use("/settings", settingsPublicRoutes);
app.use("/api/entitlements", deviceLimiter, entitlementsRouter);

// User-facing support ticket submission + "my tickets".
import supportRoutes from "./routes/support.js";
app.use("/api/support", supportRoutes);

// app.use("/projectsboq", projectsBoqRoutes);
app.use("/projectsboq", projectsBoqRoutes);
app.use("/api/projectsboq", projectsBoqRoutes); // optional convenience

// ─── Model Checker ───
app.use("/api/model-checks", modelCheckRoutes);
app.use("/model-checks", modelCheckRoutes);

// ─── Time Management Tasks ───
// Authenticated REST API for the ADLM Time Management app.
// WPF desktop syncs here after saving locally; web/mobile use this API directly.
app.use("/api/tasks", taskRoutes);
app.use("/admin/timemgt", adminTimeMgtRoutes);

/* =========================
   ✅ OPTIONAL: serve frontend + dynamic meta
   ========================= */

const SERVE_CLIENT = ["1", "true", "yes"].includes(
  String(process.env.SERVE_CLIENT || "").toLowerCase(),
);

const distDir = path.resolve(__dirname, "../client/dist");
const indexHtml = path.join(distDir, "index.html");
const hasClientBuild = fs.existsSync(indexHtml);

if (SERVE_CLIENT && hasClientBuild) {
  app.use(express.static(distDir, { index: false }));

  registerDynamicMetaRoutes(app);

  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    const accept = String(req.headers.accept || "");
    const ua = String(req.headers["user-agent"] || "");
    const isBot = /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|googlebot/i.test(ua);
    if (!isBot && !accept.includes("text/html")) return next();
    res.sendFile(indexHtml);
  });
} else {
  if (SERVE_CLIENT && !hasClientBuild) {
    console.warn(
      "[SERVE_CLIENT] enabled but client/dist/index.html not found. Skipping static/meta routes.",
    );
  }
}

/* -------- helpful error handling -------- */
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error:
        "Payload too large. Increase server JSON limit or send only changed rows.",
    });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  if (err && /Not allowed by CORS/.test(err.message)) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

/* -------- env validation -------- */
// Fail fast on missing CRITICAL secrets (the app cannot function without these)
// and warn on recommended ones, so a misconfigured deploy is visible at boot
// instead of throwing 500s on first use. Intentionally conservative: only the
// three hard-required vars abort startup (all are already set in prod, so this
// adds no new outage surface — it only catches a broken future deploy).
function validateEnv() {
  const critical = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const recommended = [
    "JWT_LICENSE_SECRET",
    "PAYSTACK_SECRET_KEY",
    "CLOUDINARY_API_SECRET",
    "SMTP_PASS",
  ];
  const missingCritical = critical.filter((k) => !process.env[k]);
  if (missingCritical.length) {
    console.error(
      "[env] FATAL: missing required env vars:",
      missingCritical.join(", "),
    );
    process.exit(1);
  }
  const missingRecommended = recommended.filter((k) => !process.env[k]);
  if (missingRecommended.length) {
    console.warn(
      "[env] WARNING: missing recommended env vars (some features degraded):",
      missingRecommended.join(", "),
    );
  }
}

/* -------- boot -------- */
const port = process.env.PORT || 4000;

try {
  validateEnv();
  await connectDB(process.env.MONGO_URI);

  // Seed built-in roles (admin / mini_admin / user) and warm the permission
  // cache before serving. Non-fatal: a seed failure logs but doesn't block boot.
  try {
    await ensureRolesSeeded();
  } catch (e) {
    console.error("[rbac] role seed failed:", e?.message || e);
  }

  app.listen(port, () => console.log(`Server running on :${port}`));

  const ENABLE_EXPIRY_CRON =
    String(process.env.ENABLE_EXPIRY_CRON || "true") !== "false";

  const EXPIRY_CRON = String(process.env.EXPIRY_CRON || "0 9 * * *"); // 9am Lagos daily

  if (ENABLE_EXPIRY_CRON) {
    cron.schedule(
      EXPIRY_CRON,
      async () => {
        try {
          const out = await runExpiryNotifier();
          console.log("[expiry-notifier] done:", out);
        } catch (e) {
          console.error("[expiry-notifier] failed:", e?.message || e);
        }
      },
      { timezone: "Africa/Lagos" },
    );

    console.log("[expiry-notifier] cron scheduled:", EXPIRY_CRON);
  }

  // Auto-renewal charges run BEFORE the 9am expiry notifier so a user whose
  // card renews successfully never gets a same-day "expiring soon" email.
  const ENABLE_RENEWAL_CRON =
    String(process.env.ENABLE_RENEWAL_CRON || "true") !== "false";

  const RENEWAL_CRON = String(process.env.RENEWAL_CRON || "0 8 * * *"); // 8am Lagos daily

  if (ENABLE_RENEWAL_CRON) {
    cron.schedule(
      RENEWAL_CRON,
      async () => {
        try {
          const out = await runAutoRenewals();
          console.log("[auto-renew] done:", out);
        } catch (e) {
          console.error("[auto-renew] failed:", e?.message || e);
        }
      },
      { timezone: "Africa/Lagos" },
    );

    console.log("[auto-renew] cron scheduled:", RENEWAL_CRON);
  }
} catch (err) {
  console.error("DB error", err);
  process.exit(1);
}


