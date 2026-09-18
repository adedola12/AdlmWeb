// What a learner may upload as an assignment (R12, 2026-09-18).
//
// Uploads were images only: the signing route refused anything else and filed
// every file under adlm/avatars. Assignments are PDFs, Word and Excel files
// as often as photos. One list, used by the server and mirrored by the
// browser (client/src/lib/submissionFiles.js) so both say the same thing.
//
// Size: the real ceiling of the storage. Files go browser -> bucket by a
// presigned PUT, never through the API (the Lambda's 6 MB request cap does
// not apply); a single PUT to S3 or R2 tops out at 5 GiB.

export const SUBMISSION_TYPES = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

export const SUBMISSION_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB, one PUT

export const ACCEPT_ATTR = Object.keys(SUBMISSION_TYPES).map((e) => `.${e}`).join(",");

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || "").trim());
  return m ? m[1].toLowerCase() : "";
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * @returns {{ ok: true, ext: string, contentType: string } | { ok: false, error: string }}
 */
export function checkSubmissionFile({ name, type, size }) {
  const ext = extOf(name);
  const allowed = SUBMISSION_TYPES[ext];
  if (!allowed) {
    return {
      ok: false,
      error: "That file type is not accepted. Upload a PDF, Word (.docx), Excel (.xlsx) or an image (JPG, PNG, WebP).",
    };
  }
  // Browsers sometimes leave the type blank (Excel on some systems); the
  // extension then decides. A type that contradicts the extension does not.
  const mime = String(type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !allowed.includes(mime)) {
    return { ok: false, error: `That file says it is .${ext} but its contents look like something else. Save it again as .${ext} and retry.` };
  }
  const bytes = Number(size) || 0;
  if (bytes <= 0) return { ok: false, error: "That file is empty." };
  if (bytes > SUBMISSION_MAX_BYTES) {
    return { ok: false, error: `That file is ${human(bytes)}. The limit is ${human(SUBMISSION_MAX_BYTES)}.` };
  }
  return { ok: true, ext, contentType: allowed[0] };
}

/** A storage key that cannot collide or escape its folder. */
export function submissionKey({ userId, courseSku, moduleCode, name, now = Date.now() }) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return `submissions/${safe(courseSku)}/${safe(userId)}/${safe(moduleCode)}/${now}-${safe(name)}`;
}
