// server/util/releaseGateFlow.js
//
// Staging a plugin release and, later, making it live. Split out of the route
// files so admin.deployments.js (which stages) and admin.releases.js (which
// approves) share one implementation of "apply".
import { ProductDeployment } from "../models/ProductDeployment.js";
import { ReleaseCandidate } from "../models/ReleaseCandidate.js";
import { recordDeploymentRelease } from "./releaseNotifier.js";
import { withNextDigest } from "./releaseDigest.js";
import {
  describeCandidate,
  esc,
  gateMail,
  getGateConfig,
  ownerEmail,
  recordGateEvent,
  releasesUrl,
} from "./releaseGate.js";

/**
 * Queue a release for sign-off. Any earlier pending candidate for the same
 * product is superseded, so the approver always tests the newest build.
 */
export async function stageRelease({ productKey, normalized, previous, body, actor, req }) {
  await ReleaseCandidate.updateMany(
    { productKey, status: "pending" },
    { $set: { status: "superseded", decidedAt: new Date(), decidedBy: actor } },
  );

  const candidate = await ReleaseCandidate.create({
    productKey,
    displayName: normalized.displayName || previous?.displayName || productKey,
    fromVersion: previous?.version || "",
    toVersion: normalized.version || "",
    payload: normalized,
    notifyBody: {
      releaseNotes: body?.releaseNotes ?? undefined,
      notifySubscribers: body?.notifySubscribers ?? undefined,
    },
    submittedBy: actor,
  });

  const cfg = await getGateConfig();
  await recordGateEvent(
    "release.submitted",
    {
      productKey,
      candidateId: String(candidate._id),
      fromVersion: candidate.fromVersion,
      toVersion: candidate.toVersion,
      sha256: normalized.sha256 || "",
      packageUri: normalized.packageUri || "",
      approverEmail: cfg.approverEmail,
    },
    req,
  );

  await gateMail({
    to: cfg.approverEmail || ownerEmail(),
    subject: `Sign-off needed: ${candidate.displayName} v${candidate.toVersion}`,
    title: "A release is waiting for your sign-off",
    lines: [
      describeCandidate(candidate),
      `Submitted by ${esc(actor)}. Customers will not receive it until you approve it.`,
      "Signed in as yourself, the Installer Hub already offers you this build so you can install and test it before approving.",
      cfg.approverEmail ? "" : "<strong>No release approver is set, so nobody can approve this.</strong>",
    ].filter(Boolean),
    cta: { label: "Review the release", href: releasesUrl() },
  });

  return candidate;
}

/**
 * Write a candidate's payload to the live deployment and hand it to the
 * release notifier, which records the "new version is ready" notice and sends
 * nothing: customers are told in the next WEEKLY DIGEST (util/releaseDigest.js,
 * Monday 09:00 Lagos by default), one email each listing every update they
 * hold. The notice comes back with that date (nextDigestAt, nextDigestLagos),
 * the same fields the deployment PUT returns, so the approve and emergency
 * responses say when customers hear. Returns the updated deployment.
 *
 * `deployments`, `record` and `annotate` are for the tests.
 */
export async function applyCandidate(
  candidate,
  { actor, demoMode = false, deployments = ProductDeployment, record = recordDeploymentRelease, annotate = withNextDigest } = {},
) {
  const productKey = candidate.productKey;
  const previous = await deployments
    .findOne({ productKey })
    .select("version enabled packageUri")
    .lean()
    .catch(() => undefined);

  const item = await deployments.findOneAndUpdate(
    { productKey },
    { $set: { ...candidate.payload, updatedBy: actor }, $setOnInsert: { createdBy: candidate.submittedBy || actor } },
    { new: true, upsert: true, runValidators: true },
  );

  let releaseNotice;
  try {
    releaseNotice =
      previous === undefined
        ? { created: false, reason: "previous-version-unreadable" }
        : await record({
            previous,
            item: item?.toObject ? item.toObject() : item,
            body: candidate.notifyBody || {},
            demoMode,
            actor,
          });
  } catch (err) {
    releaseNotice = { created: false, error: String(err?.message || err) };
  }
  // When the weekly digest will mail it. Never fails the approval.
  try {
    releaseNotice = await annotate(releaseNotice);
  } catch {
    /* keep the notice as recorded */
  }
  return { item, releaseNotice };
}
