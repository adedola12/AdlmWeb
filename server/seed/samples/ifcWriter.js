// Minimal IFC4 (STEP) writer for the sample duplex models.
//
// Writes only what the web viewer and a desktop IFC viewer need: a spatial
// tree (project > site > building > storeys), swept-solid bodies, surface
// colours, and each element's Tag set to its element ID. The Tag is how the
// web viewer ties a clicked mesh back to the bill lines that measured it
// (client/src/lib/ifcViewer.js reads line.Tag), exactly as for a Revit export.
//
// Strings are kept to plain ASCII: STEP needs anything else escaped.

import crypto from "crypto";

const IFC_B64 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// Deterministic 22-character IFC GlobalId from a seed string, so re-running
// the seed produces byte-identical files.
export function ifcGuid(seed) {
  const bytes = crypto.createHash("md5").update(String(seed)).digest();
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  // 128 bits: the first character carries 2 bits, the rest 6 each.
  for (let i = 0; i < 22; i += 1) {
    const shift = BigInt((21 - i) * 6);
    out += IFC_B64[Number((n >> shift) & (i === 0 ? 3n : 63n))];
  }
  return out;
}

function real(n) {
  const v = Math.round(Number(n) * 1e6) / 1e6;
  if (!Number.isFinite(v)) return "0.";
  const s = String(v);
  if (s.includes("e")) return v.toFixed(6);
  return s.includes(".") ? s : `${s}.`;
}

function str(s) {
  if (s == null) return "$";
  const ascii = String(s)
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/'/g, "''");
  return `'${ascii}'`;
}

const STYLES = {
  concrete: [0.72, 0.72, 0.7, 0],
  pile: [0.55, 0.55, 0.53, 0],
  blockSub: [0.62, 0.58, 0.5, 0],
  blockExt: [0.93, 0.89, 0.8, 0],
  blockInt: [0.96, 0.95, 0.91, 0],
  steelDoor: [0.2, 0.22, 0.26, 0],
  timberDoor: [0.55, 0.36, 0.2, 0],
  glass: [0.55, 0.75, 0.9, 0.45],
  tile: [0.86, 0.84, 0.8, 0],
  ceiling: [0.99, 0.99, 0.99, 0],
  roof: [0.62, 0.16, 0.12, 0],
};

export function writeIfc({
  projectName,
  buildingName,
  siteName,
  elements,
  discipline,
  seed,
  storeyHeight = 3.3,
}) {
  const lines = [];
  let n = 0;
  const e = (body) => {
    n += 1;
    lines.push(`#${n}=${body};`);
    return `#${n}`;
  };
  const g = (k) => str(ifcGuid(`${seed}:${k}`));

  const origin = e("IFCCARTESIANPOINT((0.,0.,0.))");
  const dirZ = e("IFCDIRECTION((0.,0.,1.))");
  const dirX = e("IFCDIRECTION((1.,0.,0.))");
  const world = e(`IFCAXIS2PLACEMENT3D(${origin},${dirZ},${dirX})`);
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = e(
    `IFCUNITASSIGNMENT((${[
      e("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"),
      e("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
      e("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"),
      e("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"),
    ].join(",")}))`,
  );
  const project = e(`IFCPROJECT(${g("project")},$,${str(projectName)},$,$,$,$,(${ctx}),${units})`);

  const place = (x = 0, y = 0, z = 0, rel = "$") => {
    const pt = e(`IFCCARTESIANPOINT((${real(x)},${real(y)},${real(z)}))`);
    return e(`IFCLOCALPLACEMENT(${rel},${e(`IFCAXIS2PLACEMENT3D(${pt},${dirZ},${dirX})`)})`);
  };
  const sitePl = place();
  const site = e(`IFCSITE(${g("site")},$,${str(siteName)},$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = place(0, 0, 0, sitePl);
  const building = e(
    `IFCBUILDING(${g("building")},$,${str(buildingName)},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`,
  );
  e(`IFCRELAGGREGATES(${g("agg-project")},$,$,$,${project},(${site}))`);
  e(`IFCRELAGGREGATES(${g("agg-site")},$,$,$,${site},(${building}))`);

  // Storeys in elevation order; elements are placed in world coordinates, so
  // their placements are absolute (no PlacementRelTo) and the storey only
  // carries the elevation for the spatial tree.
  const storeyDefs = [
    ["Foundation", -1.5],
    ["Ground Floor", 0],
    ["First Floor", storeyHeight],
    ["Roof", 2 * storeyHeight],
  ];
  const storeys = new Map();
  for (const [name, elev] of storeyDefs) {
    const pl = place(0, 0, elev, bldPl);
    storeys.set(
      name,
      e(`IFCBUILDINGSTOREY(${g(`storey:${name}`)},$,${str(name)},$,$,${pl},$,$,.ELEMENT.,${real(elev)})`),
    );
  }
  e(`IFCRELAGGREGATES(${g("agg-building")},$,$,$,${building},(${[...storeys.values()].join(",")}))`);

  const surfaceStyles = {};
  const styleFor = (key) => {
    if (surfaceStyles[key]) return surfaceStyles[key];
    const [r, gg, b, t] = STYLES[key] || STYLES.concrete;
    const colour = e(`IFCCOLOURRGB($,${real(r)},${real(gg)},${real(b)})`);
    const rendering = e(
      `IFCSURFACESTYLERENDERING(${colour},${real(t)},$,$,$,$,$,$,.NOTDEFINED.)`,
    );
    surfaceStyles[key] = e(`IFCSURFACESTYLE(${str(key)},.BOTH.,(${rendering}))`);
    return surfaceStyles[key];
  };

  const pt2 = (x, y) => e(`IFCCARTESIANPOINT((${real(x)},${real(y)}))`);
  const pt3 = (x, y, z) => e(`IFCCARTESIANPOINT((${real(x)},${real(y)},${real(z)}))`);
  const dir3 = (x, y, z) => e(`IFCDIRECTION((${real(x)},${real(y)},${real(z)}))`);

  function solid(shape) {
    if (shape.kind === "box") {
      const pos2 = e(`IFCAXIS2PLACEMENT2D(${pt2(shape.x + shape.dx / 2, shape.y + shape.dy / 2)},$)`);
      const prof = e(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos2},${real(shape.dx)},${real(shape.dy)})`);
      const pos = e(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, shape.z)},${dirZ},${dirX})`);
      return e(`IFCEXTRUDEDAREASOLID(${prof},${pos},${dirZ},${real(shape.dz)})`);
    }
    if (shape.kind === "cyl") {
      const pos2 = e(`IFCAXIS2PLACEMENT2D(${pt2(shape.cx, shape.cy)},$)`);
      const prof = e(`IFCCIRCLEPROFILEDEF(.AREA.,$,${pos2},${real(shape.r)})`);
      const pos = e(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, shape.z)},${dirZ},${dirX})`);
      return e(`IFCEXTRUDEDAREASOLID(${prof},${pos},${dirZ},${real(shape.h)})`);
    }
    // Prism. "yz": profile (y,z) swept along +X from `from`.
    //        "xz": profile (x,z) swept along -Y from `to` down to `from`.
    const pts = shape.points.map(([a, b]) => pt2(a, b));
    const poly = e(`IFCPOLYLINE((${[...pts, pts[0]].join(",")}))`);
    const prof = e(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`);
    const depth = Math.abs(shape.to - shape.from);
    const pos =
      shape.plane === "yz"
        ? e(`IFCAXIS2PLACEMENT3D(${pt3(shape.from, 0, 0)},${dir3(1, 0, 0)},${dir3(0, 1, 0)})`)
        : e(`IFCAXIS2PLACEMENT3D(${pt3(0, shape.to, 0)},${dir3(0, -1, 0)},${dir3(1, 0, 0)})`);
    return e(`IFCEXTRUDEDAREASOLID(${prof},${pos},${dirZ},${real(depth)})`);
  }

  const byStorey = new Map();
  for (const el of elements) {
    if (discipline && el.discipline !== discipline) continue;
    const items = el.shapes.map(solid);
    const style = styleFor(el.style);
    for (const it of items) e(`IFCSTYLEDITEM(${it},(${style}),$)`);
    const rep = e(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(",")}))`);
    const shape = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
    const pl = place();
    const head = `${g(`el:${el.id}`)},$,${str(el.name)},$,${str(el.typeName)},${pl},${shape},${str(String(el.id))}`;
    let ref;
    switch (el.ifc) {
      case "IfcPile":
        ref = e(`IFCPILE(${head},.${el.predefined}.,$)`);
        break;
      case "IfcDoor":
        ref = e(`IFCDOOR(${head},${real(el.overall.h)},${real(el.overall.w)},.DOOR.,.SINGLE_SWING_LEFT.,$)`);
        break;
      case "IfcWindow":
        ref = e(`IFCWINDOW(${head},${real(el.overall.h)},${real(el.overall.w)},.WINDOW.,.DOUBLE_PANEL_VERTICAL.,$)`);
        break;
      case "IfcWall":
        ref = e(`IFCWALL(${head},.SOLIDWALL.)`);
        break;
      default:
        ref = e(`${el.ifc.toUpperCase()}(${head},${el.predefined ? `.${el.predefined}.` : "$"})`);
    }
    if (!byStorey.has(el.level)) byStorey.set(el.level, []);
    byStorey.get(el.level).push(ref);
  }
  for (const [level, refs] of byStorey) {
    e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${g(`contain:${level}`)},$,$,$,(${refs.join(",")}),${storeys.get(level)})`);
  }

  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${seed}.ifc`)},'2026-09-18T00:00:00',('ADLM Studio'),('ADLM Studio'),'ADLM Sample Generator','ADLM Sample Generator','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  return [...header, ...lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}
