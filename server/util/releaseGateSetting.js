// server/util/releaseGateSetting.js
//
// Some settings ARE a release. `installerHubUrl` is the link every customer's
// "Download the Installer Hub" button follows, so saving it repoints the whole
// fleet at a new Hub the moment it is written — with no sign-off, which was the
// one way round the gate (docs/RELEASE_GATE.md).
//
// Staging one works like a plugin release: the save is held as a pending
// ReleaseCandidate of kind "setting", customers keep the current Hub, and the
// approver makes it live from the release desk. The old value is kept on the
// candidate so a rollback is a fact, not a memory.
import { Setting } from "../models/Setting.js";
import { ReleaseCandidate } from "../models/ReleaseCandidate.js";
import {
  describeSettingChange,
  esc,
  gateMail,
  getGateConfig,
  ownerEmail,
  recordGateEvent,
  releasesUrl,
} from "./releaseGate.js";

/** Settings that reach customers on their own, and what to call them. */
export const GATED_SETTINGS = {
  installerHubUrl: {
    label: "Installer Hub download",
    what: "the file every customer's Download the Installer Hub button fetches",
  },
};

export function isGatedSetting(field) {
  return Object.prototype.hasOwnProperty.call(GATED_SETTINGS, field);
}

/**
 * Hold a gated setting change for sign-off.
 *
 * Returns the candidate. The caller must NOT write the setting; customers stay
 * on the current value until the approver approves.
 */
export async function stageSettingChange({ field, value, previous, actor, req }) {
  const meta = GATED_SETTINGS[field];

  // A newer staged change replaces an older one, so the approver is never
  // looking at two answers to the same question.
  await ReleaseCandidate.updateMany(
    { kind: "setting", settingField: field, status: "pending" },
    { $set: { status: "superseded", decidedAt: new Date(), decidedBy: actor } },
  );

  const candidate = await ReleaseCandidate.create({
    kind: "setting",
    settingField: field,
    settingPrevious: previous || "",
    // productKey is required by the model and indexes the desk's list.
    productKey: "installer-hub",
    displayName: meta?.label || field,
    fromVersion: previous ? "current" : "none",
    toVersion: "new",
    payload: { [field]: value },
    submittedBy: actor,
  });

  const cfg = await getGateConfig();
  await recordGateEvent(
    "setting.submitted",
    { settingField: field, candidateId: String(candidate._id), previous: previous || "", next: value, approverEmail: cfg.approverEmail },
    req,
  );

  await gateMail({
    to: cfg.approverEmail || ownerEmail(),
    subject: `Sign-off needed: ${meta?.label || field}`,
    title: "A change is waiting for your sign-off",
    lines: [
      describeSettingChange({ label: meta?.label || field, what: meta?.what || "", previous, value }),
      `Submitted by ${esc(actor)}. Customers keep the current one until you approve it.`,
      "Install it from that link yourself first: approving it points every customer at it.",
    ],
    cta: { label: "Review it", href: releasesUrl() },
  });

  return candidate;
}

/** Make an approved setting change live. Used by the release desk's approve. */
export async function applySettingCandidate(candidate, { actor }) {
  const field = candidate.settingField;
  if (!isGatedSetting(field)) {
    throw Object.assign(new Error(`${field} is not a gated setting.`), { status: 400 });
  }
  const value = candidate.payload?.[field] ?? "";
  const s = await Setting.findOneAndUpdate(
    { key: "global" },
    { [field]: value },
    { upsert: true, new: true },
  );
  return { setting: { [field]: s?.[field] }, previous: candidate.settingPrevious || "" };
}
