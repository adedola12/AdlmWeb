import jwt from "jsonwebtoken";
import dayjs from "dayjs";

export const REFRESH_COOKIE = "rt";

const PROD = process.env.NODE_ENV === "production";

// If you use a custom apex/subdomain, you may set COOKIE_DOMAIN=".yourdomain.com"
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export const refreshCookieOpts = {
  httpOnly: true,
  secure: PROD ? true : false,
  sameSite: PROD ? "none" : "lax",
  domain: COOKIE_DOMAIN, // keep undefined if you don’t need a domain
  path: "/auth/refresh", // cookie only sent to POST /auth/refresh
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};


export function signAccessToken(user) {
  // 3-hour session so users aren't interrupted mid-work
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "3h" }
  );
}

export function signRefreshToken(user) {
  // long-lived (30 days), includes version for invalidation
  return jwt.sign(
    { sub: user._id.toString(), v: user.refreshVersion },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

export function signLicenseToken(user) {
  // license token used by plugins OFFLINE up to 15 days
  // include entitlements compactly
  const ent = {};
  for (const e of user.entitlements) {
    ent[e.productKey] = {
      status: e.status,
      exp: e.expiresAt ? dayjs(e.expiresAt).toISOString() : null,
    };
  }
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      entitlements: ent,
    },
    process.env.JWT_LICENSE_SECRET,
    { expiresIn: "15d" }
  );
}

export function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "3h" });
}

export function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
}


export function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

// ── Step-up (re-authentication) tokens ──
// Short-lived proof that the user recently passed an email OTP. Issued by
// POST /auth/step-up/verify, presented in the X-Step-Up header on sensitive
// actions, and checked by the requireStepUp middleware. Reuses the access
// secret but is namespaced by scope:"step_up" so it can never be swapped in
// for a normal access token (verifyAccess ignores scope; verifyStepUp asserts it).
export function signStepUp({ sub }) {
  return jwt.sign(
    { sub: String(sub), scope: "step_up" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "10m" }
  );
}
export function verifyStepUp(token) {
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (!decoded || decoded.scope !== "step_up") {
    throw new Error("Not a step-up token");
  }
  return decoded;
}
// ── God-account login challenge ──
// Issued by POST /auth/login when a God account passes the password check. It
// is NOT an access token — it only proves "this person knows the God password
// and we are mid-login". The second step (POST /auth/login/otp) requires this
// challenge + a fresh email OTP + the password again before any real token is
// minted. Namespaced by scope:"god_login" so it can never be used as an access
// token. We carry the plugin context (so step 2 can mint the right license).
export function signGodChallenge({ sub, plugin = false, productKey = "", fingerprint = "", fpVersion = 1 }) {
  return jwt.sign(
    {
      sub: String(sub),
      scope: "god_login",
      plugin: !!plugin,
      productKey: String(productKey || ""),
      fingerprint: String(fingerprint || ""),
      fpVersion: Number(fpVersion) || 1,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "10m" },
  );
}
export function verifyGodChallenge(token) {
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (!decoded || decoded.scope !== "god_login") {
    throw new Error("Not a god-login challenge token");
  }
  return decoded;
}

export function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
export function verifyLicense(token) {
  return jwt.verify(token, process.env.JWT_LICENSE_SECRET);
}
