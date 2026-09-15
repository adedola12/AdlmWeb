// server/middleware/rateLimiter.js
// Rate limiting to mitigate brute-force, credential stuffing, and abuse.
import rateLimit from "express-rate-limit";

// Strict: login / signup / password reset
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
  // Don't rate-limit successful requests against the user who legitimately
  // logs in many times; we key on IP only here because identifier may not
  // be available on all routes.
  skipSuccessfulRequests: false,

  // GET /auth/providers is not an attempt at anything. It is the read-only
  // lookup that tells the sign-in page which social buttons to draw, and it
  // returns public client ids and authorize URLs — there is nothing behind it
  // to brute force.
  //
  // It was inside this limiter because the whole /auth router is mounted
  // behind it, and the effect was ugly and silent: every load of /login,
  // /signup or the connect-account screen spent one of the ten, so after ten
  // page views in fifteen minutes the Google and Microsoft buttons simply
  // stopped appearing. The component draws nothing when the lookup fails, by
  // design — a button that dies on click is worse than no button — so there
  // was no error to see. On an office IP behind one NAT address that is ten
  // people looking at the page once each.
  skip: (req) => req.method === "GET" && req.path === "/providers",
});

// Medium: device activation / deactivation
export const deviceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many device requests. Please wait a few minutes." },
});

// Loose: general API — wide ceiling, catches scrapers/abusers only
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
