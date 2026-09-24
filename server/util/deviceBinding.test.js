// server/util/deviceBinding.test.js
//
// Seat rules for desktop sign-in. The invariant under test: for each
// entitlement, the number of distinct PCs that can complete an APP sign-in
// stays <= seats, and a row written by the Installer Hub is never app use.
//
// Fixtures model one PC as two ids where the recipes differ:
//   hub*  hw2  = the Installer Hub's (and MEP's / R26's) SHA256(CPU|BIOS|Board)
//   quiv* mgu2 = the shipped QUIV plugin's SHA256("v2|"+MachineGuid+"|"+User)
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  adoptionEvidenceNeeded,
  enforceDeviceBinding,
  installerRowCandidates,
  rejectionMessage,
} from "./deviceBinding.js";

// ── Oracle: the pre-change implementation, verbatim from routes/auth.js at
// 23a378f (renamed only). The kill-switch-off path must match it exactly. ──
function legacyNormalizeLegacyEnt(entitlement) {
  if (!entitlement) return;

  if (!entitlement.seats || entitlement.seats < 1) entitlement.seats = 1;
  if (!Array.isArray(entitlement.devices)) entitlement.devices = [];

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const licenseType = String(entitlement.licenseType || "").toLowerCase();
  if (licenseType !== "organization" && seats > 1) {
    entitlement.licenseType = "organization";
  }
  if (!entitlement.licenseType) {
    entitlement.licenseType = seats > 1 ? "organization" : "personal";
  }

  if (entitlement.devices.length === 0 && entitlement.deviceFingerprint) {
    entitlement.devices.push({
      fingerprint: entitlement.deviceFingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }
}

function legacyActiveDevices(entitlement) {
  return (entitlement?.devices || []).filter((device) => !device.revokedAt);
}

function legacyEnforceDeviceBinding(entitlement, incomingFingerprint, fpVersion = 1) {
  const fingerprint = String(incomingFingerprint || "").trim();
  if (!fingerprint) {
    return {
      ok: false,
      status: 400,
      code: "DFP_REQUIRED",
      error: "device_fingerprint required",
    };
  }

  legacyNormalizeLegacyEnt(entitlement);

  const seats = Math.max(Number(entitlement.seats || 1), 1);
  const isOrg =
    String(entitlement.licenseType || "").toLowerCase() === "organization" ||
    seats > 1;

  // Helper: try to migrate an existing v1 device to the new v2 fingerprint.
  // Only runs when there is exactly one active v1 device (prevents
  // accidental swaps on org licenses).
  function tryMigrate(v2Fp) {
    if (fpVersion < 2) return false;

    const active = legacyActiveDevices(entitlement);
    const legacy = active.filter((d) => (d.fpVersion || 1) < 2);
    if (legacy.length !== 1) return false;

    const target = legacy[0];
    target.fingerprint = v2Fp;
    target.fpVersion = 2;
    target.lastSeenAt = new Date();
    // Update legacy top-level mirror so older code paths stay consistent
    entitlement.deviceFingerprint = v2Fp;
    return true;
  }

  if (isOrg) {
    const devices = legacyActiveDevices(entitlement);
    const existing = devices.find((device) => device.fingerprint === fingerprint);

    if (existing) {
      existing.lastSeenAt = new Date();
      if (fpVersion >= 2 && (existing.fpVersion || 1) < 2) existing.fpVersion = 2;
      return { ok: true, changed: true };
    }

    if (devices.length < seats) {
      entitlement.devices.push({
        fingerprint,
        name: "",
        boundAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
        fpVersion: Math.max(1, Number(fpVersion) || 1),
      });

      if (!entitlement.deviceFingerprint) entitlement.deviceFingerprint = fingerprint;
      if (!entitlement.deviceBoundAt) entitlement.deviceBoundAt = new Date();

      return { ok: true, changed: true };
    }

    // At seat limit — last chance: migrate a lone legacy device in-place.
    if (tryMigrate(fingerprint)) {
      return { ok: true, changed: true, migrated: true };
    }

    return {
      ok: false,
      status: 403,
      code: "DEVICE_LIMIT_REACHED",
      error: "Device limit reached for this subscription.",
    };
  }

  // Personal (single-seat) license
  if (entitlement.deviceFingerprint && entitlement.deviceFingerprint !== fingerprint) {
    // Attempt seamless migration for the v1 → v2 transition.
    if (tryMigrate(fingerprint)) {
      return { ok: true, changed: true, migrated: true };
    }
    return {
      ok: false,
      status: 403,
      code: "DEVICE_MISMATCH",
      error: "This subscription is already bound to another device.",
    };
  }

  if (!entitlement.deviceFingerprint) {
    entitlement.deviceFingerprint = fingerprint;
    entitlement.deviceBoundAt = new Date();
  }

  const devices = legacyActiveDevices(entitlement);
  if (!devices.some((device) => device.fingerprint === fingerprint)) {
    entitlement.devices.push({
      fingerprint,
      name: "",
      boundAt: entitlement.deviceBoundAt || new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
      fpVersion: Math.max(1, Number(fpVersion) || 1),
    });
  } else {
    const device = devices.find((item) => item.fingerprint === fingerprint);
    if (device) {
      device.lastSeenAt = new Date();
      if (fpVersion >= 2 && (device.fpVersion || 1) < 2) device.fpVersion = 2;
    }
  }

  return { ok: true, changed: true };
}

const day = (n) => new Date(Date.UTC(2026, 8, n, 9, 0, 0));
const FP = {
  hubA: "a1".repeat(32), // PC-A as the Hub (and R26/MEP) sees it
  hubB: "b1".repeat(32),
  hubC: "c1".repeat(32),
  quivA: "a2".repeat(32), // PC-A as shipped QUIV sees it
  quivB: "b2".repeat(32),
  quivC: "c2".repeat(32),
  quivD: "d2".repeat(32),
  quivE: "e2".repeat(32),
  v1A: "a0".repeat(32),
  v1B: "b0".repeat(32),
};
const ALL_FPS = Object.values(FP);

// A row exactly as bind-device wrote it before this change: named, v2.
const legacyHubRow = (fingerprint, name, seen = 10) => ({
  fingerprint,
  name,
  boundAt: day(1),
  lastSeenAt: day(seen),
  revokedAt: null,
  fpVersion: 2,
});
// A row exactly as an app sign-in wrote it before this change: unnamed.
const legacyAppRow = (fingerprint, fpVersion = 2, seen = 10) => ({
  fingerprint,
  name: "",
  boundAt: day(1),
  lastSeenAt: day(seen),
  revokedAt: null,
  fpVersion,
});

const orgEnt = (seats, devices, productKey = "revit") => ({
  productKey,
  status: "active",
  seats,
  licenseType: "organization",
  organizationName: "Firm Ltd",
  devices,
  deviceFingerprint: devices[0]?.fingerprint,
  deviceBoundAt: day(1),
});
const personalEnt = (devices, mirror = devices[0]?.fingerprint, productKey = "revit") => ({
  productKey,
  status: "active",
  seats: 1,
  licenseType: "personal",
  devices,
  deviceFingerprint: mirror,
  deviceBoundAt: day(1),
});

const active = (ent) => ent.devices.filter((d) => !d.revokedAt);
const snapshot = (x) => JSON.parse(JSON.stringify(x));

// The route's calling convention: the evidence lookup found no app use for
// any candidate (override `clearedInstallerRows` to model evidence).
function signIn(ent, fingerprint, { productKey = ent.productKey, clientHeader = "", fpVersion = 2, ...rest } = {}) {
  const scheme =
    rest.scheme ||
    (fpVersion < 2
      ? "v1"
      : productKey === "revit"
        ? clientHeader === "revit-arch-plugin"
          ? "hw2"
          : "mgu2"
        : productKey === "archicad"
          ? "v1"
          : "hw2");
  const cleared =
    "clearedInstallerRows" in rest
      ? rest.clearedInstallerRows
      : adoptionEvidenceNeeded(ent, { productKey, scheme, fingerprint });
  return enforceDeviceBinding(ent, fingerprint, fpVersion, {
    enabled: true,
    productKey,
    scheme,
    client: clientHeader || "ADLM-RevitPlugin/3.0.1",
    deviceName: rest.deviceName,
    clearedInstallerRows: cleared,
  });
}
const quiv = (ent, fp, extra) => signIn(ent, fp, { productKey: "revit", ...extra });
const r26 = (ent, fp, extra) => signIn(ent, fp, { productKey: "revit", clientHeader: "revit-arch-plugin", ...extra });

function assertNoFingerprint(value) {
  const text = JSON.stringify(value);
  for (const fp of ALL_FPS) {
    assert.ok(!text.includes(fp.slice(0, 10)), `leaked a fingerprint: ${text}`);
  }
}

// ── The bug: the Hub's row holds the QUIV seat ─────────────────────────────

test("org, 1 seat: the Hub's row gives way to QUIV on the same licence (adopt, still 1 seat)", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const r = quiv(ent, FP.quivA);

  assert.equal(r.ok, true);
  assert.equal(r.decision, "adopt");
  assert.equal(active(ent).length, 1, "seatsUsed stays 1");
  const row = ent.devices[0];
  assert.equal(row.fingerprint, FP.quivA);
  assert.equal(row.installerFingerprint, FP.hubA);
  assert.equal(row.installerName, "PC-A");
  assert.equal(row.name, "");
  assert.equal(row.source, "app");
  assert.equal(row.scheme, "mgu2");
  assert.equal(row.fpVersion, 2);
  assert.equal(row.client, "ADLM-RevitPlugin/3.0.1");
  assert.ok(row.adoptedAt instanceof Date && row.appSeenAt instanceof Date);
  assert.equal(ent.deviceFingerprint, FP.quivA, "mirror followed the adopted row");

  // Next sign-in is an ordinary match, not another adoption.
  assert.equal(quiv(ent, FP.quivA).decision, "match");
  assert.equal(active(ent).length, 1);
});

test("personal: the Hub's row gives way to QUIV (adopt, mirror moves, 1 seat)", () => {
  const ent = personalEnt([legacyHubRow(FP.hubA, "PC-A")]);
  const r = quiv(ent, FP.quivA);

  assert.equal(r.ok, true);
  assert.equal(r.decision, "adopt");
  assert.equal(active(ent).length, 1);
  assert.equal(ent.deviceFingerprint, FP.quivA);
  assert.equal(ent.devices[0].installerFingerprint, FP.hubA);
  assert.equal(quiv(ent, FP.quivA).decision, "match");
  assert.equal(active(ent).length, 1);
});

test("a v1 QUIV (no MachineGuid) and ArchiCAD may adopt too; their scheme is not the Hub's", () => {
  const revitEnt = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const r = quiv(revitEnt, FP.v1A, { fpVersion: 1 });
  assert.equal(r.decision, "adopt");
  assert.equal(revitEnt.devices[0].scheme, "v1");
  assert.equal(revitEnt.devices[0].fpVersion, 1);

  const archEnt = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")], "archicad");
  assert.equal(signIn(archEnt, FP.v1A, { fpVersion: 1 }).decision, "adopt");
});

// ── Anti-sharing: app rows are never taken over ────────────────────────────

test("org, 1 seat: QUIV on PC-A holds it, QUIV on PC-B is refused (DEVICE_LIMIT_REACHED)", () => {
  for (const holder of [legacyAppRow(FP.quivA), { ...legacyAppRow(FP.quivA), source: "app", scheme: "mgu2" }]) {
    const ent = orgEnt(1, [holder]);
    const before = snapshot(ent);
    const r = quiv(ent, FP.quivB);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(r.code, "DEVICE_LIMIT_REACHED");
    assert.equal(r.error, "Device limit reached for this subscription.");
    assert.equal(r.decision, "reject");
    assert.deepEqual(snapshot(ent), before, "a refusal changes nothing");
  }
});

test("personal: QUIV on PC-A holds it, QUIV on PC-B is refused (DEVICE_MISMATCH)", () => {
  const ent = personalEnt([legacyAppRow(FP.quivA)]);
  const before = snapshot(ent);
  const r = quiv(ent, FP.quivB);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.code, "DEVICE_MISMATCH");
  assert.equal(r.error, "This subscription is already bound to another device.");
  assert.deepEqual(snapshot(ent), before);
});

test("MEP (the Hub's id IS the app's id): a named hw2 row is never adopted by another PC", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")], "mep");
  const before = snapshot(ent);
  // Even a caller that wrongly clears the row cannot make MEP adopt.
  const r = signIn(ent, FP.hubB, { clearedInstallerRows: [FP.hubA] });
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
  assert.deepEqual(snapshot(ent), before);
  assert.deepEqual(installerRowCandidates(ent, { productKey: "mep", scheme: "hw2", fingerprint: FP.hubB }), []);

  // Personal MEP likewise.
  const pEnt = personalEnt([legacyHubRow(FP.hubA, "PC-A")], FP.hubA, "mep");
  assert.equal(signIn(pEnt, FP.hubB, { clearedInstallerRows: [FP.hubA] }).code, "DEVICE_MISMATCH");
});

// ── RevitPluginArch2026 (hw2 on "revit") must never be evicted ─────────────

test("R26 signs in on its (Hub-named) row: a match that stamps app use, so QUIV elsewhere cannot adopt it", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const r = r26(ent, FP.hubA);
  assert.equal(r.decision, "match");
  assert.ok(ent.devices[0].appSeenAt instanceof Date);
  assert.equal(ent.devices[0].scheme, "hw2");
  assert.equal(ent.devices[0].client, "revit-arch-plugin");

  const before = snapshot(ent);
  const q = quiv(ent, FP.quivB);
  assert.equal(q.code, "DEVICE_LIMIT_REACHED");
  assert.deepEqual(snapshot(ent), before, "the R26 user keeps the seat");
  assert.equal(q.holder[0].app, "QUIV app", "an app-used row is not described as the Hub's");
});

test("R26 row with app-use evidence (telemetry/heartbeat) is not cleared, so it is not adopted", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const before = snapshot(ent);
  // The route's evidence lookup found the id in R26 takeoff telemetry. (Only
  // once the R26 feat/takeoff-time-log build ships: the shipped R26 build
  // sends no telemetry or heartbeat, see util/deviceAppEvidence.js.)
  const r = quiv(ent, FP.quivB, { clearedInstallerRows: new Set() });
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
  assert.deepEqual(snapshot(ent), before);

  // Personal likewise.
  const pEnt = personalEnt([legacyHubRow(FP.hubA, "PC-A")]);
  assert.equal(quiv(pEnt, FP.quivB, { clearedInstallerRows: [] }).code, "DEVICE_MISMATCH");
});

test("fail closed: without an evidence check nothing is adopted", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const r = enforceDeviceBinding(ent, FP.quivA, 2, { enabled: true, productKey: "revit", scheme: "mgu2" });
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
  assert.equal(ent.devices[0].fingerprint, FP.hubA);
});

test("an hw2 caller (R26) never adopts: on another PC it is refused like any second machine", () => {
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  const before = snapshot(ent);
  const r = r26(ent, FP.hubB, { clearedInstallerRows: [FP.hubA] });
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
  assert.deepEqual(snapshot(ent), before);
});

test("adoption is one-way and one-time: no ping-pong between PCs", () => {
  // Residual case the evidence cannot see: a pre-change Hub-named row an R26
  // user has not signed in on since deploy. With the shipped R26 build (no
  // telemetry, no heartbeat) that is EVERY such row until its user signs in
  // again, whatever they did before. QUIV on PC-B may take it ONCE; the seat
  // count never exceeds 1 at any point.
  const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
  assert.equal(quiv(ent, FP.quivB).decision, "adopt");

  // R26 on PC-A (its old id is now only kept as installerFingerprint).
  assert.equal(r26(ent, FP.hubA).code, "DEVICE_LIMIT_REACHED");
  // Another QUIV cannot adopt the converted row.
  assert.equal(quiv(ent, FP.quivD).code, "DEVICE_LIMIT_REACHED");
  assert.equal(active(ent).length, 1);
  assert.equal(ent.devices[0].fingerprint, FP.quivB);
});

test("a row stamped source:app is never adopted, even named, v2 and hw2", () => {
  const ent = orgEnt(1, [{ ...legacyHubRow(FP.hubA, "PC-A"), source: "app", scheme: "hw2" }]);
  const r = quiv(ent, FP.quivB, { clearedInstallerRows: [FP.hubA] });
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
});

test("a v1 named row is never adopted (the lone-v1 migration may still apply)", () => {
  // Two named v1 rows: no migration (not lone), no adoption.
  const two = orgEnt(2, [
    { ...legacyAppRow(FP.v1A, 1), name: "PC-A" },
    { ...legacyAppRow(FP.v1B, 1), name: "PC-B" },
  ]);
  const before = snapshot(two);
  assert.equal(quiv(two, FP.quivC, { clearedInstallerRows: [FP.v1A, FP.v1B] }).code, "DEVICE_LIMIT_REACHED");
  assert.deepEqual(snapshot(two), before);

  // One named v1 row: the existing v1→v2 migration, not an adoption.
  const one = orgEnt(1, [{ ...legacyAppRow(FP.v1A, 1), name: "PC-A" }]);
  const r = quiv(one, FP.quivA, { clearedInstallerRows: [FP.v1A] });
  assert.equal(r.decision, "migrate");
  assert.equal(one.devices[0].installerFingerprint, undefined);
});

// ── Several seats ──────────────────────────────────────────────────────────

test("org, 2 seats, Hub rows A and B: QUIV C adopts one, QUIV D the other, QUIV E is refused", () => {
  const ent = orgEnt(2, [legacyHubRow(FP.hubA, "PC-A", 5), legacyHubRow(FP.hubB, "PC-B", 9)]);

  const c = quiv(ent, FP.quivC);
  assert.equal(c.decision, "adopt");
  assert.equal(c.adoptedFrom.name, "PC-A", "least recently seen goes first");
  const d = quiv(ent, FP.quivD);
  assert.equal(d.decision, "adopt");
  assert.equal(d.adoptedFrom.name, "PC-B");

  const e = quiv(ent, FP.quivE);
  assert.equal(e.code, "DEVICE_LIMIT_REACHED");
  assert.equal(active(ent).length, 2);
  assert.deepEqual(active(ent).map((x) => x.fingerprint).sort(), [FP.quivC, FP.quivD].sort());
  assert.equal(quiv(ent, FP.quivC).decision, "match");
  assert.equal(quiv(ent, FP.quivD).decision, "match");
});

test("a reported device name picks the matching Hub row", () => {
  const ent = orgEnt(2, [legacyHubRow(FP.hubA, "PC-A", 5), legacyHubRow(FP.hubB, "PC-B", 9)]);
  const r = quiv(ent, FP.quivB, { deviceName: "pc-b" });
  assert.equal(r.adoptedFrom.name, "PC-B");
});

test("org below the seat limit binds a new row (stamped) and leaves the Hub row alone", () => {
  const ent = orgEnt(2, [legacyHubRow(FP.hubA, "PC-A")]);
  const r = quiv(ent, FP.quivA);
  assert.equal(r.decision, "bind");
  assert.equal(ent.devices.length, 2);
  assert.equal(ent.devices[0].fingerprint, FP.hubA);
  assert.equal(ent.devices[1].source, "app");
  assert.equal(ent.devices[1].scheme, "mgu2");
  assert.ok(ent.devices[1].appSeenAt instanceof Date);
});

// ── v1 → v2 migration still works ──────────────────────────────────────────

test("the lone-v1 migration still runs (org and personal), after adoption had nothing to take", () => {
  const org = orgEnt(1, [legacyAppRow(FP.v1A, 1)]);
  const r = quiv(org, FP.quivA);
  assert.equal(r.ok, true);
  assert.equal(r.migrated, true);
  assert.equal(r.decision, "migrate");
  assert.equal(org.devices[0].fingerprint, FP.quivA);
  assert.equal(org.devices[0].fpVersion, 2);
  assert.equal(org.devices[0].source, "app", "a migrated row is the app's from now on");
  assert.equal(org.devices[0].scheme, "mgu2");
  assert.equal(org.deviceFingerprint, FP.quivA);

  const personal = personalEnt([legacyAppRow(FP.v1A, 1)]);
  assert.equal(r26(personal, FP.hubA).decision, "migrate");
  assert.equal(personal.deviceFingerprint, FP.hubA);
  assert.equal(personal.devices[0].scheme, "hw2");
});

test("a migrated NAMED v1 row cannot later be adopted as if it were the Hub's", () => {
  const ent = orgEnt(1, [{ ...legacyAppRow(FP.v1A, 1), name: "PC-A" }]);
  assert.equal(quiv(ent, FP.quivA).decision, "migrate");
  assert.equal(quiv(ent, FP.quivB, { clearedInstallerRows: [FP.quivA] }).code, "DEVICE_LIMIT_REACHED");
});

// ── Personal licence details ───────────────────────────────────────────────

test("personal: a machine freed from the account page (revoked, none active) lets the next one bind", () => {
  const ent = personalEnt([{ ...legacyAppRow(FP.quivA), revokedAt: day(12) }], FP.quivA);
  const r = quiv(ent, FP.quivB);
  assert.equal(r.ok, true);
  assert.equal(r.decision, "bind");
  assert.equal(ent.deviceFingerprint, FP.quivB);
  assert.equal(active(ent).length, 1);
  // …and the freed machine is now the one refused.
  assert.equal(quiv(ent, FP.quivA).code, "DEVICE_MISMATCH");
});

// The usual Installer Hub flow after freeing a machine: /me/devices/revoke
// sets revokedAt but leaves the mirror on the old id; the Hub on the new PC
// then calls bind-device, which adds the new PC's row and keeps the mirror.
const freedThenHubBound = (productKey, newRow) =>
  personalEnt(
    [{ ...legacyHubRow(FP.hubA, "OLD-PC"), revokedAt: day(12) }, { ...newRow, boundAt: day(13), lastSeenAt: day(13) }],
    FP.hubA,
    productKey,
  );
const hubStamped = (fingerprint, name) => ({
  ...legacyHubRow(fingerprint, name),
  source: "installer-hub",
  scheme: "hw2",
  client: "installer-hub",
});

test("personal MEP: freed the old PC, the Hub bound the new one, the app signs in on that row (match)", () => {
  // Pre-provenance and stamped Hub rows alike.
  for (const row of [legacyHubRow(FP.hubB, "NEW-PC"), hubStamped(FP.hubB, "NEW-PC")]) {
    const ent = freedThenHubBound("mep", row);
    const r = signIn(ent, FP.hubB);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.decision, "match");
    assert.equal(ent.deviceFingerprint, FP.hubB, "mirror moved to the live row");
    assert.equal(ent.devices.length, 2, "no row added");
    assert.equal(active(ent).length, 1, "still one seat");
    assert.ok(ent.devices[1].appSeenAt instanceof Date, "the match is app use");
    assert.equal(ent.devices[1].name, "NEW-PC");

    // Next time it is an ordinary match; the freed PC and any other PC are refused.
    assert.equal(signIn(ent, FP.hubB).decision, "match");
    const old = signIn(ent, FP.hubA);
    assert.equal(old.code, "DEVICE_MISMATCH");
    assert.equal(old.holder.length, 1);
    assert.equal(old.holder[0].name, "NEW-PC");
    assert.equal(signIn(ent, FP.hubC).code, "DEVICE_MISMATCH");
    assert.equal(active(ent).length, 1);
  }

  // Kill switch off: refused, exactly as before (not a regression).
  const off = freedThenHubBound("mep", legacyHubRow(FP.hubB, "NEW-PC"));
  const before = snapshot(off);
  const r = enforceDeviceBinding(off, FP.hubB, 2, { enabled: false, productKey: "mep" });
  assert.deepEqual(
    { ...r },
    { ok: false, status: 403, code: "DEVICE_MISMATCH", error: "This subscription is already bound to another device.", decision: "reject" },
  );
  assert.deepEqual(snapshot(off), before);
});

test("personal QUIV after the same flow: R26 (hw2) matches the Hub row, shipped QUIV (mgu2) adopts it", () => {
  const r26Ent = freedThenHubBound("revit", hubStamped(FP.hubB, "NEW-PC"));
  const a = r26(r26Ent, FP.hubB);
  assert.equal(a.decision, "match");
  assert.equal(r26Ent.deviceFingerprint, FP.hubB);
  assert.equal(active(r26Ent).length, 1);

  const quivEnt = freedThenHubBound("revit", hubStamped(FP.hubB, "NEW-PC"));
  const q = quiv(quivEnt, FP.quivB);
  assert.equal(q.decision, "adopt");
  assert.equal(quivEnt.deviceFingerprint, FP.quivB);
  assert.equal(active(quivEnt).length, 1);
  assert.equal(active(quivEnt)[0].installerFingerprint, FP.hubB);
});

test("personal with a stale mirror and TWO active rows (legacy state) is left to the old path", () => {
  const ent = personalEnt(
    [{ ...legacyHubRow(FP.hubA, "OLD-PC"), revokedAt: day(12) }, legacyHubRow(FP.hubB, "PC-B"), legacyHubRow(FP.hubC, "PC-C")],
    FP.hubA,
    "mep",
  );
  const before = snapshot(ent);
  assert.equal(signIn(ent, FP.hubB).code, "DEVICE_MISMATCH");
  assert.deepEqual(snapshot(ent), before);
});

test("personal: only the BOUND row can be adopted, not some other Hub row", () => {
  const ent = personalEnt([legacyAppRow(FP.quivA), legacyHubRow(FP.hubB, "PC-B")], FP.quivA);
  const r = quiv(ent, FP.quivC, { clearedInstallerRows: [FP.hubB] });
  assert.equal(r.code, "DEVICE_MISMATCH");
  assert.equal(r.holder.length, 1, "holder is the bound machine");
});

test("personal: an app already bound here plus a stale Hub mirror is not duplicated", () => {
  // Odd legacy state: two active rows, mirror on the Hub's. Adopting would
  // give one PC two rows with the same id, so the state is left alone.
  const ent = personalEnt([legacyHubRow(FP.hubA, "PC-A"), legacyAppRow(FP.quivA)], FP.hubA);
  const before = snapshot(ent);
  const r = quiv(ent, FP.quivA, { clearedInstallerRows: [FP.hubA] });
  assert.equal(r.code, "DEVICE_MISMATCH");
  assert.deepEqual(snapshot(ent), before);
});

// ── What the customer is told ──────────────────────────────────────────────

test("a refusal names who holds the seat and how to free it, with no fingerprint", () => {
  const ent = orgEnt(1, [{ ...legacyAppRow(FP.quivA), installerName: "RECEPTION-PC", source: "app", scheme: "mgu2" }]);
  const r = quiv(ent, FP.quivB);
  assert.equal(r.code, "DEVICE_LIMIT_REACHED");
  // An adopted row's old Hub name is not claimed as the machine's name.
  assert.deepEqual(r.holder, [{ name: "", app: "QUIV app", lastSeenAt: day(10).toISOString() }]);
  assert.match(r.message, /All 1 seat on this QUIV licence is in use: an unnamed computer \(QUIV app, last used 10 Sep 2026\)\./);
  assert.match(r.message, /ask your admin to reset the device, or free it from your account page/);
  assertNoFingerprint(r.holder);
  assertNoFingerprint(r.message);

  const pEnt = personalEnt([legacyHubRow(FP.hubA, "PC-A")]);
  const p = quiv(pEnt, FP.quivB, { clearedInstallerRows: [] });
  assert.equal(p.code, "DEVICE_MISMATCH");
  assert.match(p.message, /already in use on another computer: PC-A \(ADLM Installer Hub, last used 10 Sep 2026\)/);
  assertNoFingerprint(p);
});

test("rejectionMessage lists at most three holders and pluralises seats", () => {
  const holder = [1, 2, 3, 4, 5].map((n) => ({ name: `PC-${n}`, app: "QUIV app", lastSeenAt: null }));
  const msg = rejectionMessage({ code: "DEVICE_LIMIT_REACHED", holder, seats: 5, productKey: "revit" });
  assert.match(msg, /^All 5 seats on this QUIV licence are in use: PC-1 \(QUIV app\); PC-2 \(QUIV app\); PC-3 \(QUIV app\); and 2 more\./);
  assert.match(
    rejectionMessage({ code: "DEVICE_MISMATCH", holder: [], productKey: "mep" }),
    /^This ADLM MEP & HVAC licence is already in use on another computer: another computer\./,
  );
});

// ── The evidence lookup is only asked for when adoption is reachable ───────

test("adoptionEvidenceNeeded returns nothing for ordinary sign-ins", () => {
  const hub = () => [legacyHubRow(FP.hubA, "PC-A")];
  const q = { productKey: "revit", scheme: "mgu2" };
  // already bound here
  assert.deepEqual(adoptionEvidenceNeeded(orgEnt(1, [legacyAppRow(FP.quivA)]), { ...q, fingerprint: FP.quivA }), []);
  // a free seat
  assert.deepEqual(adoptionEvidenceNeeded(orgEnt(2, hub()), { ...q, fingerprint: FP.quivA }), []);
  // hw2 callers and products sharing the Hub's id
  assert.deepEqual(adoptionEvidenceNeeded(orgEnt(1, hub()), { productKey: "revit", scheme: "hw2", fingerprint: FP.hubB }), []);
  assert.deepEqual(adoptionEvidenceNeeded(orgEnt(1, hub(), "mep"), { productKey: "mep", scheme: "hw2", fingerprint: FP.hubB }), []);
  // personal: unbound, or bound here
  assert.deepEqual(adoptionEvidenceNeeded(personalEnt(hub(), ""), { ...q, fingerprint: FP.quivA }), []);
  // at the limit with a Hub row in the way: that row needs checking
  assert.deepEqual(adoptionEvidenceNeeded(orgEnt(1, hub()), { ...q, fingerprint: FP.quivA }), [FP.hubA]);
  assert.deepEqual(adoptionEvidenceNeeded(personalEnt(hub()), { ...q, fingerprint: FP.quivA }), [FP.hubA]);
});

// ── Kill switch ────────────────────────────────────────────────────────────

test("kill switch off (DEVICE_SCHEME_AWARE_BINDING=0): the Hub row keeps the seat, as before", () => {
  const prev = process.env.DEVICE_SCHEME_AWARE_BINDING;
  process.env.DEVICE_SCHEME_AWARE_BINDING = "0";
  try {
    const ent = orgEnt(1, [legacyHubRow(FP.hubA, "PC-A")]);
    const before = snapshot(ent);
    const r = enforceDeviceBinding(ent, FP.quivA, 2, {
      productKey: "revit",
      scheme: "mgu2",
      clearedInstallerRows: [FP.hubA],
    });
    assert.deepEqual(
      { ...r },
      { ok: false, status: 403, code: "DEVICE_LIMIT_REACHED", error: "Device limit reached for this subscription.", decision: "reject" },
    );
    assert.deepEqual(snapshot(ent), before);

    const fresh = orgEnt(2, []);
    enforceDeviceBinding(fresh, FP.quivA, 2, { productKey: "revit" });
    assert.deepEqual(Object.keys(fresh.devices[0]).sort(), ["boundAt", "fingerprint", "fpVersion", "lastSeenAt", "name", "revokedAt"]);
  } finally {
    if (prev === undefined) delete process.env.DEVICE_SCHEME_AWARE_BINDING;
    else process.env.DEVICE_SCHEME_AWARE_BINDING = prev;
  }
});

// Deterministic scenario generator for the differential checks below.
function* scenarios(count = 600) {
  // mulberry32: small, deterministic, and uniform in the low bits.
  let seed = 20260919;
  const rnd = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
  const pool = [FP.hubA, FP.hubB, FP.quivA, FP.quivB, FP.v1A];
  for (let i = 0; i < count; i += 1) {
    const devices = [];
    const rows = rnd(4);
    for (let k = 0; k < rows; k += 1) {
      const row = {
        fingerprint: pool[rnd(pool.length)],
        name: rnd(2) ? "PC-" + k : "",
        boundAt: day(1 + rnd(5)),
        lastSeenAt: day(6 + rnd(10)),
        revokedAt: rnd(5) === 0 ? day(17) : null,
      };
      const v = rnd(3);
      if (v) row.fpVersion = v; // 0 → absent (pre-fpVersion rows)
      devices.push(row);
    }
    const seats = 1 + rnd(3);
    const ent = {
      productKey: ["revit", "mep", "archicad", "planswift"][rnd(4)],
      status: "active",
      seats,
      licenseType: ["personal", "organization", "", undefined][rnd(4)],
      devices,
    };
    const mirror = rnd(4);
    if (mirror === 1 && devices.length) ent.deviceFingerprint = devices[0].fingerprint;
    if (mirror === 2) ent.deviceFingerprint = pool[rnd(pool.length)];
    if (mirror === 3) ent.deviceFingerprint = "";
    const incoming = [...pool, FP.quivC, ""][rnd(pool.length + 2)];
    const fpVersion = [1, 2, 2, 3][rnd(4)];
    const clientHeader = ["", "revit-arch-plugin", "installer-hub"][rnd(3)];
    yield { ent, incoming, fpVersion, clientHeader };
  }
}

test("kill switch off matches the pre-change implementation exactly (600 generated cases)", () => {
  mock.timers.enable({ apis: ["Date"], now: day(18).getTime() });
  try {
    for (const { ent, incoming, fpVersion } of scenarios()) {
      const oldEnt = structuredClone(ent);
      const newEnt = structuredClone(ent);
      const expected = legacyEnforceDeviceBinding(oldEnt, incoming, fpVersion);
      const { decision, ...got } = enforceDeviceBinding(newEnt, incoming, fpVersion, {
        enabled: false,
        productKey: ent.productKey,
        scheme: "mgu2",
        client: "x",
        clearedInstallerRows: ALL_FPS,
      });
      assert.ok(decision || !got.ok, "every result carries a decision");
      assert.deepEqual(got, expected, JSON.stringify({ ent, incoming, fpVersion }));
      assert.deepEqual(newEnt, oldEnt, JSON.stringify({ ent, incoming, fpVersion }));
    }
  } finally {
    mock.timers.reset();
  }
});

test("switch on: hw2 callers and products sharing the Hub's id decide exactly as before", () => {
  // Only provenance stamps (and the two freed-personal-seat fixes, excluded
  // here) may differ for the paths this change does not target.
  const STAMPS = ["source", "scheme", "client", "appSeenAt"];
  const strip = (ent) => ({
    ...ent,
    devices: ent.devices.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !STAMPS.includes(k)))),
  });
  mock.timers.enable({ apis: ["Date"], now: day(18).getTime() });
  try {
    let compared = 0;
    for (const { ent, incoming, fpVersion, clientHeader } of scenarios(1200)) {
      const productKey = ent.productKey;
      const scheme =
        fpVersion < 2 ? "v1" : productKey === "revit" ? (clientHeader === "revit-arch-plugin" ? "hw2" : "mgu2") : productKey === "archicad" ? "v1" : "hw2";
      if (scheme !== "hw2") continue; // mgu2 / v1 on revit+archicad is the targeted path
      const personal = !(ent.licenseType === "organization" || ent.seats > 1);
      const live = ent.devices.filter((d) => !d.revokedAt);
      const freedPersonal = personal && ent.deviceFingerprint && !live.length;
      // Freed, then the Hub bound this PC: its row is the only live one and
      // the mirror still names another id. Now a match, before a refusal.
      const freedThenBoundHere =
        personal &&
        ent.deviceFingerprint &&
        ent.deviceFingerprint !== incoming &&
        live.length === 1 &&
        live[0].fingerprint === incoming;
      if (freedPersonal || freedThenBoundHere) continue;

      const oldEnt = structuredClone(ent);
      const newEnt = structuredClone(ent);
      const expected = legacyEnforceDeviceBinding(oldEnt, incoming, fpVersion);
      const { decision, holder, message, ...got } = signIn(newEnt, incoming, { productKey, clientHeader, fpVersion, scheme });
      assert.deepEqual(got, expected, JSON.stringify({ ent, incoming, fpVersion, clientHeader }));
      assert.deepEqual(strip(newEnt), strip(oldEnt), JSON.stringify({ ent, incoming, fpVersion, clientHeader }));
      if (!got.ok && got.status === 403) {
        assert.equal(typeof message, "string");
        assertNoFingerprint({ holder, message });
      }
      compared += 1;
    }
    assert.ok(compared > 300, `compared ${compared}`);
  } finally {
    mock.timers.reset();
  }
});

test("property: seats are never exceeded and an app that got in is never evicted (random histories)", () => {
  // mulberry32 again, separate stream.
  let seed = 7;
  const rnd = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };

  for (let run = 0; run < 400; run += 1) {
    const seats = 1 + rnd(3);
    const pcs = Array.from({ length: 2 + rnd(4) }, (_, i) => ({
      hub: `hub-${run}-${i}`.padEnd(64, "0"),
      quiv: `quiv-${run}-${i}`.padEnd(64, "0"),
      lineage: rnd(3) === 0 ? "r26" : "quiv",
      name: `PC-${i}`,
    }));
    const ent = seats > 1 ? orgEnt(seats, []) : personalEnt([], undefined);

    // Before the fix: the Hub bound machines (bind-device, pre-change rules)
    // and R26 users signed in with the same hw2 id.
    for (const pc of pcs) {
      if (rnd(2) && active(ent).length < seats && !ent.devices.some((d) => d.fingerprint === pc.hub)) {
        ent.devices.push(legacyHubRow(pc.hub, pc.name, 1 + rnd(9)));
        if (!ent.deviceFingerprint) ent.deviceFingerprint = pc.hub;
      }
    }

    // After the fix: sign-ins in random order.
    const admitted = new Set();
    for (let step = 0; step < 12; step += 1) {
      const pc = pcs[rnd(pcs.length)];
      const r = pc.lineage === "r26" ? r26(ent, pc.hub) : quiv(ent, pc.quiv);
      if (r.ok) admitted.add(pc);
      else assert.ok(!admitted.has(pc), `run ${run}: ${pc.name} (${pc.lineage}) was evicted after getting in`);

      assert.ok(active(ent).length <= seats, `run ${run}: ${active(ent).length} active rows on ${seats} seats`);
      const appIds = new Set(active(ent).map((d) => d.fingerprint));
      const canSignIn = pcs.filter((p) => appIds.has(p.lineage === "r26" ? p.hub : p.quiv));
      assert.ok(canSignIn.length <= seats, `run ${run}: ${canSignIn.length} PCs can sign in on ${seats} seats`);
    }
  }
});
