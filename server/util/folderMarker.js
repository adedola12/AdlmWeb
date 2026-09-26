// HERON (PlanSwift) saves one marker row ahead of each take-off folder:
//   { description: "--- GF ---", type: "section", code: "folder:GF", level: "GF", qty: 0 }
// It records which folder the lines below came from. It is not a bill line, so the
// Bill shows it as neither a line nor a count. Keep in step with client/src/lib/folderMarker.js.
export function isFolderMarker(item) {
  if (!item) return false;
  if (String(item.type || "").trim().toLowerCase() !== "section") return false;
  if (Number(item.qty) || 0) return false;
  const code = String(item.code || "").trim().toLowerCase();
  const desc = String(item.description || "").trim();
  return code.startsWith("folder:") || /^---.*---$/.test(desc);
}
