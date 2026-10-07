// What the "Can we send?" report says, and about which transport.
//
// SES is the only transport (owner's rule, 6 Oct 2026: no Resend, no SMTP
// fallback), so the report is about SES and nothing else. The regression
// these guard against: a report that showed some other provider "works" while
// SES, the thing actually carrying the mail, was paused or in sandbox.
//
// No network: verifyMail takes the account reader, so sandbox, paused and
// unreachable can each be driven directly.

import test from "node:test";
import assert from "node:assert/strict";

process.env.MAIL_TRANSPORT = "ses";

const { verifyMail, summariseMailWays } = await import("./mailer.js");

const HEALTHY = {
  SendingEnabled: true,
  ProductionAccessEnabled: true,
  EnforcementStatus: "HEALTHY",
  SendQuota: { Max24HourSend: 50000, SentLast24Hours: 60 },
};

const rowFor = (report, via) => (report.ways || []).find((r) => r.via === via);

test("SES is reported, named as the live transport, and carries the verdict", async () => {
  const report = await verifyMail({ readAccount: async () => HEALTHY });

  const ses = rowFor(report, "ses");
  assert.ok(ses, "no SES row — the report still does not know about SES");
  assert.equal(ses.ok, true);
  assert.equal(ses.live, true, "SES is selected but was not marked live");
  assert.match(ses.said, /production access/);
  assert.match(ses.said, /sending enabled/);
  assert.match(ses.said, /60 of 50000 sent in 24h/);

  assert.equal(report.transport, "ses", "the report does not say which transport is live");
  assert.equal(report.fallbackOff, true);
  assert.equal(report.ok, true);

  // SES first: an admin reads the top row as the answer.
  assert.equal(report.ways[0].via, "ses");
});

test("sandbox and a pause are stated, not hidden behind a green mark", async () => {
  let report = await verifyMail({
    readAccount: async () => ({ ...HEALTHY, ProductionAccessEnabled: false }),
  });
  assert.match(
    rowFor(report, "ses").said,
    /SANDBOX/,
    "sandbox must be stated — it silently refuses every unverified customer",
  );
  assert.equal(rowFor(report, "ses").ok, true, "sandbox still sends, to verified addresses");

  report = await verifyMail({
    readAccount: async () => ({ ...HEALTHY, SendingEnabled: false }),
  });
  assert.equal(rowFor(report, "ses").ok, false, "a paused account cannot send");
  assert.match(rowFor(report, "ses").said, /SENDING PAUSED/);
  assert.equal(report.ok, false, "the report must fail when the live transport cannot send");

  report = await verifyMail({
    readAccount: async () => ({ ...HEALTHY, EnforcementStatus: "UNDER_REVIEW" }),
  });
  assert.match(rowFor(report, "ses").said, /enforcement UNDER_REVIEW/);
});

test("SES unreachable fails the report rather than throwing", async () => {
  const report = await verifyMail({
    readAccount: async () => {
      const e = new Error("connect ETIMEDOUT");
      e.name = "TimeoutError";
      throw e;
    },
  });
  assert.equal(rowFor(report, "ses").ok, false);
  assert.match(rowFor(report, "ses").said, /TimeoutError/);
  assert.equal(report.ok, false);
});

test("anything other than SES is never counted as a way out", () => {
  // SES is the only transport. Should any other row ever be handed in, it is
  // marked not in use and cannot make a paused SES look healthy.
  const report = summariseMailWays([
    { via: "ses", ok: false, live: true, said: "SENDING PAUSED by AWS" },
    { via: "smtp smtp.example.com:465", ok: true, said: "authenticated" },
  ]);

  const other = report.ways.find((r) => r.via !== "ses");
  assert.equal(other.unused, true, "it must be marked as unable to carry mail");
  assert.equal(other.live, false);

  assert.equal(report.transport, "ses");
  assert.equal(report.ok, false, "a paused SES is a failed report, whatever else answers");
});

test("with MAIL_TRANSPORT unset the report still names SES as the transport", async () => {
  const was = process.env.MAIL_TRANSPORT;
  delete process.env.MAIL_TRANSPORT;
  try {
    const report = await verifyMail({ readAccount: async () => HEALTHY });
    assert.equal(report.transport, "ses");
    assert.equal(report.fallbackOff, true, "nothing falls back, ever");
    assert.equal(report.ways.length, 1, "SES is the only row");
    assert.equal(report.ways[0].live, true);
    assert.equal(report.ok, true);
  } finally {
    if (was === undefined) delete process.env.MAIL_TRANSPORT;
    else process.env.MAIL_TRANSPORT = was;
  }
});
