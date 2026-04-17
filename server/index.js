import "dotenv/config";
import express from "express";
import helmet from "helmet";
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
import { authLimiter, deviceLimiter, generalLimiter } from "./middleware/rateLimiter.js";

import { registerDynamicMetaRoutes } from "./routes/meta.dynamic.js";

// routes
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import meDeploymentsRoutes from "./routes/me.deployments.js";
import meCourses from "./routes/meCourses.js";
import adminRoutes from "./routes/admin.js";
import adminDeploymentsRoutes from "./routes/admin.deployments.js";
import adminCourses from "./routes/adminCourses.js";
import adminCourseGrading from "./routes/adminCourseGrading.js";
import purchaseRoutes from "./routes/purchase.js";
import learnPublic from "./routes/Learn.js";
import adminLearn from "./routes/admin.learn.js";
import adminMediaRoutes from "./routes/admin.media.js";
import productsPublic from "./routes/products.js";
import adminProducts from "./routes/admin.products.js";
import adminSettings from "./routes/admin.settings.js";
import projectRoutes from "./routes/projects.js";

import meMediaRoutes from "./routes/me-media.js";
import webhooksRouter from "./routes/webhooks.js";
import adminBunny from "./routes/adminBunny.js";
import trainingsPublic from "./routes/trainings.js";
import adminTrainings from "./routes/admin.trainings.js";
import showcasePublic from "./routes/showcase.js";
import adminShowcase from "./routes/admin.showcase.js";
import meOrdersRoutes from "./routes/meOrders.js";
import couponsPublic from "./routes/coupons.js";
import adminCoupons from "./routes/admin.coupons.js";
import helpbotRoutes from "./routes/helpbot.js";

import meTrainingsRoutes from "./routes/me-trainings.js";
import ptrainingsPublic from "./routes/ptrainings.js";
import mePTrainingsRoutes from "./routes/me-ptrainings.js";
import adminPTrainings from "./routes/admin.ptrainings.js";

/* -------------------- RateGen (LEGACY) -------------------- */
import rategenRouter from "./routes/rategen.js";
import adminRateGen from "./routes/admin.rategen.js";

/* -------------------- RateGen (NEW / v2) -------------------- */
import rategenLibraryPublic from "./routes/rategen.library.js";
import ratesCompute from "./routes/rates.compute.js";
import adminRateGenLibrary from "./routes/admin.rategen.library.js";
import adminRateGenRates from "./routes/admin.rategen.rates.js";
import adminRateGenCompute from "./routes/admin.rategen.compute.js";
import adminRateGenMaster from "./routes/admin.rategen.master.js";

import freebiesPublic from "./routes/freebies.js";
import adminFreebies from "./routes/admin.freebies.js";
import entitlementsRouter from "./routes/entitlements.js";
import adminUsersLite from "./routes/admin.usersLite.js";
import projectsBoqRoutes from "./routes/projects.boq.js";
import modelCheckRoutes from "./routes/model-checks.js";

import trainingLocationsPublic from "./routes/training-locations.js";
import adminTrainingLocations from "./routes/admin.training-locations.js";
import adminInvoices from "./routes/admin.invoices.js";
import quoteRoutes from "./routes/quote.js";

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

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(morgan("dev"));

/* =========================
   ✅ API ROUTES (FIRST)
   ========================= */

app.use("/webhooks", webhooksRouter);

// Apply rate limiting to auth and device endpoints
app.use("/auth", authLimiter, authRoutes);
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

app.use("/me/media", meMediaRoutes);
app.use("/me/orders", meOrdersRoutes);

app.use("/me/trainings", meTrainingsRoutes);
app.use("/ptrainings", ptrainingsPublic);
app.use("/me/ptrainings", mePTrainingsRoutes);

app.use("/trainings", trainingsPublic);
app.use("/showcase", showcasePublic);
app.use("/coupons", couponsPublic);
app.use("/helpbot", helpbotRoutes);

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

/* =========================
   ✅ ADMIN ROUTES
   ========================= */
app.use("/admin/learn", adminLearn);
app.use("/admin/media", adminMediaRoutes);

app.use("/admin/trainings", adminTrainings);
app.use("/admin/showcase", adminShowcase);

app.use("/admin/coupons", adminCoupons);
app.use("/admin/products", adminProducts);
app.use("/admin/deployments", adminDeploymentsRoutes);
app.use("/admin/courses", adminCourses);
app.use("/admin/course-grading", adminCourseGrading);
app.use("/admin/settings", adminSettings);

app.use("/admin/ptrainings", adminPTrainings);
app.use("/admin/bunny", adminBunny);

/* -------------------- RateGen routes -------------------- */
app.use("/rategen", rategenRouter);
app.use("/admin/rategen", adminRateGen);

app.use("/rategen-v2", rategenLibraryPublic);
app.use("/rategen-v2", ratesCompute);

app.use("/admin/rategen-v2", adminRateGenRates);
app.use("/admin/rategen-v2", adminRateGenMaster);
app.use("/admin/rategen-v2/library", adminRateGenLibrary);

app.use("/admin/rategen-compute", adminRateGenCompute);
app.use("/api/rates", ratesCompute);

app.use("/admin/users-lite", adminUsersLite);

app.use("/admin", adminRoutes);

app.use("/freebies", freebiesPublic);
app.use("/admin/freebies", adminFreebies);
app.use("/admin/training-locations", adminTrainingLocations);
app.use("/admin/invoices", adminInvoices);
app.use("/training-locations", trainingLocationsPublic);
app.use("/quote", quoteRoutes);
app.use("/api/entitlements", deviceLimiter, entitlementsRouter);

// app.use("/projectsboq", projectsBoqRoutes);
app.use("/projectsboq", projectsBoqRoutes);
app.use("/api/projectsboq", projectsBoqRoutes); // optional convenience

// ─── Model Checker ───
app.use("/api/model-checks", modelCheckRoutes);
app.use("/model-checks", modelCheckRoutes);

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

/* -------- boot -------- */
const port = process.env.PORT || 4000;

try {
  await connectDB(process.env.MONGO_URI);

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
} catch (err) {
  console.error("DB error", err);
  process.exit(1);
}


