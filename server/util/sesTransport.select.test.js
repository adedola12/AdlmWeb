// Which transport carries the mail.
//
// With Resend gone, SES is the default and there is exactly one way to leave
// it: MAIL_TRANSPORT=smtp. The case worth pinning down is the one a migration
// leaves behind — an SSM parameter still reading "ses" from the days when SES
// had to be asked for, or no parameter at all. Both must mean SES. A default
// that quietly meant "SMTP" would put every message on a Gmail app password
// that Google does not allow bulk mail through and that was already broken.

import test from "node:test";
import assert from "node:assert/strict";

import { isSesSelected } from "./sesTransport.js";

function withTransport(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "MAIL_TRANSPORT");
  const before = process.env.MAIL_TRANSPORT;
  if (value === undefined) delete process.env.MAIL_TRANSPORT;
  else process.env.MAIL_TRANSPORT = value;
  try {
    return fn();
  } finally {
    if (had) process.env.MAIL_TRANSPORT = before;
    else delete process.env.MAIL_TRANSPORT;
  }
}

test("SES carries the mail when nothing has been configured", () => {
  assert.equal(withTransport(undefined, isSesSelected), true);
  assert.equal(withTransport("", isSesSelected), true);
});

test('the old "ses" setting still means SES', () => {
  for (const v of ["ses", "SES", " ses "]) {
    assert.equal(withTransport(v, isSesSelected), true, JSON.stringify(v));
  }
});

test("MAIL_TRANSPORT=smtp is the only way off SES", () => {
  for (const v of ["smtp", "SMTP", " smtp "]) {
    assert.equal(withTransport(v, isSesSelected), false, JSON.stringify(v));
  }
});

test("a value that is not smtp does not silently disable SES", () => {
  // "resend" in particular: a leftover parameter from before the removal must
  // not route mail somewhere that no longer exists.
  for (const v of ["resend", "gmail", "off"]) {
    assert.equal(withTransport(v, isSesSelected), true, JSON.stringify(v));
  }
});

test("it is read at call time, not captured at import", () => {
  // On Lambda the SSM parameters land in process.env after modules load.
  withTransport("smtp", () => assert.equal(isSesSelected(), false));
  withTransport(undefined, () => assert.equal(isSesSelected(), true));
});
