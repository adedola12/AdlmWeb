// Who may download a sample model.
//
// Four levels, because the same library serves four different situations and
// collapsing them would either give away a course or make a demo useless:
//
//   public     anybody. A teaser model, the thing a visitor opens before they
//              have an account.
//   signed-in  any account. Enough friction to know who has it, no licence
//              needed.
//   entitled   only somebody with a LIVE licence for the product it belongs to.
//              An expired licence does not count: that is the difference
//              between a customer and a former one.
//   course     only somebody enrolled on the course it was made for. This is
//              the one that protects the thing people paid for.
//
// Pure: takes the model, the viewer and their enrolments, and answers. No
// database, so every branch is tested.

const str = (v) => String(v || "").trim().toLowerCase();

/** A live entitlement for this product — active, and not expired. */
export function hasLiveLicence(user, productKey) {
  const key = str(productKey);
  if (!key) return false;
  const ents = Array.isArray(user?.entitlements) ? user.entitlements : [];
  return ents.some((e) => {
    if (str(e?.productKey) !== key) return false;
    if (str(e?.status) !== "active") return false;
    // No expiry means perpetual. A date in the past does not.
    if (!e?.expiresAt) return true;
    const t = new Date(e.expiresAt).getTime();
    return !Number.isFinite(t) || t > Date.now();
  });
}

/**
 * May this viewer download it?
 *
 * @param {object} model              the DemoModel
 * @param {object|null} user          the signed-in user, or null
 * @param {Array} enrolments          the viewer's course enrolments
 * @returns {{allowed: boolean, reason: string}} reason is shown to the reader
 */
export function canDownloadModel(model, user, enrolments = []) {
  if (!model) return { allowed: false, reason: "That model does not exist." };

  // An unpublished or half-uploaded model is nobody's, including an admin's —
  // they have their own route. This keeps a broken download out of a course.
  if (!model.published) return { allowed: false, reason: "That model is not published yet." };
  if (!model.fileKey || !model.uploadedAt) {
    return { allowed: false, reason: "That model has not finished uploading." };
  }

  const access = str(model.access) || "signed-in";

  if (access === "public") return { allowed: true, reason: "" };

  if (!user?._id) {
    return { allowed: false, reason: "Sign in to download this model." };
  }

  if (access === "signed-in") return { allowed: true, reason: "" };

  if (access === "entitled") {
    return hasLiveLicence(user, model.productKey)
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason: "This sample comes with a live licence for the product it belongs to.",
        };
  }

  if (access === "course") {
    // THE SKU. A learner's enrolment is keyed by courseSku, not by the course's
    // ObjectId (models/CourseEnrollment.js), so matching on an id here would
    // refuse every course model to the very students it was made for.
    const want = str(model.courseSku);
    if (!want) {
      // A course model with no course can never be checked, so it is refused
      // rather than quietly opened to everyone.
      return { allowed: false, reason: "That model is not attached to a course." };
    }
    const enrolled = (Array.isArray(enrolments) ? enrolments : []).some(
      (e) => str(e?.courseSku) === want && str(e?.status) !== "cancelled",
    );
    return enrolled
      ? { allowed: true, reason: "" }
      : { allowed: false, reason: "This model is part of a course you are not enrolled on." };
  }

  // An access level nobody recognises is a closed door, not an open one.
  return { allowed: false, reason: "That model is not available." };
}

/** What a viewer may see listed, which is not the same as what they may download. */
export function visibleToViewer(model, user) {
  if (!model?.published) return false;
  // Everything published is listed — a student should be able to SEE that a
  // course has a model before enrolling. The download is where the gate is.
  if (str(model.access) === "public") return true;
  return Boolean(user?._id) || str(model.access) !== "signed-in";
}
