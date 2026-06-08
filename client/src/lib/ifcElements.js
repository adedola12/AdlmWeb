// src/lib/ifcElements.js
//
// Client-side IFC parsing for the model-upload validation gate (and, later,
// the 3D viewer). Reads the Revit Element ID that Revit writes into each IFC
// element's `Tag` attribute, so the server can confirm an uploaded model
// actually contains the elements the quantities were measured from.
//
// The IFC `GlobalId` is a separate GUID (derived from the Revit UniqueId);
// the integer Element ID we match against `item.elementIds` lives in `Tag`.

import * as WebIFC from "web-ifc";
import JSZip from "jszip";

let _apiPromise = null;

// Lazily init a single web-ifc instance and reuse it (the wasm is ~1.3 MB —
// no point reloading it per upload). Exported so the 3D viewer shares the
// same initialized instance.
export async function getIfcApi() {
  if (!_apiPromise) {
    _apiPromise = (async () => {
      const api = new WebIFC.IfcAPI();
      // Single-thread wasm served from client/public/web-ifc/. absolute=true
      // → loaded from the site root, not relative to the web-ifc module.
      // (Multi-thread wasm needs COOP/COEP cross-origin-isolation headers we
      // don't set, so we deliberately use the single-thread build.)
      api.SetWasmPath("/web-ifc/", true);
      await api.Init();
      return api;
    })();
  }
  return _apiPromise;
}

// Fallback list of concrete element types, used only if the IFCELEMENT
// supertype constant is unavailable. Resolved against the loaded constants so
// types absent from a given schema (IFC2x3 vs IFC4) are simply skipped. Being
// generous is safe: extra Tags only help matching — validation is
// requiredIds ⊆ found, so it can never cause a false rejection.
const FALLBACK_ELEMENT_TYPE_NAMES = [
  "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCBEAM", "IFCCOLUMN",
  "IFCFOOTING", "IFCPILE", "IFCDOOR", "IFCWINDOW", "IFCROOF",
  "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAMP", "IFCRAMPFLIGHT", "IFCRAILING",
  "IFCMEMBER", "IFCPLATE", "IFCCOVERING", "IFCCURTAINWALL",
  "IFCBUILDINGELEMENTPROXY", "IFCBUILDINGELEMENTPART", "IFCCHIMNEY",
  "IFCSHADINGDEVICE", "IFCFURNISHINGELEMENT", "IFCFURNITURE",
  "IFCREINFORCINGBAR", "IFCREINFORCINGMESH", "IFCREINFORCINGELEMENT",
  "IFCFLOWSEGMENT", "IFCFLOWFITTING", "IFCFLOWTERMINAL", "IFCFLOWCONTROLLER",
  "IFCFLOWMOVINGDEVICE", "IFCFLOWSTORAGEDEVICE", "IFCFLOWTREATMENTDEVICE",
  "IFCENERGYCONVERSIONDEVICE", "IFCDISTRIBUTIONELEMENT",
  "IFCDISTRIBUTIONFLOWELEMENT", "IFCDISTRIBUTIONCONTROLELEMENT",
  "IFCPIPESEGMENT", "IFCPIPEFITTING", "IFCDUCTSEGMENT", "IFCDUCTFITTING",
  "IFCSANITARYTERMINAL", "IFCLIGHTFIXTURE", "IFCOUTLET", "IFCSWITCHINGDEVICE",
  "IFCCABLECARRIERSEGMENT", "IFCCABLESEGMENT", "IFCELECTRICAPPLIANCE",
  "IFCAIRTERMINAL", "IFCVALVE", "IFCPUMP", "IFCSPACEHEATER",
];

function resolveFallbackTypes() {
  const out = [];
  for (const name of FALLBACK_ELEMENT_TYPE_NAMES) {
    const t = WebIFC[name];
    if (typeof t === "number") out.push(t);
  }
  return out;
}

// If the upload is an .ifczip / .zip, unzip to the inner .ifc bytes.
async function toIfcBytes(file) {
  const name = String(file?.name || "").toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".ifczip") || name.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buf);
    const entry = Object.values(zip.files).find((f) =>
      f.name.toLowerCase().endsWith(".ifc"),
    );
    if (!entry) throw new Error("No .ifc file was found inside the archive.");
    return entry.async("uint8array");
  }
  return new Uint8Array(buf);
}

// Collect (expressID, Tag) for one web-ifc type query into the maps.
function collectType(api, modelID, type, includeInherited, byElementId) {
  let vector;
  try {
    vector = api.GetLineIDsWithType(modelID, type, includeInherited);
  } catch {
    return 0;
  }
  const size = vector.size();
  let scanned = 0;
  for (let i = 0; i < size; i += 1) {
    const expressID = vector.get(i);
    scanned += 1;
    let line;
    try {
      line = api.GetLine(modelID, expressID);
    } catch {
      continue;
    }
    const rawTag = line?.Tag?.value;
    if (rawTag == null) continue;
    const id = Number(String(rawTag).trim());
    if (Number.isFinite(id) && id > 0 && !byElementId.has(id)) {
      byElementId.set(id, expressID);
    }
  }
  return scanned;
}

/**
 * Parse an IFC file and extract the Revit Element IDs (the IFC `Tag` of every
 * building element).
 *
 * @param {File} file the uploaded .ifc / .ifczip file
 * @returns {Promise<{ ids:number[], byElementId:Map<number,number>, count:number }>}
 *   - ids:         unique positive Element IDs found in the model
 *   - byElementId: Element ID → IFC expressID (used by the 3D viewer to highlight)
 *   - count:       number of element instances scanned
 */
export async function extractIfcElements(file) {
  const bytes = await toIfcBytes(file);
  const api = await getIfcApi();
  const modelID = api.OpenModel(bytes);
  const byElementId = new Map();
  let count = 0;
  try {
    // Primary: one inheritance-aware query over IfcElement captures every
    // physical element subtype (walls, beams, columns, slabs, rebar, MEP …).
    if (typeof WebIFC.IFCELEMENT === "number") {
      count += collectType(api, modelID, WebIFC.IFCELEMENT, true, byElementId);
    }
    // Fallback: if the supertype query was unavailable or found nothing,
    // sweep the curated concrete-type list.
    if (count === 0) {
      for (const type of resolveFallbackTypes()) {
        count += collectType(api, modelID, type, false, byElementId);
      }
    }
  } finally {
    try {
      api.CloseModel(modelID);
    } catch {
      /* ignore */
    }
  }
  return { ids: [...byElementId.keys()], byElementId, count };
}

/**
 * Convenience for the upload gate. Parses the IFC and returns only the Element
 * IDs that belong to this project (keeps the POST payload bounded by the
 * project size, not the 100k+ elements an IFC can hold). The server then does
 * the authoritative per-discipline subset check.
 *
 * @param {File} file
 * @param {Iterable<number>|Set<number>} projectElementIds union of all items' elementIds
 * @returns {Promise<{ presentElementIds:number[], ifcElementCount:number, totalIfcIds:number }>}
 */
export async function extractPresentElementIds(file, projectElementIds) {
  const { ids, count } = await extractIfcElements(file);
  const projectSet =
    projectElementIds instanceof Set
      ? projectElementIds
      : new Set(
          [...(projectElementIds || [])]
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0),
        );
  // No project element universe → nothing to match; let the server report
  // "no-quantities" rather than shipping the whole IFC's ID list.
  const presentElementIds = projectSet.size
    ? ids.filter((id) => projectSet.has(id))
    : [];
  return { presentElementIds, ifcElementCount: count, totalIfcIds: ids.length };
}
