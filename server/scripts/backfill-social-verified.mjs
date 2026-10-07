// server/scripts/backfill-social-verified.mjs
//
// Mark accounts verified where a provider already verified them.
//
//   node scripts/backfill-social-verified.mjs            report only (default)
//   node scripts/backfill-social-verified.mjs --apply    write
//
// WHY THERE IS ANYTHING TO BACKFILL
//
// POST /auth/social created users without emailVerified until 3 Oct 2026. The
// address was confirmed — util/socialIdentity.js refuses a provider account
// whose email_verified is false — we simply never recorded it. The cost landed
// on the customer: util/emailGate.js refuses every signed-in request from an
// unconfirmed account, and only POST /auth/signup sends a six-digit code, so
// somebody who signed up with Google was blocked from the product and shown a
// screen asking for a code that had never been sent. On 3 Oct that was 270
// accounts, more than a third of the list, and they were unreachable by mail
// as well because the broadcast audience requires a verified address.
//
// WHO THIS TOUCHES, AND WHO IT MUST NOT
//
// ONLY accounts that hold a provider id (googleId, microsoftId, autodeskId)
// and are not already verified. A password sign-up that never confirmed is
// left exactly as it is: nobody has proved that address, and marking it
// verified would put unconfirmed addresses into the mailing audience, which is
// how a sending domain gets itself blocked. That distinction is the whole
// point of the script, so it is asserted below rather than trusted.
//
// Local scripts run against the PRODUCTION database. The default is a report;
// --apply is the only thing that writes.

import "dotenv/config";
import mongoose from "mongoose";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { User } from "../models/User.js";

const APPLY = process.argv.includes("--apply");
const PROVIDER_IDS = ["googleId", "microsoftId", "autodeskId"];

/** Accounts a provider has verified, which we never recorded. */
const QUERY = {
  $and: [
    { $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }] },
    { $or: PROVIDER_IDS.map((f) => ({ [f]: { $nin: [null, ""] } })) },
  ],
};

/** Unverified accounts with NO provider id — deliberately untouched. */
const LEFT_ALONE = {
  $and: [
    { $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }] },
    ...PROVIDER_IDS.map((f) => ({ $or: [{ [f]: null }, { [f]: "" }, { [f]: { $exists: false } }] })),
  ],
};

function say(...a) {
  console.log(...a);
}

async function main() {
  // MONGO_URI ONLY. No fallback, deliberately.
  //
  // The first run of this script fell back to ADLM_MONGO_CONNECTION, connected
  // to a different cluster, and reported "0 to fix, 0 left alone" — a clean
  // bill of health for a database that simply does not hold these accounts.
  // With --apply it would have written there. A second environment variable
  // that silently points somewhere else is worse than no fallback: the run
  // succeeds and tells you the wrong thing.
  // MONGO_URI from the environment, or --from-ssm to read it the way the
  // Lambda does.
  //
  // Reading it here keeps the connection string out of shell history, out of a
  // paste, and out of anybody's terminal scrollback: it goes from Parameter
  // Store into this process and nowhere else. The AWS CLI cannot see this
  // parameter from some environments while the SDK can, which is the other
  // reason it is done in-process.
  let uri = process.env.MONGO_URI;
  if (!uri && process.argv.includes("--from-ssm")) {
    const name = process.env.MONGO_URI_PARAM || "/adlm/cloud/prod/MONGO_URI";
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
    try {
      const ssm = new SSMClient({ region });
      const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      uri = r.Parameter?.Value || "";
      say(`connection string: read from SSM ${name} (${region})`);
      // AUTH_DB too. The connection string's own default database is "test";
      // the app has never used it. See db.js.
      if (!process.env.AUTH_DB) {
        try {
          const a = await ssm.send(
            new GetParameterCommand({ Name: "/adlm/cloud/prod/AUTH_DB", WithDecryption: true }),
          );
          if (a.Parameter?.Value) process.env.AUTH_DB = a.Parameter.Value;
        } catch {
          // Not set in SSM: the default below is the same one db.js uses.
        }
      }
    } catch (e) {
      console.error(`Could not read ${name} from SSM: ${e?.name || ""} ${e?.message || e}`);
      process.exitCode = 1;
      return;
    }
  }
  if (!uri) {
    console.error(
      [
        "backfill-social-verified: MONGO_URI is not set. Pass --from-ssm to read it",
        "Set it to the production connection string. This script will NOT fall back to",
        "ADLM_MONGO_CONNECTION, which points at a different cluster and would report",
        "zero accounts to fix while finding none of them.",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  // THE DATABASE NAME IS NOT IN THE URI.
  //
  // db.js connects with dbName: AUTH_DB || "adlmWeb", never the connection
  // string's default. Connecting without it lands in "test", where none of
  // these accounts live — and the first run of this script did exactly that
  // and reported "0 to fix" against an empty database. That is the failure the
  // `database:` line below exists to make visible.
  const dbName = process.env.AUTH_DB || "adlmWeb";
  await mongoose.connect(uri, { dbName });
  // Name the database in the report. A count of zero means one of two very
  // different things — nothing to fix, or the wrong database — and the reader
  // cannot tell them apart without this line.
  say(`database: ${mongoose.connection.name}`);

  const [toFix, untouched, sample] = await Promise.all([
    User.countDocuments(QUERY),
    User.countDocuments(LEFT_ALONE),
    User.find(QUERY, { email: 1, googleId: 1, microsoftId: 1, autodeskId: 1 }).limit(5).lean(),
  ]);

  say(`provider-verified but unrecorded : ${toFix}`);
  say(`unverified with no provider id   : ${untouched}   (left alone, deliberately)`);
  for (const u of sample) {
    const via = PROVIDER_IDS.filter((f) => u[f]).join(", ") || "none";
    say(`  e.g. ${String(u.email || "").replace(/(.{2}).*(@.*)/, "$1***$2")}  via ${via}`);
  }

  // The guard: nothing in the write set may lack a provider id. If this ever
  // trips, the query has drifted and the run stops rather than marking an
  // unproven address as verified.
  const wrong = await User.countDocuments({ $and: [QUERY, LEFT_ALONE] });
  if (wrong !== 0) {
    console.error(`REFUSING: ${wrong} accounts match both sets. The query is wrong; nothing written.`);
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    say("\nReport only. Re-run with --apply to write (this is the production database).");
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const r = await User.updateMany(QUERY, {
    $set: { emailVerified: true, emailVerifiedAt: now },
  });
  say(`\nupdated: ${r.modifiedCount}`);
  say("Those accounts can use the product again and can be reached by mail.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* already down */
  }
  process.exitCode = 1;
});
