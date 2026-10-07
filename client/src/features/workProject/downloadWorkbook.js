// Fetch an .xlsx from the export API and save it — the classic workspace's
// downloadWorkbook (ProjectsGeneric), lifted out so this page uses the same
// guard: an HTML error page saved as .xlsx is the one failure nobody can
// diagnose, so anything that is not a workbook is refused with what the server
// actually said.

import { API_BASE } from "../../config";
import { filenameFrom } from "./exportModel.js";

async function reasonFrom(res, fallback) {
  const raw = await res.text().catch(() => "");
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || parsed?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function downloadWorkbook({ path, filename, token }) {
  const url = new URL(path, API_BASE || window.location.origin).toString();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await reasonFrom(res, "The export failed."));

  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("spreadsheetml.sheet") && !ct.includes("application/octet-stream")) {
    throw new Error("The server sent something that is not a workbook. Try again in a moment.");
  }

  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filenameFrom(res.headers.get("content-disposition"), filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  return a.download;
}
