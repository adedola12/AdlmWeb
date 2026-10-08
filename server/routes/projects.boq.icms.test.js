// PUT /projectsboq/:tool/:id/icms: the ICMS details form's save (client
// features/icms/IcmsDetailsForm.jsx). Driven over real HTTP with a real signed
// token, Mongo stubbed, as projects.boq.test.js does.
//
// What it defends: the owner's save lands on project.icms (and the report then
// gives cost and carbon per m2); a bad detail is a 400 in words the form can
// show; a sample project and a view-only collaborator are refused with 403, so
// the form's read-only state is not the only thing between them and a write.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const { signAccess } = await import("../middleware/auth.js");
const { TakeoffProject } = await import("../models/TakeoffProject.js");
const { User } = await import("../models/User.js");
const { default: boqRouter } = await import("./projects.boq.js");
const { buildIcmsReport } = await import("../util/icmsExport.js");

const OWNER = new mongoose.Types.ObjectId();
const VIEWER = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();

User.findById = () => ({ lean: async () => ({ entitlements: [] }) });

let stored = null;
let saves = 0;
function projectDoc(extra = {}) {
  return {
    _id: PROJECT_ID,
    userId: OWNER,
    productKey: "revit",
    name: "Ikoyi",
    collaborators: [],
    items: [{ lineId: "a", description: "Strip – Concrete in Footing", unit: "m3", qty: 10, rate: 100000 }],
    contract: {},
    icms: undefined,
    async save() {
      saves += 1;
      return this;
    },
    ...extra,
  };
}
TakeoffProject.findById = async (id) => (stored && String(id) === String(stored._id) ? stored : null);

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use("/projectsboq", boqRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const tokenFor = (userId) => signAccess({ id: String(userId), email: "qs@example.com", role: "user" });
const put = (base, token, body) =>
  fetch(`${base}/projectsboq/revit/${PROJECT_ID}/icms`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Exactly what the form sends (icmsBodyFrom): every field, blanks cleared.
const FORM = {
  projectType: "01", country: "NG", currency: "NGN", baseDate: "2026-10-01", projectStatus: "",
  priceBasis: "", location: "", gfaIpms1: 120, gfaIpms2: 100, carbonBoundary: "",
};

test("the owner saves the details, and the report then gives cost per m2", async () => {
  stored = projectDoc();
  saves = 0;
  await withServer(async (base) => {
    const res = await put(base, tokenFor(OWNER), FORM);
    assert.equal(res.status, 200, await res.clone().text());
    const out = await res.json();
    assert.equal(out.ok, true);
  });
  assert.equal(saves, 1);
  assert.equal(stored.icms.gfaIpms2, 100);
  assert.equal(stored.icms.currency, "NGN");
  assert.ok(stored.icms.updatedAt instanceof Date);
  const r = buildIcmsReport(stored, { productKey: "revit" });
  assert.equal(r.perM2.area, 100);
  assert.ok(r.perM2.cost > 0);
});

test("a bad detail is refused with words the form can show", async () => {
  stored = projectDoc();
  saves = 0;
  await withServer(async (base) => {
    const res = await put(base, tokenFor(OWNER), { ...FORM, currency: "NAIRA" });
    assert.equal(res.status, 400);
    const out = await res.json();
    assert.equal(out.code, "ICMS_INVALID");
    assert.match(out.error, /ISO 4217/);
  });
  assert.equal(saves, 0);
});

test("a sample project and a view-only collaborator cannot write them", async () => {
  await withServer(async (base) => {
    stored = projectDoc({ isSample: true });
    saves = 0;
    let res = await put(base, tokenFor(OWNER), FORM);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "NO_EDIT");

    stored = projectDoc({ collaborators: [{ userId: VIEWER, accessLevel: "view" }] });
    res = await put(base, tokenFor(VIEWER), FORM);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "NO_EDIT");
  });
  assert.equal(saves, 0);
});
