import test from "node:test";
import assert from "node:assert/strict";
import {
  issueTicket,
  ticketProblem,
  honeypotTripped,
  visitorIp,
  reserveSignup,
  visitorNetwork,
  guardOff,
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

function fakeCounters() {
  const rows = new Map();
  return {
    rows,
    findOneAndUpdate: async (q, u, o) => {
      const k = `${q.key}|${q.bucket}`;
      if (!rows.has(k)) {
        if (!o.upsert) return null;
        rows.set(k, { ...q, n: 0, ...(u.$setOnInsert || {}) });
      }
      const r = rows.get(k);
      r.n += u.$inc.n;
      return { ...r };
    },
  };
}

test("a visitor may create a room's worth of accounts an hour, then waits", async () => {
  const SignupThrottle = fakeCounters();
  const now = new Date("2026-09-22T10:00:00Z");
  for (let i = 0; i < PER_IP_HOUR; i++) assert.equal((await reserveSignup(SignupThrottle, "41.58.10.20", { now })).problem, "");
  assert.equal((await reserveSignup(SignupThrottle, "41.58.10.20", { now })).problem, "per-ip");
  assert.equal((await reserveSignup(SignupThrottle, "41.58.10.21", { now })).problem, "");
});

test("parallel requests cannot all slip under the cap", async () => {
  const SignupThrottle = fakeCounters();
  const now = new Date("2026-09-22T10:00:00Z");
  const got = await Promise.all(Array.from({ length: PER_IP_HOUR + 10 }, () => reserveSignup(SignupThrottle, "41.58.10.20", { now })));
  assert.equal(got.filter((g) => !g.problem).length, PER_IP_HOUR);
});

test("a sign-up that then fails hands its place back", async () => {
  const SignupThrottle = fakeCounters();
  const now = new Date("2026-09-22T10:00:00Z");
  for (let i = 0; i < PER_IP_HOUR; i++) {
    const slot = await reserveSignup(SignupThrottle, "41.58.10.20", { now });
    await slot.release();
  }
  assert.equal((await reserveSignup(SignupThrottle, "41.58.10.20", { now })).problem, "");
});

test("an IPv6 visitor counts by its /64 network", () => {
  assert.equal(visitorNetwork("2001:db8:abcd:12::1"), "2001:db8:abcd:12::/64");
  assert.equal(visitorNetwork("2001:db8:abcd:12:ffff:1:2:3"), "2001:db8:abcd:12::/64");
  assert.equal(visitorNetwork("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(visitorNetwork("::ffff:41.58.10.20"), "41.58.10.20");
  assert.equal(visitorNetwork("41.58.10.20"), "41.58.10.20");
});

test("SIGNUP_GUARD=off is the emergency valve", () => {
  assert.equal(guardOff({ SIGNUP_GUARD: "off" }), true);
  assert.equal(guardOff({}), false);
});
