// server/services/modelDriftNotify.js
//
// The owner's one email when a drift is first detected (work-board item
// r2-model-drift-alerts). Transactional, so it goes out when it happens (the
// work-hours hold is for bulk mail only) and through sendMail, which the API
// runs SES-only. It is never awaited by the plugin's request: a slow mail
// provider must not hold up QUIV opening a project.
import { TakeoffProject } from "../models/TakeoffProject.js";
import { ModelDriftEvent } from "../models/ModelDriftEvent.js";
import { User } from "../models/User.js";
import { sendMail } from "../util/mailer.js";
import { modelDriftAlert } from "../util/emailContent.js";
import { emailBrand } from "../util/emailLayout.js";

const PRODUCT_NAMES = { revit: "QUIV", archicad: "QUIV for ArchiCAD" };

/** Where the owner opens the project on the web. */
export function projectUrlFor(project, site = emailBrand.SITE) {
  const base = String(site || "https://www.adlmstudio.net").replace(/\/+$/, "");
  const id = String(project?._id || "");
  const key = String(project?.productKey || "").toLowerCase();
  if (!id) return `${base}/work`;
  if (key === "archicad") return `${base}/archicad/${id}/boq`;
  return `${base}/projects/${key || "revit"}?project=${id}`;
}

/**
 * Email the owner once for this drift. Marks notifiedAt first, conditionally,
 * so two plugins reporting the same drift at once send one email, not two.
 */
export async function notifyOwnerOfDrift(projectId, { send = sendMail } = {}) {
  const now = new Date();
  const project = await TakeoffProject.findOneAndUpdate(
    { _id: projectId, "modelDrift.status": "open", "modelDrift.notifiedAt": null },
    { $set: { "modelDrift.notifiedAt": now } },
    { new: true, timestamps: false, projection: { name: 1, userId: 1, productKey: 1, modelDrift: 1 } },
  ).lean();
  if (!project) return { sent: false, reason: "already notified or not open" };

  const owner = project.userId
    ? await User.findById(project.userId).select("email firstName name").lean()
    : null;
  const to = String(owner?.email || "").trim();
  if (!to) return { sent: false, reason: "owner has no email" };

  const { subject, html } = modelDriftAlert({
    firstName: owner.firstName || owner.name || "",
    projectName: project.name || "your project",
    productName: PRODUCT_NAMES[project.productKey] || "The plugin",
    counts: project.modelDrift?.counts || {},
    href: projectUrlFor(project),
  });
  await send({ to, subject, html, templateKey: "project.model-drift" });
  if (project.modelDrift?.eventId) {
    await ModelDriftEvent.updateOne({ _id: project.modelDrift.eventId }, { $set: { notifiedAt: now } });
  }
  return { sent: true };
}
