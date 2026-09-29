// The access token must stay small whatever the account holds. It rides on the
// Authorization header of every request, and the API edge refuses oversized
// headers before Express sees them (see accessTokenClaims in routes/auth.js).
import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
const { accessTokenClaims } = await import("./auth.js");

// Shaped like buildAuthPayload for an organisation with 60 seats, one device
// row each, and an avatar uploaded as a data: URL.
function bigPayload() {
  const devices = Array.from({ length: 60 }, (_, i) => ({
    fingerprint: "f".repeat(64) + i,
    name: `WORKSTATION-${i}`,
    boundAt: "2026-07-01T09:00:00.000Z",
    lastSeenAt: "2026-09-28T09:00:00.000Z",
    revoked: false,
  }));
  return {
    _id: "64f000000000000000000001",
    email: "firm@example.com",
    role: "user",
    zone: "south_west",
    state: "lagos",
    entitlements: ["quiv", "heron", "rategen"].map((productKey) => ({
      productKey,
      status: "active",
      seats: 60,
      licenseType: "organization",
      organizationName: "Example Associates",
      expiresAt: "2027-01-01T00:00:00.000Z",
      devices,
    })),
    firstName: "Ada",
    lastName: "Obi",
    whatsapp: "+2348000000000",
    username: "example",
    avatarUrl: "data:image/png;base64," + "A".repeat(40000),
    stepUpEnabled: false,
    emailVerified: true,
    isSuperAdmin: false,
    demoMode: false,
    permissions: [],
    designAccess: false,
    isGod: false,
  };
}

test("a many-seat account gets a token far under the header limit", () => {
  const payload = bigPayload();
  assert.ok(JSON.stringify(payload).length > 20000, "fixture is genuinely large");
  const token = jwt.sign(accessTokenClaims(payload), process.env.JWT_ACCESS_SECRET);
  assert.ok(token.length < 2000, `token is ${token.length} characters`);
});

test("the token drops entitlements and a data: avatar, and keeps every claim the server reads", () => {
  const payload = bigPayload();
  const claims = accessTokenClaims(payload);
  assert.equal(claims.entitlements, undefined);
  assert.equal(claims.avatarUrl, "");
  for (const key of [
    "_id", "email", "role", "zone", "state", "firstName", "lastName", "whatsapp",
    "username", "stepUpEnabled", "emailVerified", "isSuperAdmin", "demoMode",
    "permissions", "designAccess", "isGod",
  ]) {
    assert.deepEqual(claims[key], payload[key], key);
  }
  // The login / refresh reply still hands the client the full payload.
  assert.equal(payload.entitlements.length, 3);
});

test("a plain avatar link stays in the token", () => {
  const url = "https://res.cloudinary.com/adlm/image/upload/v1/avatars/a.png";
  assert.equal(accessTokenClaims({ ...bigPayload(), avatarUrl: url }).avatarUrl, url);
});
