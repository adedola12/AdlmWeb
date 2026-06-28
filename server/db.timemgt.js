import mongoose from "mongoose";

let _conn = null;
let _connectPromise = null;

/**
 * Returns a Mongoose Connection to the TimeMgt Atlas cluster.
 * This is a SEPARATE connection from the main adlmWeb connection in db.js.
 * The WPF desktop app also writes directly to this cluster, so Express is
 * a second (read/write) client — not an intermediary.
 */
export async function getTimeMgtDb() {
  if (_conn && _conn.readyState === 1) return _conn;
  if (_connectPromise) return _connectPromise;

  const uri = process.env.TIMEMGT_MONGO_URI;
  if (!uri) {
    throw new Error(
      "TIMEMGT_MONGO_URI is not set. " +
        "Add it to .env to enable the /api/tasks routes."
    );
  }

  const dbName = process.env.TIMEMGT_DB || "TimeMgt";

  _connectPromise = mongoose
    .createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise()
    .then((conn) => {
      _conn = conn;
      console.log(
        `[timemgt] connected to ${conn.host} / ${conn.name}`
      );
      conn.on("error", (e) =>
        console.error("[timemgt] connection error:", e?.message || e)
      );
      return conn;
    })
    .catch((err) => {
      _connectPromise = null;
      throw err;
    });

  return _connectPromise;
}
