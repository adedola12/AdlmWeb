// server/db.js
import mongoose from "mongoose";

let connectPromise = null;

/**
 * Connect once and reuse the same connection.
 * Safe to call multiple times.
 */
export async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) return mongoose; // already connected
  if (connectPromise) return connectPromise;

  const mongoUri = uri || process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");

  mongoose.set("strictQuery", true);

  connectPromise = mongoose
    .connect(mongoUri, {
      dbName: process.env.RATEGEN_DB || "ADLMRateDB",
      serverSelectionTimeoutMS: 10000,
    })
    .then((m) => {
      console.log(
        "[mongo] connected to",
        m.connection.host,
        "/",
        m.connection.name
      );
      return m;
    })
    .catch((err) => {
      // allow another attempt if the first one failed
      connectPromise = null;
      throw err;
    });

  mongoose.connection.on("error", (e) => {
    console.error("[mongo] connection error:", e?.message || e);
  });

  return connectPromise;
}

/**
 * Ensure there is an active connection.
 * Useful inside routes/utilities that might run during reconnects.
 */
export async function ensureDb() {
  if (mongoose.connection.readyState === 1) return; // connected
  await connectDB(process.env.MONGO_URI);
}
