import test from "node:test";
import assert from "node:assert/strict";
import { checkSubmissionFile, submissionKey, SUBMISSION_MAX_BYTES } from "./submissionFiles.js";

const MB = 1024 * 1024;

test("PDF, Word, Excel and images are accepted", () => {
  for (const [name, type] of [
    ["brief.pdf", "application/pdf"],
    ["answer.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["boq.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["site.JPG", "image/jpeg"],
    ["plan.png", "image/png"],
    ["shot.webp", "image/webp"],
  ]) {
    assert.equal(checkSubmissionFile({ name, type, size: 2 * MB }).ok, true, name);
  }
});

test("a blank browser type is decided by the extension", () => {
  assert.equal(checkSubmissionFile({ name: "boq.xlsx", type: "", size: MB }).ok, true);
});

test("other types are refused with the list of what is accepted", () => {
  for (const name of ["model.rvt", "setup.exe", "old.doc", "sheet.xls", "archive.zip", "noext"]) {
    const r = checkSubmissionFile({ name, type: "", size: MB });
    assert.equal(r.ok, false, name);
    assert.match(r.error, /PDF, Word \(\.docx\), Excel \(\.xlsx\)/);
  }
});

test("a type that contradicts the extension is refused", () => {
  assert.equal(checkSubmissionFile({ name: "boq.pdf", type: "application/x-msdownload", size: MB }).ok, false);
});

test("empty and over-limit files are refused, with sizes", () => {
  assert.equal(checkSubmissionFile({ name: "a.pdf", type: "application/pdf", size: 0 }).ok, false);
  const r = checkSubmissionFile({ name: "a.pdf", type: "application/pdf", size: SUBMISSION_MAX_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /limit is 5\.0 GB/);
});

test("storage keys stay inside the learner's folder", () => {
  const k = submissionKey({ userId: "u1", courseSku: "BIM 101", moduleCode: "../../x", name: "My Answer (final).pdf", now: 1 });
  assert.equal(k, "submissions/BIM-101/u1/..-..-x/1-My-Answer-final-.pdf");
  assert.ok(!k.includes("/../"));
});
