import jwt from "jsonwebtoken";
import dayjs from "dayjs";

export function signAccessToken(user) {
  // short-lived (15 minutes)
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
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

export function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}
export function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
export function verifyLicense(token) {
  return jwt.verify(token, process.env.JWT_LICENSE_SECRET);
}
