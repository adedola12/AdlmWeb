import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";

import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import adminRoutes from "./routes/admin.js";
import purchaseRoutes from "./routes/purchase.js";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

app.get("/", (_req, res) =>
  res.json({ ok: true, service: "ADLM Auth/Licensing" })
);

app.use("/auth", authRoutes);
app.use("/", meRoutes);
app.use("/admin", adminRoutes);
app.use("/purchase", purchaseRoutes);

const port = process.env.PORT || 4000;

connectDB(process.env.MONGO_URI)
  .then(() => {
    app.listen(port, () => console.log(`Server running on :${port}`));
  })
  .catch((err) => {
    console.error("DB error", err);
    process.exit(1);
  });
