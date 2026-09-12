// server/util/mailer.sender.test.js
//
// What name the studio sends under.
//
// A small thing to test, and it had drifted: the brand is "ADLM Studio"
// everywhere a customer meets it — the site, the plugins, the signature at the
// bottom of the messages themselves — while every message went out from "ADLM
// Services". The sender name is the one line of a message somebody reads before
// deciding whether to open it, and two names for one firm in an inbox is how
// mail from a domain starts looking like mail about it.
//
// WHY THIS TESTS THE SOURCE AND NOT A FUNCTION CALL
//
// The from-address is computed inside sendMail, a few lines before the message
// goes to a provider, and there is no way to ask for it without either sending
// something or mocking the whole transport — at which point the test asserts
// what the mock was told rather than what the studio sends. So it reads the
// fallbacks out of the file. That is a blunter instrument, and it catches
// exactly the regression that happened here: somebody types the wrong name.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mailerSrc = fs.readFileSync(path.join(here, "mailer.js"), "utf8");

test("the hard-coded sender names say ADLM Studio", () => {
  // Both of them: the primary fallback used when EMAIL_FROM is unset, and the
  // resend.dev one used when the domain is not verified. The second is the one
  // that gets forgotten, and it is the one a customer sees on the day the
  // domain verification lapses.
  assert.ok(!/ADLM Services/.test(mailerSrc), 'no "ADLM Services" anywhere in mailer.js');

  const senders = [...mailerSrc.matchAll(/ADLM [A-Za-z]+ </g)].map((m) => m[0]);
  assert.ok(senders.length >= 2, `expected both fallbacks, found ${senders.length}`);
  for (const s of senders) {
    assert.match(s, /^ADLM Studio </, `sender reads "${s}"`);
  }
});

test("EMAIL_FROM, where it is set, is a name plus an address", () => {
  // Resend and nodemailer both accept `Name <addr>`, and both accept a bare
  // address — which is the failure worth catching, because a bare address is
  // not an error anywhere, it just arrives in the inbox with no name on it.
  const envPath = path.join(here, "..", ".env");
  if (!fs.existsSync(envPath)) return; // CI has no .env; nothing to check

  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("EMAIL_FROM="));
  if (!line) return;

  const value = line.slice("EMAIL_FROM=".length).trim().replace(/^["']|["']$/g, "");
  assert.match(
    value,
    /^[^<>]+\s<[^<>@\s]+@[^<>@\s]+>$/,
    `EMAIL_FROM should be 'Name <addr>', got "${value}"`,
  );
  assert.match(value, /^ADLM Studio </, "and the name is ADLM Studio");
});
