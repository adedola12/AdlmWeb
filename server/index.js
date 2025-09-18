// server/index.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";

// routes
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import adminRoutes from "./routes/admin.js";
import purchaseRoutes from "./routes/purchase.js";

const app = express();

/* If you run behind a proxy (Render/Heroku/NGINX), this ensures
   req.secure reflects the real protocol so SameSite=None; Secure
   cookies work correctly in production. */
app.set("trust proxy", 1);

// basic middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(morgan("dev"));

/* ───────── CORS (multi-origin, dev + prod) ───────── */
// server/index.js  (unchanged imports/middleware above)
const whitelist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // same-origin or non-browser requests
    if (!origin) return cb(null, true);

    // exact matches from .env
    if (whitelist.includes(origin)) return cb(null, true);

    // allow any localhost:* for dev
    if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);

    // allow your Vercel app (including preview subdomains)
    if (/\.vercel\.app$/.test(origin)) return cb(null, true);

    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// no app.options("*") on Express 5

// NOTE: Do NOT register app.options("*", ...) on Express 5 (it crashes).
// cors() already handles preflight for registered routes.

/* ───────── Health / root ───────── */
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "ADLM Auth/Licensing" })
);

/* ───────── Route mounts ───────── */
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/admin", adminRoutes);
app.use("/purchase", purchaseRoutes);

/* ───────── CORS error helper (nice message instead of crash) ───────── */
app.use((err, _req, res, next) => {
  if (err && /Not allowed by CORS/.test(err.message)) {
    return res.status(403).json({ error: err.message });
  }
  return next(err);
});

/* ───────── 404 & generic error ───────── */
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

/* ───────── Start ───────── */
const port = process.env.PORT || 4000;

connectDB(process.env.MONGO_URI)
  .then(() => {
    app.listen(port, () => console.log(`Server running on :${port}`));
  })
  .catch((err) => {
    console.error("DB error", err);
    process.exit(1);
  });
