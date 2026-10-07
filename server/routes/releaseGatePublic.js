// server/routes/releaseGatePublic.js
//
// What GitHub is allowed to ask us, without a credential:
//
//   GET /release-gate/batch-status?sha=<40-hex>
//     -> { approved, sha, title, approvedBy, approvedAt, reason }
//
// Two callers, both in .github/workflows:
//   batch-check.yml  a REQUIRED status check on every pull request into main.
//                    It fails unless the approver has approved that exact
//                    commit, which is what stops anything reaching customers
//                    without sign-off now that no human reviews pull requests.
//   batch-merge.yml  the five-minute job that performs the merge once approved.
//
// Deliberately unauthenticated and read-only: it answers yes or no about a
// commit hash and never exposes what is in the release. A credential here
// would be one more secret to leak for no gain, and the answer is already
// implied by what is public on GitHub. It says nothing at all about an
// unknown sha beyond "not approved".
import express from "express";
import { ReleaseBatch } from "../models/ReleaseBatch.js";

const router = express.Router();

router.get("/batch-status", async (req, res) => {
  const sha = String(req.query?.sha || "").trim().toLowerCase();
  res.set("Cache-Control", "no-store");

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return res.status(400).json({ approved: false, reason: "sha must be a full 40-character commit hash" });
  }

  try {
    const batch = await ReleaseBatch.findOne({ headSha: sha }).sort({ createdAt: -1 }).lean();
    if (!batch) {
      return res.json({ approved: false, sha, reason: "No batch was prepared for this build, so nobody has tested it." });
    }
    if (batch.status === "approved" || batch.status === "merged") {
      return res.json({
        approved: true,
        sha,
        title: batch.title,
        approvedBy: batch.approvedBy,
        approvedAt: batch.approvedAt,
        status: batch.status,
      });
    }
    return res.json({
      approved: false,
      sha,
      title: batch.title,
      status: batch.status,
      reason:
        batch.status === "changes-requested"
          ? `The approver asked for changes: ${batch.approvalNote || "no note"}`
          : "The approver has not approved this build yet.",
    });
  } catch (err) {
    // A database problem must never read as "approved".
    console.error("[release-gate] batch-status failed:", err?.message || err);
    return res.status(503).json({ approved: false, sha, reason: "Could not read the release desk; treat as not approved." });
  }
});

export default router;
