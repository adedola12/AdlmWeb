// server/index.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser"; // ⬅️ add
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
import meMediaRouter from "./routes/media.js";
import meMediaRoutes from "./routes/me-media.js";
import rategenRouter from "./routes/rategen.js";
import adminRateGen from "./routes/admin.rategen.js";

const app = express();
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser()); // ⬅️ add
app.use(morgan("dev"));

/* ----------------------- CORS ----------------------- */
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
    cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ----------------------- Root ----------------------- */
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "ADLM Auth/Licensing" })
);

/* ----------------------- API routes ----------------------- */
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/admin", adminRoutes);
app.use("/purchase", purchaseRoutes);
app.use("/learn", learnPublic);
app.use("/admin/learn", adminLearn);
app.use("/admin/media", adminMediaRoutes);
app.use("/products", productsPublic);
app.use("/admin/products", adminProducts);
app.use("/admin/settings", adminSettings);
app.use("/projects", projectRoutes);
app.use("/me/media", meMediaRouter);
app.use("/me/media", meMediaRoutes);
app.use("/rategen", rategenRouter);
app.use("/admin/rategen", adminRateGen);

/* ------------- CORS error helper ------------- */
app.use((err, _req, res, next) => {
  if (err && /Not allowed by CORS/.test(err.message)) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

/* ----------------------- Static / SPA ----------------------- */
app.use(express.static("client/dist"));

/* ----------------------- 404 + generic ----------------------- */
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

/* ----------------------- Boot ----------------------- */
const port = process.env.PORT || 4000;

try {
  await connectDB(process.env.MONGO_URI); // wait for Mongo
  app.listen(port, () => console.log(`Server running on :${port}`));
} catch (err) {
  console.error("DB error", err);
  process.exit(1);
}
