// What may be uploaded as a sample model, and where it is stored.
//
// WHY PRIVATE STORAGE, NOT THE PUBLIC BUCKET
//
// A Revit file is the most valuable thing in a course. The Installer Hub is the
// cautionary tale: its builds were written to a PUBLIC prefix and the URL
// pasted into a setting, and on 30 Sep 2026 that link was still being handed
// out — a paid installer, free to anyone holding the URL. The same mistake with
// a course's model would give away the course.
//
// So every sample model goes to the private store under a key we choose, and is
// served as a short-lived signed link. Nothing about the upload is guessable
// from the download, and a link that leaks expires.
//
// WHAT A DEMO MODEL ACTUALLY IS
//
// Two jobs, deliberately one thing:
//
//   course   the file a student opens to follow a lesson — a .rvt they measure
//            in QUIV, a .ifc they load in the viewer
//   demo     the model shipped so somebody evaluating the software has
//            something to open on day one
//
// They are the same asset with a different audience, so they share a library
// and differ by `purpose` and `access`. Two libraries would mean the same file
// uploaded twice and one of them going stale.
//
// Pure, so it is tested without storage or a database.

/** What a sample model may be. */
export const MODEL_FORMATS = Object.freeze({
  rvt: { ext: ".rvt", label: "Revit model", contentType: "application/octet-stream" },
  ifc: { ext: ".ifc", label: "IFC model", contentType: "application/x-step" },
  ifczip: { ext: ".ifczip", label: "Zipped IFC", contentType: "application/octet-stream" },
  frag: { ext: ".frag", label: "Fragments model", contentType: "application/octet-stream" },
  // PlanSwift jobs are a folder, so a zip is the only sane shape for a HERON
  // sample. Accepted only because HERON has no single-file format.
  zip: { ext: ".zip", label: "Take-off package", contentType: "application/zip" },
  dwg: { ext: ".dwg", label: "AutoCAD drawing", contentType: "application/octet-stream" },
  pln: { ext: ".pln", label: "ArchiCAD project", contentType: "application/octet-stream" },
});

/** A Revit model is bigger than an installer; 2 GB is the honest ceiling. */
export const MODEL_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const MODEL_PURPOSES = Object.freeze(["course", "demo"]);

/**
 * Who may download it.
 *
 *   public     anybody, signed in or not — a teaser model
 *   signed-in  any account
 *   entitled   only an account with a live licence for its product
 *   course     only somebody enrolled on the course it belongs to
 */
export const MODEL_ACCESS = Object.freeze(["public", "signed-in", "entitled", "course"]);

const extOf = (name) => {
  const m = String(name || "").trim().toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
};

/** The format key for a file name, or "" when it is not one we take. */
export function formatFor(filename) {
  const ext = extOf(filename);
  for (const [key, def] of Object.entries(MODEL_FORMATS)) {
    if (def.ext === ext) return key;
  }
  return "";
}

/**
 * Why this file cannot be a sample model, or null when it can.
 *
 * Returns a sentence an admin can act on, not a code — the screen shows it
 * verbatim.
 */
export function modelUploadProblem({ filename, size } = {}) {
  const name = String(filename || "").trim();
  if (!name) return "Choose a file.";
  const fmt = formatFor(name);
  if (!fmt) {
    const list = Object.values(MODEL_FORMATS).map((f) => f.ext).join(", ");
    return `That file type cannot be a sample model. Accepted: ${list}.`;
  }
  const n = Number(size || 0);
  if (n && n > MODEL_MAX_BYTES) {
    return `That file is over the ${Math.round(MODEL_MAX_BYTES / (1024 * 1024 * 1024))} GB limit.`;
  }
  return null;
}

/** A file name safe to put in a storage key and a Content-Disposition. */
export function safeModelName(filename) {
  const raw = String(filename || "").trim();
  const ext = extOf(raw);
  const stem = raw.slice(0, raw.length - ext.length) || "model";
  const clean = stem
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${clean || "model"}${ext}`;
}

/**
 * Where the file lives.
 *
 * The id is in the key, so two models with the same file name cannot collide
 * and a key cannot be guessed from the title. Nothing is ever written to a
 * public prefix.
 */
export function modelStorageKey(id, filename) {
  return `demo-models/${String(id)}/${safeModelName(filename)}`;
}

/** The content type to sign the upload with. */
export function contentTypeFor(filename) {
  const fmt = formatFor(filename);
  return MODEL_FORMATS[fmt]?.contentType || "application/octet-stream";
}
