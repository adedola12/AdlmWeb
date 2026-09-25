// Dev check for the sample projects' IFC models: parses every generated file
// with web-ifc (the engine the web 3D viewer uses) and confirms that every
// element has geometry and every element ID a bill line cites is in its
// discipline's model with a matching Tag.
//
// Needs the client's web-ifc install:
//   node scripts/validate-sample-ifc.mjs
//   WEB_IFC=<path to web-ifc-api-node.js> node scripts/validate-sample-ifc.mjs

import { createRequire } from "module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGNS } from "../seed/samples/duplexModel.js";
import { assembleSampleProject, duplexScheme } from "../seed/samples/sampleProject.js";
import { mepScheme } from "../seed/samples/mepSample.js";
import { ROAD_DESIGNS, roadScheme } from "../seed/samples/roadSample.js";
import { writeIfc } from "../seed/samples/ifcWriter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WebIFC = require(
  process.env.WEB_IFC ||
    path.resolve(__dirname, "..", "..", "client", "node_modules", "web-ifc", "web-ifc-api-node.js"),
);
const api = new WebIFC.IfcAPI();
await api.Init();

let bad = 0;
// Every model-based sample: QUIV (duplex), Revit MEP (services), CIVIQ (roads).
const cases = [
  ...DESIGNS.map((d) => ({ d, scheme: duplexScheme(d, "revit"), productKey: "revit" })),
  ...DESIGNS.map((d) => ({ d, scheme: mepScheme(d), productKey: "mep" })),
  ...ROAD_DESIGNS.map((d) => ({ d, scheme: roadScheme(d), productKey: "civil3d" })),
];
for (const { d, scheme, productKey } of cases) {
  const { project } = assembleSampleProject(scheme, productKey);
  const model = scheme.model;
  for (const disc of scheme.modelDisciplines) {
    const txt = writeIfc({
      projectName: project.name,
      buildingName: scheme.design.title,
      siteName: d.location,
      elements: model.elements,
      discipline: disc,
      seed: `${d.key}-${disc}`,
      storeyHeight: d.storeyHeight,
      storeyLevels: scheme.storeyLevels,
    });    const id = api.OpenModel(new Uint8Array(Buffer.from(txt)));
    const tagsWithMesh = new Set();
    api.StreamAllMeshes(id, (m) => {
      const tag = Number(api.GetLine(id, m.expressID)?.Tag?.value);
      for (let i = 0; i < m.geometries.size(); i += 1) {
        const g = api.GetGeometry(id, m.geometries.get(i).geometryExpressID);
        if (g.GetVertexDataSize() > 0 && tag) tagsWithMesh.add(tag);
      }
    });
    api.CloseModel(id);

    const need = new Set(
      project.items.filter((i) => i.discipline === disc).flatMap((i) => i.elementIds),
    );
    const missing = [...need].filter((x) => !tagsWithMesh.has(x));
    const noGeom = model.elements.filter((e) => e.discipline === disc && !tagsWithMesh.has(e.id));
    const ok = !missing.length && !noGeom.length;
    if (!ok) bad += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${productKey.padEnd(8)} ${d.key.padEnd(17)} ${disc.padEnd(13)} ${(txt.length / 1024).toFixed(0)}KB`,
      `elements ${tagsWithMesh.size}, cited ${need.size}, missing ${missing.length}, without geometry ${noGeom.length}`,
    );
  }
}
process.exit(bad ? 1 : 0);
