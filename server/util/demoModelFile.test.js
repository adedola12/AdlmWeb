import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentTypeFor,
  formatFor,
  MODEL_ACCESS,
  MODEL_MAX_BYTES,
  MODEL_PURPOSES,
  modelStorageKey,
  modelUploadProblem,
  safeModelName,
} from "./demoModelFile.js";

test("the formats a sample model may be", () => {
  assert.equal(formatFor("Duplex.rvt"), "rvt");
  assert.equal(formatFor("duplex.IFC"), "ifc");
  assert.equal(formatFor("takeoff.zip"), "zip");
  assert.equal(formatFor("plan.pln"), "pln");
  assert.equal(formatFor("notes.txt"), "");
  assert.equal(formatFor(""), "");
});

test("an unacceptable file is refused with a sentence an admin can act on", () => {
  const p = modelUploadProblem({ filename: "virus.exe" });
  assert.match(p, /cannot be a sample model/);
  assert.match(p, /\.rvt/, "the message should say what IS accepted");
  assert.equal(modelUploadProblem({ filename: "" }), "Choose a file.");
});

test("a real model passes", () => {
  assert.equal(modelUploadProblem({ filename: "4-Bed Duplex.rvt", size: 50e6 }), null);
});

test("a file over the limit is refused", () => {
  const p = modelUploadProblem({ filename: "huge.rvt", size: MODEL_MAX_BYTES + 1 });
  assert.match(p, /over the 2 GB limit/);
});

test("the stored name cannot break a key or a Content-Disposition", () => {
  assert.equal(safeModelName("4-Bed Duplex.rvt"), "4-Bed-Duplex.rvt");
  assert.equal(safeModelName("../../etc/passwd.rvt"), "etc-passwd.rvt");
  // Quotes and backslashes would break a Content-Disposition header.
  assert.equal(safeModelName('a"b' + String.fromCharCode(92) + "c.ifc"), "a-b-c.ifc");
  assert.equal(safeModelName(".rvt"), "model.rvt");
  assert.ok(safeModelName(`${"x".repeat(300)}.rvt`).length <= 84);
});

test("the key carries the id, so two files of the same name cannot collide", () => {
  const a = modelStorageKey("aaa111", "Duplex.rvt");
  const b = modelStorageKey("bbb222", "Duplex.rvt");
  assert.notEqual(a, b);
  assert.match(a, /^demo-models\/aaa111\/Duplex\.rvt$/);
});

test("nothing is ever written to a public prefix", () => {
  // The Installer Hub's whole failure was a build on a public prefix whose URL
  // kept being served. A model key must not be able to become one.
  const key = modelStorageKey("id", "x.rvt");
  assert.ok(!/^adlm\//.test(key));
  assert.ok(!key.includes("public"));
});

test("the upload is signed with a sane content type", () => {
  assert.equal(contentTypeFor("x.ifc"), "application/x-step");
  assert.equal(contentTypeFor("x.zip"), "application/zip");
  assert.equal(contentTypeFor("x.rvt"), "application/octet-stream");
  assert.equal(contentTypeFor("x.unknown"), "application/octet-stream");
});

test("the vocabularies are what the screens will offer", () => {
  assert.deepEqual(MODEL_PURPOSES, ["course", "demo"]);
  assert.deepEqual(MODEL_ACCESS, ["public", "signed-in", "entitled", "course"]);
});
