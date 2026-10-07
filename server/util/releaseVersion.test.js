// server/util/releaseVersion.test.js
//
// "Did the version go up?" decides whether several hundred customers get an
// email, so the comparison is pinned: numeric not lexical, forgiving about how
// a version is written, and "cannot tell" whenever it is not a version at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalVersion,
  compareVersions,
  maxVersion,
  normalizeVersion,
  parseVersion,
  sameVersion,
} from "./releaseVersion.js";

test("parts compare as numbers, not as text", () => {
  // The bug this prevents: "3.1.11" < "3.1.9" as strings.
  assert.equal(compareVersions("3.1.11", "3.1.9"), 1);
  assert.equal(compareVersions("3.1.9", "3.1.11"), -1);
  assert.equal(compareVersions("10.0.0", "9.9.9"), 1);
});

test("the same version written differently is the same version", () => {
  assert.equal(compareVersions("v3.1.11", "3.1.11"), 0);
  assert.equal(compareVersions("2.5", "2.5.0"), 0);
  assert.equal(compareVersions(" 3.1.11 ", "Version 3.1.11"), 0);
  assert.ok(sameVersion("V2.9", "2.9.0"));
  assert.equal(normalizeVersion("v3.1.11"), "3.1.11");
});

test("a pre-release sorts below its release, and build metadata is ignored", () => {
  assert.equal(compareVersions("3.2.0-beta.1", "3.2.0"), -1);
  assert.equal(compareVersions("3.2.0", "3.2.0-rc.1"), 1);
  assert.equal(compareVersions("3.2.0-beta.2", "3.2.0-beta.10"), -1);
  assert.equal(compareVersions("3.2.0-alpha", "3.2.0-beta"), -1);
  assert.equal(compareVersions("3.2.0+build.7", "3.2.0"), 0);
});

test("anything that is not a version compares as unknown (null), never as newer", () => {
  for (const bad of ["", "latest", "July build", "3.x", null, undefined, "3..1"]) {
    assert.equal(parseVersion(bad), null, JSON.stringify(bad));
    assert.equal(compareVersions(bad, "1.0.0"), null, JSON.stringify(bad));
    assert.equal(compareVersions("1.0.0", bad), null, JSON.stringify(bad));
  }
});

test("one canonical spelling per version, and equal versions always share it", () => {
  // HERON has shipped "2.5"; a release script or an admin may write "2.5.0".
  assert.equal(canonicalVersion("3.2"), "3.2.0");
  assert.equal(canonicalVersion("v3.2.0"), "3.2.0");
  assert.equal(canonicalVersion("3.2.0.0"), "3.2.0");
  assert.equal(canonicalVersion("3.2.0+build.7"), "3.2.0");
  assert.equal(canonicalVersion("Version 03.02"), "3.2.0");
  assert.equal(canonicalVersion("3.1.11"), "3.1.11");
  assert.equal(canonicalVersion("1.2.3.4"), "1.2.3.4");
  assert.equal(canonicalVersion("1.2.3.4.0"), "1.2.3.4");
  assert.equal(canonicalVersion("3.2-Beta.01"), "3.2.0-beta.1");
  assert.equal(canonicalVersion("latest"), "");

  const spellings = ["3.2", "3.2.0", "v3.2.0.0", "3.2.0+x", "3.2.0-rc.1", "3.2-RC.01", "3.1.11", "3.1.11.0", "2.5", "2.5.0.0"];
  for (const a of spellings) {
    for (const b of spellings) {
      assert.equal(
        canonicalVersion(a) === canonicalVersion(b),
        compareVersions(a, b) === 0,
        `${a} vs ${b}`,
      );
    }
  }
});

test("maxVersion picks the highest readable version and ignores the rest", () => {
  assert.equal(maxVersion(["3.1.9", "3.1.11", "latest", "3.1.10"]), "3.1.11");
  assert.equal(maxVersion([]), "");
  assert.equal(maxVersion(["nope"]), "");
});
