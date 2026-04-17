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
