import test from "node:test";
import assert from "node:assert/strict";
import {
  issueTicket,
  ticketProblem,
  honeypotTripped,
  visitorIp,
  throttleProblem,
  MIN_FILL_MS,
  MAX_AGE_MS,
  PER_IP_HOUR,
} from "./signupGuard.js";

const env = { SIGNUP_TICKET_SECRET: "test-secret" };

test("a ticket is good after a human pause and until it expires", () => {
  const t0 = 1_000_000;
  const ticket = issueTicket({ now: t0, env });
  assert.equal(ticketProblem(ticket, { now: t0 + MIN_FILL_MS + 1, env }), "");
  assert.equal(ticketProblem(ticket, { now: t0 + 500, env }), "too-fast");
  assert.equal(ticketProblem(ticket, { now: t0 + MAX_AGE_MS + 1, env }), "expired");
});

test("no ticket, a forged one or a tampered one is refused", () => {
  const t0 = 1_000_000;
  assert.equal(ticketProblem("", { now: t0, env }), "no-ticket");
  const ticket = issueTicket({ now: t0, env });
  const [, nonce, mac] = ticket.split(".");
  assert.equal(ticketProblem(`${t0 - 60_000}.${nonce}.${mac}`, { now: t0 + 10_000, env }), "bad-ticket");
  assert.equal(ticketProblem(issueTicket({ now: t0, env: { SIGNUP_TICKET_SECRET: "other" } }), { now: t0 + 10_000, env }), "bad-ticket");
});

test("with nothing to sign with, sign-up is not locked", () => {
  assert.equal(ticketProblem("", { env: {} }), "");
});

test("the hidden field catches a bot that fills everything", () => {
  assert.equal(honeypotTripped({ company_website: "https://spam.example" }), true);
  assert.equal(honeypotTripped({ company_website: "  " }), false);
  assert.equal(honeypotTripped({}), false);
});

test("the visitor is the address CloudFront saw, not one the client made up", () => {
  assert.equal(visitorIp({ headers: { "x-forwarded-for": "6.6.6.6, 41.58.10.20, 130.176.1.1" } }), "41.58.10.20");
  assert.equal(visitorIp({ headers: { "cloudfront-viewer-address": "41.58.10.20:51234", "x-forwarded-for": "6.6.6.6" } }), "41.58.10.20");
  assert.equal(visitorIp({ headers: { "cloudfront-viewer-address": "[2001:db8::1]:443" } }), "2001:db8::1");
  assert.equal(visitorIp({ headers: {}, ip: "::ffff:10.0.0.5" }), "10.0.0.5");
});

test("a visitor may sign up a room's worth an hour, then waits", async () => {
  const rows = [];
  const SignupThrottle = {
    countDocuments: async (q) => rows.filter((r) => r.key === q.key && r.at >= q.at.$gte).length,
    create: async (r) => rows.push(r),
  };
  const now = new Date("2026-09-22T10:00:00Z");
  for (let i = 0; i < PER_IP_HOUR; i++) assert.equal(await throttleProblem(SignupThrottle, "41.58.10.20", { now }), "");
  assert.equal(await throttleProblem(SignupThrottle, "41.58.10.20", { now }), "per-ip");
  assert.equal(await throttleProblem(SignupThrottle, "41.58.10.21", { now }), "");
});
