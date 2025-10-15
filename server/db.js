import mongoose from "mongoose";

let connectPromise = null;

/**
 * Single mongoose connection for the AUTH app.
 * Uses AUTH_DB (default: adlmWeb) — NOT the RateGen master DB.
 */
export async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectPromise) return connectPromise;

  const mongoUri = uri || process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");

  mongoose.set("strictQuery", true);

  // 👇 fall back to 'adlmWeb' to match your legacy clients
  const authDbName = process.env.AUTH_DB || "adlmWeb";

  connectPromise = mongoose
    .connect(mongoUri, {
      dbName: authDbName,
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
      connectPromise = null;
      throw err;
    });

  mongoose.connection.on("error", (e) =>
    console.error("[mongo] connection error:", e?.message || e)
  );

  return connectPromise;
}

export async function ensureDb() {
  if (mongoose.connection.readyState === 1) return;
  await connectDB(process.env.MONGO_URI);
}
