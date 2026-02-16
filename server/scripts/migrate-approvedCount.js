import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { TrainingEvent } from "../models/TrainingEvent.js";

async function run() {
  await connectDB(process.env.MONGO_URI);

  // Convert approvedCount to int safely (string -> int, null -> 0)
  const res = await TrainingEvent.collection.updateMany({}, [
    {
      $set: {
        approvedCount: {
          $convert: {
            input: "$approvedCount",
            to: "int",
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
  ]);

  console.log("Migration done:", {
    matched: res.matchedCount ?? res.matched,
    modified: res.modifiedCount ?? res.modified,
  });

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
