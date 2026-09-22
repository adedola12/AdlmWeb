// server/util/releaseGateFlow.js
//
// Staging a plugin release and, later, making it live. Split out of the route
// files so admin.deployments.js (which stages) and admin.releases.js (which
// approves) share one implementation of "apply".
import { ProductDeployment } from "../models/ProductDeployment.js";
import { applySettingCandidate } from "./releaseGateSetting.js";
import { ReleaseCandidate } from "../models/ReleaseCandidate.js";
import { cancelEarlyNotices, recordDeploymentRelease, widenReleaseNotice } from "./releaseNotifier.js";
import {
  ROLLOUT_EVERYONE,
  ROLLOUT_ORGANIZATIONS,
  canReleaseToEveryone,
  earlyAccessFor,
  earlyAccessStillAhead,
  normalizeRollout,
  stageFor,
} from "./releaseRollout.js";
import { recordInstallerHubChange, withNextDigest } from "./releaseDigest.js";
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
    rollout: normalizeRollout(body),
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
      candidate.rollout === ROLLOUT_EVERYONE
        ? "Marked as a hotfix: once approved it goes to every customer at once."
        : "Once approved it goes to firms with more than 5 seats first; everyone else can have it three months later.",
      "Signed in as yourself, the Installer Hub already offers you this build so you can install and test it before approving.",
      cfg.approverEmail ? "" : "<strong>No release approver is set, so nobody can approve this.</strong>",
    ].filter(Boolean),
    cta: { label: "Review the release", href: releasesUrl() },
  });

  return candidate;
}

/**
 * Approve-time: send a candidate where its rollout says (util/releaseRollout.js).
 *
 * Firms first: the payload is kept as the deployment's `earlyAccess` and the
 * live row, which everyone else is offered, is not touched. The release email
 * goes only to the firms' accounts.
 * Everyone (a hotfix, or a build with nothing live to hold back to): the
 * payload is written to the live row, as the gate always did.
 *
 * NOTHING IS MAILED HERE. The notifier records the "new version is ready"
 * notice and sends nothing: customers are told in the next WEEKLY DIGEST
 * (util/releaseDigest.js, Monday 09:00 Lagos by default), one email each
 * listing every update they hold. The notice comes back with that date
 * (nextDigestAt, nextDigestLagos), the same fields the deployment PUT returns,
 * so the approve and emergency responses say when customers hear.
 *
 * This is also the ONLY place a staged build becomes a digest item: a candidate
 * sitting at /admin/releases unapproved has no notice, so it can never reach a
 * digest (docs/RELEASE_GATE.md).
 *
 * `rollout` overrides the candidate's own choice (the approver's switch).
 * `deployments`, `record`, `recordHub` and `annotate` are for the tests.
 * Returns { item, releaseNotice, appliedTo }.
 */
export async function applyCandidate(
  candidate,
  {
    actor,
    demoMode = false,
    rollout,
    now = new Date(),
    deployments = ProductDeployment,
    record = recordDeploymentRelease,
    recordHub = recordInstallerHubChange,
    annotate = withNextDigest,
  } = {},
) {
  // A gated SETTING (installerHubUrl) is not a package: it writes the
  // Setting and reaches every customer at once. No rollout stages apply.
  //
  // This is the approval of a new Installation Center, so it is also where its
  // digest item is queued: the save at POST /admin/settings/installer-hub only
  // STAGES the link (routes/admin.settings.js), customers keep the current Hub
  // until here, and a staged link that is never approved announces nothing.
  if (candidate.kind === "setting") {
    const out = await applySettingCandidate(candidate, { actor });
    let releaseNotice = { created: false, reason: "setting-change" };
    if (candidate.settingField === "installerHubUrl") {
      releaseNotice = await annotated(
        annotate,
        safeNotice(() =>
          recordHub({
            previousUrl: candidate.settingPrevious || "",
            nextUrl: candidate.payload?.installerHubUrl || "",
            actor,
            demoMode,
          }),
        ),
      );
    }
    return { item: out.setting, releaseNotice, appliedTo: "everyone" };
  }

  const productKey = candidate.productKey;
  const live = await deployments
    .findOne({ productKey })
    .select("version enabled packageUri earlyAccess")
    .lean()
    .catch(() => undefined);

  const wanted = rollout ? normalizeRollout({ rollout }) : candidate.rollout || ROLLOUT_ORGANIZATIONS;
  const appliedTo = live === undefined ? ROLLOUT_EVERYONE : stageFor({ rollout: wanted, live, payload: candidate.payload });

  if (appliedTo === ROLLOUT_ORGANIZATIONS) {
    const earlyAccess = earlyAccessFor({ existing: live?.earlyAccess, candidate, actor, now });
    const item = await deployments.findOneAndUpdate(
      { productKey },
      { $set: { earlyAccess, updatedBy: actor } },
      { new: true, runValidators: true },
    );
    const releaseNotice = await annotated(
      annotate,
      safeNotice(() =>
        record({
          previous: { version: live?.earlyAccess?.version || live.version, enabled: live.enabled, packageUri: live.packageUri },
          item: { ...candidate.payload, productKey },
          body: candidate.notifyBody || {},
          demoMode,
          actor,
          audience: ROLLOUT_ORGANIZATIONS,
        }),
      ),
    );
    return { item, releaseNotice, appliedTo };
  }

  const item = await deployments.findOneAndUpdate(
    { productKey },
    { $set: { ...candidate.payload, updatedBy: actor }, $setOnInsert: { createdBy: candidate.submittedBy || actor } },
    { new: true, upsert: true, runValidators: true },
  );
  // A hotfix that catches up with (or passes) the firms' build ends the early
  // stage: everybody is on it now.
  if (live?.earlyAccess && !earlyAccessStillAhead(live.earlyAccess, item.version)) {
    await deployments.updateOne({ productKey }, { $set: { earlyAccess: null } });
    item.earlyAccess = null;
  }

  const releaseNotice = await annotated(
    annotate,
    live === undefined
      ? Promise.resolve({ created: false, reason: "previous-version-unreadable" })
      : safeNotice(() =>
          record({
            previous: live ? { version: live.version, enabled: live.enabled, packageUri: live.packageUri } : null,
            item: item?.toObject ? item.toObject() : item,
            body: candidate.notifyBody || {},
            demoMode,
            actor,
          }),
        ),
  );
  return { item, releaseNotice, appliedTo };
}

async function safeNotice(fn) {
  try {
    return await fn();
  } catch (err) {
    return { created: false, error: String(err?.message || err) };
  }
}

/**
 * Add when the weekly digest will mail it (nextDigestAt, nextDigestLagos).
 * Never fails the approval: a notice that cannot be dated comes back exactly as
 * it was recorded.
 */
async function annotated(annotate, noticePromise) {
  const releaseNotice = await noticePromise;
  try {
    return await annotate(releaseNotice);
  } catch {
    return releaseNotice; // keep the notice as recorded
  }
}

/**
 * Stage 2: the firms' build goes to everyone. Only once the three months are
 * up (the button is locked before then). Writes the early payload to the live
 * row, clears `earlyAccess`, and widens the build's release email to every
 * licence holder not already mailed.
 *
 * Widening does not send either: the notice becomes a candidate again and the
 * next weekly digest carries it to everyone outside the firms' ring
 * (util/releaseNotifier.js widenReleaseNotice). Throws with a `status` when
 * refused.
 */
export async function releaseToEveryone(productKey, { actor, demoMode = false, now = new Date() }) {
  const dep = await ProductDeployment.findOne({ productKey }).lean();
  const early = dep?.earlyAccess;
  if (!early?.payload) throw Object.assign(new Error("Nothing is waiting to go to everyone for this product."), { status: 404 });
  if (!canReleaseToEveryone(early, now)) {
    throw Object.assign(
      new Error(`This build can go to everyone from ${new Date(early.unlocksAt).toDateString()}.`),
      { status: 409, unlocksAt: early.unlocksAt },
    );
  }

  const item = await ProductDeployment.findOneAndUpdate(
    { productKey, "earlyAccess.candidateId": early.candidateId },
    { $set: { ...early.payload, earlyAccess: null, updatedBy: actor } },
    { new: true, runValidators: true },
  );
  if (!item) throw Object.assign(new Error("The early build changed while this was being released; reload and try again."), { status: 409 });

  const releaseNotice = demoMode
    ? { widened: false, reason: "demo-mode" }
    : await annotated(withNextDigest, safeNotice(() => widenReleaseNotice({ productKey, version: early.payload.version, actor })));
  return { item, early, previousVersion: dep.version, releaseNotice };
}

/**
 * Take a build back from the firms (a bad release): clears `earlyAccess` so
 * their Hubs are offered the live build again, and cancels its unfinished
 * email. A notice a digest has already started mailing is cancelled too
 * (OPEN_STATUSES includes "digesting"), so it is dropped from every email that
 * digest has not sent yet. Allowed at any time.
 */
export async function withdrawEarlyAccess(productKey, { actor }) {
  const dep = await ProductDeployment.findOne({ productKey }).lean();
  const early = dep?.earlyAccess;
  if (!early?.payload) throw Object.assign(new Error("Nothing is with firms for this product."), { status: 404 });
  await ProductDeployment.updateOne(
    { productKey, "earlyAccess.candidateId": early.candidateId },
    { $set: { earlyAccess: null, updatedBy: actor } },
  );
  const cancelled = await cancelEarlyNotices({ productKey, reason: `v${early.version} taken back from firms` }).catch(() => []);
  return { early, liveVersion: dep.version, displayName: dep.displayName || productKey, cancelled };
}
