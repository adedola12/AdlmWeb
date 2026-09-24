// One certificate reference, printed and verifiable (R14, 2026-09-18).
//
// The learner's certificate used to print ADLM-<TAG>-<YEAR>-<last4>, worked
// out on the fly, while GET /verify/:ref only knows the stored CERT-XXXXXX
// written by the admin screens, so a printed reference could never verify.
// Now the stored reference is the only one: made once from the enrolment id
// (the admin screens' rule), saved, and shown everywhere after that.

export function refFor(id) {
  return `CERT-${String(id || "").slice(-6).toUpperCase()}`;
}

export const REF_PATTERN = /^CERT-[A-Z0-9]{4,12}$/;

/**
 * The stored reference of an issued certificate, creating and saving it the
 * first time. Returns "" for a course not finished yet.
 * @param {object} enrollment  a mongoose document or a plain object
 * @param {(ref: string) => Promise<void>} [save]  persists a new reference
 */
export async function ensureCertificateRef(enrollment, save) {
  if (!enrollment) return "";
  if (enrollment.certificateRef) return enrollment.certificateRef;
  const issued = enrollment.certificateIssuedAt || enrollment.status === "completed";
  if (!issued) return "";
  const ref = refFor(enrollment._id);
  if (save) await save(ref);
  return ref;
}

/**
 * What GET /verify/:ref answers (R14): only what is printed on the certificate
 * being checked. The name is the one the holder confirmed, when they have; the
 * finish and the ISO date let the public check draw the certificate as issued.
 */
export function verifyReply({ ref, enr, course, who, day }) {
  const claimed = !!who?.certificateNameLockedAt;
  const name = who
    ? (claimed
        ? [who.certificateFirstName, who.certificateLastName]
        : [who.firstName, who.lastName]
      )
        .filter(Boolean)
        .join(" ")
    : "";
  const revoked = enr.certificateState === "revoked";
  return {
    found: true,
    valid: !revoked,
    ref,
    who: name || "the holder",
    claimed,
    course: course?.title || enr.courseSku || "",
    issued: day(enr.certificateIssuedAt),
    issuedAt: enr.certificateIssuedAt ? new Date(enr.certificateIssuedAt).toISOString() : null,
    finish: enr.certificateFinish === "light" ? "light" : "dark",
    withdrawn: revoked ? day(enr.certificateStateAt) : null,
    said: revoked
      ? `This certificate was withdrawn by ADLM Studio on ${day(enr.certificateStateAt)} and should not be relied on.`
      : `Issued by ADLM Studio on ${day(enr.certificateIssuedAt)}.`,
  };
}
