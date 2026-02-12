// server/index.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./db.js";

import { registerDynamicMetaRoutes } from "./routes/meta.dynamic.js";

// routes
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import adminRoutes from "./routes/admin.js";
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

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);

app.get("/__debug/db", (_req, res) => {
  const c = mongoose?.connection || {};
  res.json({ dbName: c.name, host: c.host, ok: c.readyState === 1 });
});

/* -------- CORS (MUST be BEFORE body parsers) -------- */
const whitelist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (whitelist.includes(origin)) return cb(null, true);
    if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    if (/\.vercel\.app$/.test(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-admin-key",
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(morgan("dev"));

/* =========================
   ✅ FRONTEND STATIC (ASSETS) + ✅ DYNAMIC META (HTML)
   ========================= */

// client is sibling of server -> ../client/dist
const distDir = path.resolve(__dirname, "../client/dist");

// Serve assets, but DO NOT auto-serve index.html (we inject it)
app.use(express.static(distDir, { index: false }));

// ✅ This MUST be before API routes, so bots/browsers get HTML with OG tags
registerDynamicMetaRoutes(app);

/* =========================
   ✅ API ROUTES
   ========================= */

app.use("/webhooks", webhooksRouter);

app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/purchase", purchaseRoutes);

app.use("/learn", learnPublic);
app.use("/products", productsPublic);
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

/* =========================
   ✅ ADMIN ROUTES
   ========================= */
app.use("/admin/learn", adminLearn);
app.use("/admin/media", adminMediaRoutes);

app.use("/admin/trainings", adminTrainings);
app.use("/admin/showcase", adminShowcase);

app.use("/admin/coupons", adminCoupons);
app.use("/admin/products", adminProducts);
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
app.use("/api/entitlements", entitlementsRouter);

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

/* -------- 404 + generic -------- */
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
} catch (err) {
  console.error("DB error", err);
  process.exit(1);
}
