// server/routes/wellKnown.js
// ----------------------------------------------------------------------------
// Public .well-known endpoints.
//
// Currently exposes just GET /.well-known/jwks.json — the JSON Web Key Set
// that ADLM plugins fetch to verify RS256-signed license tokens. The
// response is cache-friendly (immutable for the life of the key) and
// requires no auth: public keys are meant to be distributed widely.
//
// This router must be mounted BEFORE any auth middleware in index.js.
// ----------------------------------------------------------------------------

import express from "express";
import { getPublicJwk } from "../util/jwks.js";

const router = express.Router();

// GET /.well-known/jwks.json
router.get("/jwks.json", (_req, res) => {
  const jwk = getPublicJwk();

  // If the operator hasn't configured JWT_LICENSE_PRIVATE_KEY yet we
  // return an empty keyset rather than a 500 — plugins fall back to
  // HS256 when the set is empty, which is the rollout-safe default.
  const keys = jwk ? [jwk] : [];

  // 10-minute cache with stale-while-revalidate is plenty: keys only
  // change at rotation time, and plugins are told to refresh on
  // validation failure anyway.
  res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=86400");
  res.set("Content-Type", "application/jwk-set+json");
  // Public endpoint — must be reachable from any origin so plugins
  // running on end-user machines can fetch without CORS issues.
  res.set("Access-Control-Allow-Origin", "*");

  res.json({ keys });
});

export default router;
