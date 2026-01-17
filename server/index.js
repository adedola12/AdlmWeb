// server/index.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { connectDB } from "./db.js";

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

/* -------------------- RateGen (LEGACY) -------------------- */
import rategenRouter from "./routes/rategen.js"; // legacy public rategen
import adminRateGen from "./routes/admin.rategen.js"; // legacy admin rategen

/* -------------------- RateGen (NEW / v2) -------------------- */
import rategenLibraryPublic from "./routes/rategen.library.js"; // new public library sync/meta
import ratesCompute from "./routes/rates.compute.js"; // public compute endpoints (legacy name)
import adminRateGenLibrary from "./routes/admin.rategen.library.js"; // admin library management
import adminRateGenRates from "./routes/admin.rategen.rates.js"; // admin rate library
import adminRateGenCompute from "./routes/admin.rategen.compute.js"; // admin compute items (admin-key)
import adminRateGenMaster from "./routes/admin.rategen.master.js";

const app = express();

app.get("/__debug/db", (_req, res) => {
  const c = mongoose?.connection || {};
  res.json({ dbName: c.name, host: c.host, ok: c.readyState === 1 });
});

app.set("trust proxy", 1);

// security / parsing
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
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: [
          "'self'",
          "https://api.paystack.co",
          "https://api.flutterwave.com",
          "https://api.cloudinary.com",
        ],
        frameSrc: [
          "https://js.paystack.co",
          "https://checkout.flutterwave.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: process.env.NODE_ENV === "production",
  })
);

app.set("trust proxy", 1);

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
app.options("*", cors(corsOptions));

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
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: [
          "'self'",
          "https://api.paystack.co",
          "https://api.flutterwave.com",
          "https://api.cloudinary.com",
        ],
        frameSrc: [
          "https://js.paystack.co",
          "https://checkout.flutterwave.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: process.env.NODE_ENV === "production",
  })
);

app.use(cookieParser());

// ✅ increase payload limit (materials is usually bigger)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.use(morgan("dev"));

// ✅ show correct errors instead of hiding them behind "500"
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

/* -------- root -------- */
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "ADLM Auth/Licensing" })
);

app.use("/webhooks", webhooksRouter);

/* -------- Core API -------- */
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/admin", adminRoutes);
app.use("/purchase", purchaseRoutes);
app.use("/learn", learnPublic);
app.use("/admin/learn", adminLearn);
app.use("/admin/media", adminMediaRoutes);
app.use("/coupons", couponsPublic);
app.use("/admin/coupons", adminCoupons);

app.use("/products", productsPublic);
app.use("/admin/products", adminProducts);
app.use("/admin/settings", adminSettings);

app.use("/projects", projectRoutes);
app.use("/api/projects", projectRoutes); // backward compatibility

app.use("/me/media", meMediaRoutes);
app.use("/me/orders", meOrdersRoutes);

app.use("/admin/bunny", adminBunny);

app.use("/trainings", trainingsPublic);
app.use("/admin/trainings", adminTrainings);

app.use("/showcase", showcasePublic);
app.use("/admin/showcase", adminShowcase);

app.use("/helpbot", helpbotRoutes);

/* ===================================================================
   ✅ RATEGEN ROUTES — CLEAN & NON-CONFLICTING
   =================================================================== */

/* -------- LEGACY (keep working, but don't add new stuff here) -------- */
app.use("/rategen", rategenRouter); // legacy public
app.use("/admin/rategen", adminRateGen); // legacy admin

/* -------- NEW / v2 PUBLIC --------
   - Your new clients should call /rategen-v2/...
   - No more mounting multiple routers on /rategen
*/
app.use("/rategen-v2", rategenLibraryPublic); // e.g. /rategen-v2/library/meta
app.use("/rategen-v2", ratesCompute); // e.g. /rategen-v2/compute-items, /rategen-v2/compute

/* -------- NEW / v2 ADMIN (web admin access token / session) -------- */
app.use("/admin/rategen-v2", adminRateGenRates); // ✅ /admin/rategen-v2/rates
app.use("/admin/rategen-v2", adminRateGenMaster);

// ✅ move library router under /library so it doesn't intercept /rates
app.use("/admin/rategen-v2/library", adminRateGenLibrary); // /admin/rategen-v2/library/...

/* -------- ADMIN COMPUTE (admin-key) -------- */
app.use("/admin/rategen-compute", adminRateGenCompute); // stays admin-key protected

/* -------- LEGACY ALIASES (optional) --------
   Keep ONLY while old Windows builds still point here.
   Delete later when you fully migrate.
*/
app.use("/api/rates", ratesCompute); // legacy alias for compute endpoints

/* -------- helpful error for bad JSON -------- */
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      error:
        'Invalid JSON body. Send application/json like {"identifier":"you@example.com","password":"..."}',
    });
  }
  if (err && /Not allowed by CORS/.test(err.message)) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

/* -------- static + 404 + generic -------- */
app.use(express.static("client/dist"));
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
