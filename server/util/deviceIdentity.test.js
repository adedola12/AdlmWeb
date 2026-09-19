// server/util/deviceIdentity.test.js
// Which id recipe a request carries, and who wrote a device row. Everything
// the seat rules in deviceBinding.js decide rests on these, so they are pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_PROVENANCE_FIELDS,
  HUB_SCHEME,
  clientLabel,
  clientScheme,
  defaultAppScheme,
  entitlementsWithoutDeviceProvenance,
  holderAppLabel,
  hubSharesAppIdentity,
  isSchemeAwareBindingEnabled,
  rowOrigin,
  rowScheme,
} from "./deviceIdentity.js";

test("the kill switch is on unless set to exactly 0", () => {
  assert.equal(isSchemeAwareBindingEnabled({}), true);
  assert.equal(isSchemeAwareBindingEnabled({ DEVICE_SCHEME_AWARE_BINDING: "" }), true);
  assert.equal(isSchemeAwareBindingEnabled({ DEVICE_SCHEME_AWARE_BINDING: "1" }), true);
  assert.equal(isSchemeAwareBindingEnabled({ DEVICE_SCHEME_AWARE_BINDING: "false" }), true);
  assert.equal(isSchemeAwareBindingEnabled({ DEVICE_SCHEME_AWARE_BINDING: "0" }), false);
  assert.equal(isSchemeAwareBindingEnabled({ DEVICE_SCHEME_AWARE_BINDING: " 0 " }), false);
});

test("clientScheme is per request: the two QUIV lineages differ on the same product", () => {
  // Shipped QUIV: no client header of its own, MachineGuid recipe.
  assert.equal(
    clientScheme({ productKey: "revit", fpVersion: 2, userAgent: "ADLM-RevitPlugin/3.0.1 (+https://www.adlmstudio.net)" }),
    "mgu2",
  );
  // RevitPluginArch2026: announces itself and uses the Hub's hw2 recipe.
  assert.equal(
    clientScheme({ productKey: "revit", fpVersion: 2, clientHeader: "revit-arch-plugin" }),
    HUB_SCHEME,
  );
  assert.equal(
    clientScheme({ productKey: "REVIT", fpVersion: "2", clientHeader: " Revit-Arch-Plugin " }),
    HUB_SCHEME,
  );
});

test("clientScheme: v1 wins, ArchiCAD is v1, everything else is the Hub's hw2", () => {
  assert.equal(clientScheme({ productKey: "revit", fpVersion: 1 }), "v1");
  assert.equal(clientScheme({ productKey: "revit" }), "v1");
  assert.equal(clientScheme({ productKey: "mep", fpVersion: 1 }), "v1");
  assert.equal(clientScheme({ productKey: "archicad", fpVersion: 2 }), "v1");
  for (const key of ["mep", "planswift", "rategen", "timepro", "civil3d", "qsapp", ""]) {
    assert.equal(clientScheme({ productKey: key, fpVersion: 2 }), HUB_SCHEME, key);
  }
});

test("only revit and archicad have an app id the Hub never presents", () => {
  assert.equal(hubSharesAppIdentity("revit"), false);
  assert.equal(hubSharesAppIdentity(" Revit "), false);
  assert.equal(hubSharesAppIdentity("archicad"), false);
  for (const key of ["mep", "planswift", "rategen", "boq-import", ""]) {
    assert.equal(hubSharesAppIdentity(key), true, key);
  }
  assert.equal(defaultAppScheme("revit"), "mgu2");
  assert.equal(defaultAppScheme("archicad"), "v1");
  assert.equal(defaultAppScheme("mep"), HUB_SCHEME);
});

test("rowOrigin: explicit source wins; else only a NAMED v2 row is the Hub's", () => {
  assert.equal(rowOrigin({ source: "app", name: "PC-1", fpVersion: 2 }), "app");
  assert.equal(rowOrigin({ source: "installer-hub", name: "", fpVersion: 1 }), "installer-hub");
  assert.equal(rowOrigin({ name: "PC-1", fpVersion: 2 }), "installer-hub");
  assert.equal(rowOrigin({ name: "  ", fpVersion: 2 }), "app");
  assert.equal(rowOrigin({ name: "", fpVersion: 2 }), "app");
  // A named v1 row may be a live old QUIV: never the Hub's.
  assert.equal(rowOrigin({ name: "PC-1", fpVersion: 1 }), "app");
  assert.equal(rowOrigin({ name: "PC-1" }), "app");
  assert.equal(rowOrigin(null), "app");
});

test("rowScheme: explicit scheme wins, v1 stays v1, Hub rows are hw2, app rows follow the product", () => {
  assert.equal(rowScheme({ scheme: "mgu2", name: "PC", fpVersion: 2 }, "revit"), "mgu2");
  assert.equal(rowScheme({ name: "PC", fpVersion: 1 }, "revit"), "v1");
  assert.equal(rowScheme({ name: "PC", fpVersion: 2 }, "revit"), HUB_SCHEME);
  assert.equal(rowScheme({ name: "", fpVersion: 2 }, "revit"), "mgu2");
  assert.equal(rowScheme({ name: "", fpVersion: 2 }, "mep"), HUB_SCHEME);
  assert.equal(rowScheme({ name: "", fpVersion: 2 }, "archicad"), "v1");
});

test("clientLabel prefers the header, then the User-Agent product token", () => {
  assert.equal(clientLabel({ clientHeader: "Revit-Arch-Plugin" }), "revit-arch-plugin");
  assert.equal(
    clientLabel({ userAgent: "ADLM-RevitPlugin/3.0.1 (+https://www.adlmstudio.net)" }),
    "ADLM-RevitPlugin/3.0.1",
  );
  assert.equal(clientLabel({}), "");
});

test("holderAppLabel names the Hub only for a Hub row no app has signed in on", () => {
  assert.equal(holderAppLabel({ name: "PC", fpVersion: 2 }, "revit"), "ADLM Installer Hub");
  assert.equal(holderAppLabel({ name: "PC", fpVersion: 2, appSeenAt: new Date() }, "revit"), "QUIV app");
  assert.equal(holderAppLabel({ source: "app" }, "mep"), "ADLM MEP & HVAC app");
  assert.equal(holderAppLabel({ source: "app" }, "unknown-product"), "ADLM app");
});

test("entitlementsWithoutDeviceProvenance: lean rows lose exactly the provenance fields", () => {
  const at = new Date("2026-09-19T10:00:00Z");
  const base = { fingerprint: "a2".repeat(32), name: "", boundAt: at, lastSeenAt: at, revokedAt: null, fpVersion: 2 };
  const stamped = {
    ...base,
    source: "app",
    scheme: "mgu2",
    client: "ADLM-RevitPlugin/3.0.1",
    installerFingerprint: "a1".repeat(32),
    installerName: "PC-A",
    adoptedAt: at,
    appSeenAt: at,
  };
  assert.deepEqual([...DEVICE_PROVENANCE_FIELDS].sort(), Object.keys(stamped).filter((k) => !(k in base)).sort());

  const ents = [
    { productKey: "revit", status: "active", devices: [stamped, base], deviceFingerprint: "a2".repeat(32) },
    { productKey: "mep", status: "active" }, // no devices array: passed through
  ];
  const before = JSON.stringify(ents);
  const out = entitlementsWithoutDeviceProvenance(ents);

  assert.equal(JSON.stringify(ents), before, "the input is not mutated");
  assert.equal(JSON.stringify(out[0].devices[0]), JSON.stringify(base), "same keys, same order");
  assert.equal(JSON.stringify(out[0].devices[1]), JSON.stringify(base));
  assert.deepEqual(Object.keys(out[0]), Object.keys(ents[0]), "entitlement key order kept");
  assert.equal(out[0].deviceFingerprint, "a2".repeat(32));
  assert.deepEqual(out[1], ents[1]);

  // Same fallback as the `user.entitlements || []` it replaces.
  assert.deepEqual(entitlementsWithoutDeviceProvenance(undefined), []);
  assert.deepEqual(entitlementsWithoutDeviceProvenance(null), []);
  assert.deepEqual(entitlementsWithoutDeviceProvenance([]), []);
});
