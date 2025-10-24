import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
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
import adminCoursesRouter from "./routes/adminCourses.js";
import meCoursesRouter from "./routes/meCourses.js";
import adminCourseGradingRouter from "./routes/adminCourseGrading.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();
app.get("/__debug/db", (_req, res) => {
  const c = mongoose?.connection || {};
  res.json({ dbName: c.name, host: c.host, ok: c.readyState === 1 });
});
app.set("trust proxy", 1);

// security / parsing
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cookieParser());
app.use(express.json()); // expects valid JSON when Content-Type: application/json
app.use(express.urlencoded({ extended: false })); // allows form posts too
app.use(morgan("dev"));

/* -------- CORS (allow cookies) -------- */
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

/* -------- root -------- */
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "ADLM Auth/Licensing" })
);

/* -------- API -------- */
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
app.use("/admin/courses", adminCoursesRouter);
app.use("/me/courses", meCoursesRouter);
app.use("/admin/course-grading", adminCourseGradingRouter);
app.use("/webhooks", webhooksRouter);

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
