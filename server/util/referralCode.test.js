import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_LENGTH,
  looksLikeReferralCode,
  newReferralCode,
  normaliseReferralCode,
  referralLink,
} from "./referralCode.js";

test("a code is letters and digits only, and avoids the four that get misread", () => {
  // It goes inside a bare URL in Ada's reply, and her inline formatter stops a
  // URL at the first punctuation — anything but alphanumerics would truncate.
  for (let i = 0; i < 300; i += 1) {
    const c = newReferralCode();
    assert.equal(c.length, CODE_LENGTH);
    assert.match(c, /^[A-HJ-NP-Z2-9]+$/, `${c} contains O, I, 0 or 1`);
  }
});

test("codes do not repeat in any sane number of draws", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) seen.add(newReferralCode());
  assert.equal(seen.size, 2000);
});

test("a requested length is honoured and clamped", () => {
  assert.equal(newReferralCode(12).length, 12);
  assert.equal(newReferralCode(1).length, 4);
  assert.equal(newReferralCode(999).length, 32);
});

test("what somebody types is folded onto what the alphabet can produce", () => {
  const code = "ABCD2345";
  assert.equal(normaliseReferralCode(code), code);
  assert.equal(normaliseReferralCode("  abcd2345 "), code);
  // O/0 and I/1/l are the substitutions people actually make by eye.
  assert.equal(normaliseReferralCode("A0CD2345"), "AOCD2345");
  assert.equal(normaliseReferralCode("A1CD2345"), "AICD2345");
  assert.equal(normaliseReferralCode("alCD2345"), "AICD2345");
});

test("something that is not a code returns empty rather than half-matching", () => {
  assert.equal(normaliseReferralCode(""), "");
  assert.equal(normaliseReferralCode(null), "");
  assert.equal(normaliseReferralCode("abc"), "");
  assert.equal(normaliseReferralCode("ABCD-2345"), "");
  assert.equal(normaliseReferralCode("<script>"), "");
  assert.equal(normaliseReferralCode("A".repeat(64)), "");
});

test("looksLikeReferralCode accepts only the alphabet", () => {
  assert.equal(looksLikeReferralCode("ABCD2345"), true);
  assert.equal(looksLikeReferralCode("ABCD2340"), false, "0 is not in the alphabet");
  assert.equal(looksLikeReferralCode("ABCD234!"), false);
});

test("the link's origin comes from configuration, never a request", () => {
  assert.equal(
    referralLink("ABCD2345", { origin: "https://www.adlmstudio.net" }),
    "https://www.adlmstudio.net/?ref=ABCD2345",
  );
  // A trailing slash on the configured origin must not double up.
  assert.equal(
    referralLink("ABCD2345", { origin: "https://www.adlmstudio.net/" }),
    "https://www.adlmstudio.net/?ref=ABCD2345",
  );
  assert.equal(referralLink(""), "");
});

test("the link survives Ada's bare-URL renderer unchanged", () => {
  // chatMarkdown.jsx matches https?://[^\s<>()]+ and stops before trailing
  // punctuation. The whole link must come through, code included.
  const link = referralLink("ABCD2345", { origin: "https://www.adlmstudio.net" });
  const m = link.match(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/);
  assert.equal(m?.[0], link, "the renderer would truncate this link");
});
