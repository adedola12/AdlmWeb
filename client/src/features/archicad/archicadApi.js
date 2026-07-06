// src/features/archicad/archicadApi.js
// Small shared helpers for the QUIV for ArchiCAD screens.

/**
 * Server responses may be bare payloads (arrays / documents, projects.js
 * style) or `{ ok: true, ... }` envelopes (newer surfaces). Unwrap both.
 */
export function unwrap(res) {
  if (res == null) return null;
  if (Array.isArray(res)) return res;
  if (typeof res === "object" && res.ok === true) {
    const { ok: _ok, ...rest } = res;
    for (const k of ["boq", "document", "doc", "items", "projects", "versions", "element", "data"]) {
      if (rest[k] !== undefined) return rest[k];
    }
    return rest;
  }
  return res;
}

export function unwrapList(res) {
  const out = unwrap(res);
  return Array.isArray(out) ? out : [];
}

/** Fixed NRM-style category order (api-contract.md). */
export const ARCHICAD_CATEGORIES = [
  { key: "substructure", title: "Substructure" },
  { key: "frame", title: "Frame" },
  { key: "upperFloors", title: "Upper Floors" },
  { key: "roof", title: "Roof" },
  { key: "externalWalls", title: "External Walls" },
  { key: "internalWalls", title: "Internal Walls" },
  { key: "windowsExternalDoors", title: "Windows & External Doors" },
  { key: "internalDoors", title: "Internal Doors" },
];
