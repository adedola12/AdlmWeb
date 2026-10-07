// server/routes/auth.socialVerified.test.js
//
// A sign-up through Google or Microsoft must be recorded as a verified email.
//
// WHY THIS IS GUARDED, AND WHY AT THE SOURCE
//
// The omission that prompted this was one missing line, and it was expensive.
// util/socialIdentity.js already refuses a provider account whose
// email_verified is false, so the address IS confirmed by the time a user is
// created — but POST /auth/social built the user without recording it. The
// consequences compounded:
//
//   * util/emailGate.js refuses EVERY signed-in request from an unconfirmed
//     account except the /auth ones, so the customer was blocked from the
//     product immediately after signing up.
//   * Only POST /auth/signup sends a six-digit code. The social path sends
//     none. So they were shown "confirm your email" and asked for a code that
//     had never been sent.
//   * The broadcast audience requires a verified address, so they could not be
//     reached at all: 270 accounts on 3 Oct 2026, more than a third of the
//     list, on a site where most sign-ups come through a provider.
//
// Driving the real route would mean standing up a provider's token signing to
// get past socialIdentity's verification, which tests the mock more than the
// code. The failure to catch is "somebody edits this object and leaves the
// field out again", and that is visible in the source — the same reason
// components/newBuildGate.golive.test.js reads main.jsx as text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const AUTH = fs.readFileSync(path.join(here, "auth.js"), "utf8");

/** The `new User({...})` inside POST /auth/social, as source text. */
function socialUserBlock() {
  const at = AUTH.indexOf('router.post("/social"');
  assert.ok(at > -1, 'auth.js no longer declares router.post("/social")');
  const after = AUTH.slice(at);
  const made = after.indexOf("user = new User({");
  assert.ok(made > -1, "the social route no longer creates a user with new User({ ... })");
  const rest = after.slice(made);
  const end = rest.indexOf("});");
  return rest.slice(0, end === -1 ? 900 : end);
}

test("a social sign-up is created with the provider's verification recorded", () => {
  const block = socialUserBlock();
  assert.match(
    block,
    /emailVerified:\s*true/,
    "POST /auth/social must set emailVerified: true — the provider has already " +
      "confirmed the address (socialIdentity.js rejects email_verified false), and " +
      "without it emailGate.js locks the new customer out of the product and no " +
      "code is ever sent to let them out.",
  );
  assert.match(
    block,
    /emailVerifiedAt:/,
    "set emailVerifiedAt too, so when it was confirmed is answerable later.",
  );
});

test("socialIdentity still refuses a provider account that is not verified", () => {
  // The line above is only safe BECAUSE of this one. If the refusal is ever
  // relaxed, marking the address verified on our side becomes a lie and this
  // test should fail loudly rather than let it through.
  const id = fs.readFileSync(path.join(here, "..", "util", "socialIdentity.js"), "utf8");
  assert.match(
    id,
    /email_verified\s*===\s*false/,
    "socialIdentity.js must keep rejecting an unverified provider email; the " +
      "social sign-up trusts it.",
  );
});
