import { expect, test } from "vitest";
import { canonicalUnit, conversionFactor, guessDimensions, unitKind } from "./unitConversion.js";

const close = (a, b, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

test("reads the spellings bills use", () => {
  expect(canonicalUnit("Sq.m")).toBe("m2");
  expect(canonicalUnit("Cu.m")).toBe("m3");
  expect(canonicalUnit("Lin.m")).toBe("m");
  expect(canonicalUnit("Nos.")).toBe("nr");
  expect(canonicalUnit("tonnes")).toBe("t");
  expect(canonicalUnit("sq ft")).toBe("ft2");
  expect(canonicalUnit("furlong")).toBe("");
  expect(unitKind("mm")).toBe("length");
});

test("within one kind, the factor is arithmetic", () => {
  close(conversionFactor("m", "mm").factor, 1000);
  close(conversionFactor("mm", "m").factor, 0.001);
  close(conversionFactor("ft", "m").factor, 0.3048);
  close(conversionFactor("m2", "ft2").factor, 1 / 0.09290304);
  close(conversionFactor("kg", "tonne").factor, 0.001);
  close(conversionFactor("litre", "m3").factor, 0.001);
  expect(conversionFactor("m3", "Cu.m").factor).toBe(1);
});

test("a 230mm wall: 1 m2 is 0.23 m3", () => {
  const c = conversionFactor("m2", "m3", { thickness: 0.23 });
  expect(c.ok).toBe(true);
  close(c.factor, 0.23);
  expect(c.note).toBe("at 230 mm thick");
  // and back
  close(conversionFactor("m3", "m2", { thickness: 0.23 }).factor, 1 / 0.23);
});

test("length to area and volume need the section", () => {
  close(conversionFactor("m", "m2", { width: 0.3 }).factor, 0.3);
  const lintel = conversionFactor("m", "m3", { width: 0.23, depth: 0.45 });
  close(lintel.factor, 0.23 * 0.45);
  expect(lintel.note).toBe("at 230 mm x 450 mm");
});

test("rebar: metres to kg and tonnes by weight per metre", () => {
  close(conversionFactor("m", "kg", { kgPerM: 0.888 }).factor, 0.888);
  close(conversionFactor("m", "t", { kgPerM: 0.888 }).factor, 0.000888);
  close(conversionFactor("kg", "m", { kgPerM: 0.888 }).factor, 1 / 0.888);
});

test("count needs the quantity per item", () => {
  // A door, 1.89 m2 each, priced from an m2 rate.
  close(conversionFactor("nr", "m2", { perItem: 1.89 }).factor, 1.89);
  // A line in m2 priced from a per-panel rate, 2.88 m2 per panel.
  close(conversionFactor("m2", "nr", { perItem: 2.88 }).factor, 1 / 2.88);
});

test("it asks for exactly the missing dimension", () => {
  const c = conversionFactor("m2", "m3");
  expect(c.ok).toBe(false);
  expect(c.code).toBe("UNIT_NEEDS_DIMENSION");
  expect(c.needs).toEqual(["thickness"]);
  expect(c.message).toMatch(/thickness/);
});

test("a figure typed in the wrong unit is refused, not used", () => {
  // 230 metres thick is "230mm" typed into a box in metres.
  expect(conversionFactor("m2", "m3", { thickness: 230 }).ok).toBe(false);
  expect(conversionFactor("m2", "m3", { thickness: -0.2 }).ok).toBe(false);
});

test("kinds with nothing between them are refused", () => {
  const c = conversionFactor("m3", "kg");
  expect(c.ok).toBe(false);
  expect(c.code).toBe("UNIT_NOT_CONVERTIBLE");
  expect(conversionFactor("m2", "furlong").code).toBe("UNIT_UNKNOWN");
});

test("dimensions are read off real descriptions", () => {
  expect(guessDimensions("Blockwork - Lintel Concrete [L:01 NATURAL GROUND LEVEL | T:Generic - 230mm]")).toEqual({ thickness: 0.23, width: 0.23 });
  expect(guessDimensions("Beam 230 x 450mm")).toEqual({ width: 0.23, depth: 0.45 });
  expect(guessDimensions("Y12 high yield bars").kgPerM).toBe(0.889);
  expect(guessDimensions("16mm dia mild steel").kgPerM).toBe(1.58);
  expect(guessDimensions("16mm dia mild steel").thickness).toBe(undefined);
  expect(guessDimensions("Excavate to reduce level")).toEqual({});
});

test("the client copy is the server's, line for line below the header", async () => {
  // The server re-works every factor; if the copies drifted, the panel would
  // show one figure and the bill would get another.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const body = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n").split("const low =")[1];
  const server = path.resolve(here, "../../../../server/util/unitConversion.js");
  expect(body(path.join(here, "unitConversion.js"))).toBe(body(server));
});
