// Upload an assignment file and record the submission (R12, 2026-09-18).
//
// PDF, Word (.docx), Excel (.xlsx) and images, up to the storage's 5 GB
// single-upload ceiling; the same rules as server/util/submissionFiles.js,
// checked here first so a wrong file is refused before a long upload. The
// file goes straight from the browser to private storage with a presigned
// PUT, then the submission is recorded with the storage key.

import { apiAuthed } from "../api.js";

const TYPES = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};
export const SUBMISSION_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
export const SUBMISSION_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export function submissionFileProblem(file) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file?.name || "")?.[1] || "").toLowerCase();
  const allowed = TYPES[ext];
  if (!allowed) {
    return "That file type is not accepted. Upload a PDF, Word (.docx), Excel (.xlsx) or an image (JPG, PNG, WebP).";
  }
  const mime = String(file.type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !allowed.includes(mime)) {
    return `That file says it is .${ext} but its contents look like something else. Save it again as .${ext} and retry.`;
  }
  if (!file.size) return "That file is empty.";
  if (file.size > SUBMISSION_MAX_BYTES) return "That file is over the 5 GB limit.";
  return null;
}

function put(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`The upload was refused (${xhr.status}). Please try again.`));
    xhr.onerror = () => reject(new Error("The upload stopped: check the connection and try again."));
    xhr.send(file);
  });
}

/**
 * @returns {Promise<{ submission: object, fileName: string, submittedAt: Date }>}
 */
export async function uploadSubmission({ sku, moduleCode, file, token, note = "", onProgress }) {
  const problem = submissionFileProblem(file);
  if (problem) throw new Error(problem);
  const base = `/me/courses/${encodeURIComponent(sku)}`;
  const slot = await apiAuthed(`${base}/submission-upload`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleCode, fileName: file.name, fileType: file.type, fileSize: file.size }),
  });
  await put(slot.uploadUrl, file, slot.contentType, onProgress);
  const submission = await apiAuthed(`${base}/submit`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleCode, fileKey: slot.key, fileName: file.name, note }),
  });
  return { submission, fileName: file.name, submittedAt: new Date(submission?.createdAt || Date.now()) };
}
