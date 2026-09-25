import test from "node:test";
import assert from "node:assert/strict";
import { contentDisposition } from "./fileStore.js";

test("a download keeps its name, letter r and all", () => {
  assert.equal(
    contentDisposition("Chapter report.docx"),
    `attachment; filename="Chapter report.docx"; filename*=UTF-8''Chapter%20report.docx`,
  );
  assert.equal(contentDisposition("ADLM-Installer-Hub-Setup.exe").includes('filename="ADLM-Installer-Hub-Setup.exe"'), true);
});

test("quotes, backslashes and control characters cannot break the header", () => {
  const d = contentDisposition('bad"na\\me\r\n.pdf');
  assert.equal(/[\r\n]/.test(d), false);
  assert.match(d, /filename="badname\.pdf"/);
});

test("an accented name is exact in filename*, plain ASCII in filename", () => {
  const d = contentDisposition("Adébáyọ̀ BoQ.xlsx");
  assert.match(d, /filename="Ad_b_y__ BoQ\.xlsx"/);
  assert.match(d, /filename\*=UTF-8''Ad%C3%A9b%C3%A1y/);
});

test("no name, no header", () => {
  assert.equal(contentDisposition(""), undefined);
  assert.equal(contentDisposition("\r\n"), undefined);
});
