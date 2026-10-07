// server/util/prospecting/guards.test.js
//
// Deduplication, suppression and the daily cap, as pure rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashEmail, isNotACompanyDomain, lagosDay, normaliseDomain, normaliseEmail } from "./normalise.js";
import { DEFAULT_DAILY_CAP, dailyCap, remainingToday, screenCandidates, screenContacts } from "./guards.js";

/* ── normalising ─────────────────────────────────────────────────────── */

test("every spelling of a firm's site comes out as one domain", () => {
  for (const s of [
    "firmqs.com.ng",
    "FIRMQS.com.ng",
    "https://www.firmqs.com.ng/about-us?x=1#team",
    "http://firmqs.com.ng:8080/",
    "www2.firmqs.com.ng",
    "firmqs.com.ng.",
    "info@firmqs.com.ng",
    "  https://user:pw@firmqs.com.ng  ",
  ]) assert.equal(normaliseDomain(s), "firmqs.com.ng", s);
});

test("things that are not domains are refused", () => {
  for (const s of ["", null, undefined, "not a domain", "localhost", "192.168.0.1", "http://", "-bad-.com"]) {
    assert.equal(normaliseDomain(s), null, String(s));
  }
});

test("emails are lowercased and trimmed; junk is refused", () => {
  assert.equal(normaliseEmail("  Ade.Bello@FirmQS.com.ng "), "ade.bello@firmqs.com.ng");
  for (const s of ["", "no-at-sign", "@firmqs.com", "a b@firmqs.com", "a@localhost"]) assert.equal(normaliseEmail(s), null, s);
});

test("the same address hashes the same however it is written", () => {
  assert.equal(hashEmail("Ade@FirmQS.com.ng"), hashEmail(" ade@firmqs.com.ng "));
  assert.match(hashEmail("ade@firmqs.com.ng"), /^[a-f0-9]{64}$/);
  assert.notEqual(hashEmail("ade@firmqs.com.ng"), hashEmail("bola@firmqs.com.ng"));
  assert.equal(hashEmail("junk"), null);
});

test("free mail, social and directory domains are never a company", () => {
  assert.ok(isNotACompanyDomain("gmail.com"));
  assert.ok(isNotACompanyDomain("ng.linkedin.com"));
  assert.ok(!isNotACompanyDomain("firmqs.com.ng"));
  assert.ok(!isNotACompanyDomain("notgmail.com")); // a suffix match, not a substring match
});

test("the Lagos day rolls over at Lagos midnight, not UTC midnight", () => {
  // 23:30 UTC on the 25th is 00:30 WAT on the 26th.
  assert.equal(lagosDay(new Date("2026-09-25T23:30:00Z")), "2026-09-26");
  assert.equal(lagosDay(new Date("2026-09-25T22:59:59Z")), "2026-09-25");
});

/* ── daily cap ───────────────────────────────────────────────────────── */

test("the daily cap defaults to 20", () => {
  assert.equal(DEFAULT_DAILY_CAP, 20);
  assert.equal(dailyCap(undefined), 20);
  assert.equal(dailyCap(""), 20);
});

test("the daily cap reads a valid config value, including zero to pause", () => {
  assert.equal(dailyCap("35"), 35);
  assert.equal(dailyCap(0), 0);
});

test("a bad cap value falls back to 20, never to unlimited", () => {
  for (const v of ["abc", "-5", "2.5", "100000", "Infinity", "NaN"]) assert.equal(dailyCap(v), 20, v);
});

test("remaining today never goes below zero", () => {
  assert.equal(remainingToday(20, 0), 20);
  assert.equal(remainingToday(20, 18), 2);
  assert.equal(remainingToday(20, 20), 0);
  assert.equal(remainingToday(20, 27), 0);
});

const site = (s) => ({ companyName: s, website: `https://www.${s}` });

test("candidates stop at the cap and the rest are reported as daily_cap", () => {
  const candidates = ["a.com", "b.com", "c.com", "d.com"].map(site);
  const { accepted, skipped } = screenCandidates({ candidates, remaining: 2 });
  assert.deepEqual(accepted.map((a) => a.domain), ["a.com", "b.com"]);
  assert.deepEqual(skipped.map((s) => [s.domain, s.reason]), [["c.com", "daily_cap"], ["d.com", "daily_cap"]]);
});

test("with the cap already used up, nothing is added", () => {
  const { accepted } = screenCandidates({ candidates: [site("a.com")], remaining: 0 });
  assert.equal(accepted.length, 0);
});

test("rejected candidates do not use up the cap", () => {
  const candidates = [site("known.com"), site("gmail.com"), site("new1.com"), site("new2.com")];
  const { accepted } = screenCandidates({ candidates, existingDomains: new Set(["known.com"]), remaining: 2 });
  assert.deepEqual(accepted.map((a) => a.domain), ["new1.com", "new2.com"]);
});

/* ── deduplication ───────────────────────────────────────────────────── */

test("a company already on file is not added again, however its site is written", () => {
  const { accepted, skipped } = screenCandidates({
    candidates: [{ website: "HTTPS://WWW.FirmQS.com.ng/contact" }],
    existingDomains: new Set(["firmqs.com.ng"]),
    remaining: 20,
  });
  assert.equal(accepted.length, 0);
  assert.equal(skipped[0].reason, "already_a_prospect");
});

test("the same company twice in one batch is added once", () => {
  const { accepted, skipped } = screenCandidates({
    candidates: [{ website: "firmqs.com.ng" }, { website: "https://www.firmqs.com.ng/" }],
    remaining: 20,
  });
  assert.equal(accepted.length, 1);
  assert.equal(skipped[0].reason, "duplicate_in_batch");
});

test("invalid and non-company domains are reported, not added", () => {
  const { accepted, skipped } = screenCandidates({
    candidates: [{ website: "not a site" }, { website: "https://linkedin.com/company/firmqs" }],
    remaining: 20,
  });
  assert.equal(accepted.length, 0);
  assert.deepEqual(skipped.map((s) => s.reason), ["invalid_domain", "not_a_company_domain"]);
});

test("a contact already on file, or twice in one batch, is stored once", () => {
  const { accepted, skipped } = screenContacts({
    contacts: [{ email: "Ade@firmqs.com.ng" }, { email: "ade@firmqs.com.ng" }, { email: "bola@firmqs.com.ng" }],
    existingEmails: new Set(["bola@firmqs.com.ng"]),
  });
  assert.deepEqual(accepted.map((c) => c.email), ["ade@firmqs.com.ng"]);
  assert.deepEqual(skipped.map((s) => s.reason), ["duplicate_in_batch", "already_a_contact"]);
});

/* ── opt-out and suppression ─────────────────────────────────────────── */

test("a company that opted out or asked for deletion is never re-added", () => {
  const { accepted, skipped } = screenCandidates({
    candidates: [{ website: "https://www.firmqs.com.ng" }],
    suppressedDomains: new Set(["firmqs.com.ng"]),
    remaining: 20,
  });
  assert.equal(accepted.length, 0);
  assert.equal(skipped[0].reason, "suppressed");
});

test("suppression beats everything, even when the company is also new today", () => {
  // Order matters: a suppressed firm must be reported as suppressed, so the
  // report never suggests it was merely a duplicate that could be retried.
  const { skipped } = screenCandidates({
    candidates: [{ website: "firmqs.com.ng" }],
    suppressedDomains: new Set(["firmqs.com.ng"]),
    existingDomains: new Set(["firmqs.com.ng"]),
    remaining: 0,
  });
  assert.equal(skipped[0].reason, "suppressed");
});

test("a person who opted out is never stored again, in any casing", () => {
  const { accepted, skipped } = screenContacts({
    contacts: [{ email: "  ADE@FirmQS.com.ng" }],
    suppressedHashes: new Set([hashEmail("ade@firmqs.com.ng")]),
  });
  assert.equal(accepted.length, 0);
  assert.equal(skipped[0].reason, "suppressed");
});

test("a new person at a suppressed firm is not stored either", () => {
  const { accepted, skipped } = screenContacts({
    contacts: [{ email: "new.hire@firmqs.com.ng" }],
    suppressedDomains: new Set(["firmqs.com.ng"]),
  });
  assert.equal(accepted.length, 0);
  assert.equal(skipped[0].reason, "suppressed_domain");
});
