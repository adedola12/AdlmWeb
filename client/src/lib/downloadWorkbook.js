// Fetch a file the API builds and save it.
//
// WHY THIS IS A MODULE AND NOT A FUNCTION IN A COMPONENT
//
// The same three helpers have existed since the first export shipped, inside
// pages/ProjectsGeneric.jsx (:5490-5552) — declared in the body of a 6,268-line
// component, closing over its `accessToken`. Nothing outside that component can
// call them, which is how the new project workspace came to have no exports at
// all: the comment in features/workProject/headModel.js dropped "Export to
// Excel" from Richard's own overflow list on the grounds that "the export is
// ~400 lines of workbook building in ProjectsGeneric".
//
// That is true of exactly one of them. The generic BoQ workbook IS built in the
// browser with SheetJS. The other seven — the elemental and trade bills of
// quantities, the bill-and-budget workbook in two groupings, a payment
// certificate and the final account — are built by the SERVER and served from
// plain authenticated GET endpoints. For those, the whole client side is this
// file: a fetch, a content-type check, a filename, an anchor.
//
// THE CONTENT-TYPE CHECK IS THE POINT
//
// An HTML error page saved as .xlsx is the one failure a QS cannot diagnose:
// Excel says the file is corrupt, and nothing says the server actually answered
// "session expired". So a response that is not a spreadsheet is read as text and
// its message raised, never written to disk.

import { API_BASE } from "../config.js";

/** The server's own message for a failed export, or the fallback. */
export async function errorMessageFrom(res, fallback) {
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || parsed?.message || fallback;
  } catch {
    return raw;
  }
}

/**
 * The filename the server asked for, or the fallback.
 *
 * Every export route sets Access-Control-Expose-Headers: Content-Disposition,
 * so this survives a cross-origin fetch — api.adlmstudio.net is a different
 * origin from the site, and without that header the browser hides the name and
 * every workbook would be saved under our guess at it.
 */
export function filenameFromDisposition(disposition, fallback) {
  const cd = String(disposition || "");
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

const EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A character a filename may not carry on Windows, macOS or Linux. */
export const sanitizeFilename = (s) =>
  String(s || "")
    .replace(/[\\:*?"<>|/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "Project";

/**
 * Fetch a file from the API and save it.
 *
 * @param {object}   p
 * @param {string}   p.path            API path, with its query string
 * @param {string}   p.token           the caller's access token
 * @param {string}   p.fallbackName    used only if the server names nothing
 * @param {string}   p.failureMessage  shown if the server says nothing either
 * @param {string}   [p.accept]        expected media type; defaults to .xlsx
 * @returns {Promise<string>} the filename actually saved
 * @throws {Error} with the server's own message where there is one
 */
export async function downloadFile({
  path,
  token,
  fallbackName,
  failureMessage = "The export failed",
  accept = EXCEL,
}) {
  const base = API_BASE || window.location.origin;
  const res = await fetch(new URL(path, base).toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
    credentials: "include",
  });

  if (!res.ok) throw new Error(await errorMessageFrom(res, failureMessage));

  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  // octet-stream is allowed because a proxy that does not know the Office types
  // rewrites them to it, and refusing that would refuse a perfectly good file.
  const want = accept.split("/").pop();
  const ok =
    ct.includes(want) ||
    ct.includes("octet-stream") ||
    (accept === EXCEL && ct.includes("spreadsheetml.sheet"));
  if (!ok) {
    const txt = await res.text();
    throw new Error(
      `The server did not return a file (${ct || "no content type"}). ${txt.slice(0, 200)}`.trim(),
    );
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("content-disposition"),
    fallbackName,
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  return filename;
}

export default downloadFile;
