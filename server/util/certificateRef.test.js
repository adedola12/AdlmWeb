import test from "node:test";
import assert from "node:assert/strict";
import { refFor, REF_PATTERN, ensureCertificateRef, verifyReply } from "./certificateRef.js";

test("the reference the certificate prints is the one verify accepts", () => {
  const ref = refFor("66f1a2b3c4d5e6f7a8b9c0d1");
  assert.equal(ref, "CERT-B9C0D1");
  assert.match(ref, REF_PATTERN);
});

test("a stored reference is kept; an issued one without it gets one, saved once", async () => {
  assert.equal(await ensureCertificateRef({ certificateRef: "CERT-8E1234" }), "CERT-8E1234");
  let saved = null;
  const ref = await ensureCertificateRef(
    { _id: "aaaaaaaaaaaaaaaaaa123456", certificateIssuedAt: new Date() },
    async (r) => {
      saved = r;
    },
  );
  assert.equal(ref, "CERT-123456");
  assert.equal(saved, "CERT-123456");
});

test("an unfinished course has no reference", async () => {
  assert.equal(await ensureCertificateRef({ _id: "x", status: "active" }), "");
});

test("the public check names the confirmed name and nothing that is not printed", () => {
  const day = () => "1 September 2026";
  const enr = { courseSku: "bim", certificateIssuedAt: new Date("2026-09-01"), certificateFinish: "light", email: "x@y.z" };
  const who = {
    firstName: "Ada",
    lastName: "Obi",
    certificateFirstName: "Adaeze",
    certificateLastName: "Obi-Nwosu",
    certificateNameLockedAt: new Date(),
  };
  const r = verifyReply({ ref: "CERT-ABC123", enr, course: { title: "BIM for QS" }, who, day });
  assert.equal(r.who, "Adaeze Obi-Nwosu");
  assert.equal(r.claimed, true);
  assert.equal(r.finish, "light");
  assert.equal(r.valid, true);
  assert.equal(JSON.stringify(r).includes("x@y.z"), false);

  const unclaimed = verifyReply({ ref: "CERT-ABC123", enr: { ...enr, certificateState: "revoked" }, course: null, who: { firstName: "Ada", lastName: "Obi" }, day });
  assert.equal(unclaimed.who, "Ada Obi");
  assert.equal(unclaimed.claimed, false);
  assert.equal(unclaimed.valid, false);
  assert.equal(unclaimed.course, "bim");
});
