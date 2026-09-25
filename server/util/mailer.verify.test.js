// What the "Can we send?" report says, and about which transport.
//
// The regression these exist for: this report predates the SES cutover and
// only ever probed Resend and Gmail SMTP. With MAIL_TRANSPORT=ses in
// production it showed "resend-smtp — works" and nothing at all about SES,
// which reads as "mail leaves here on Resend" — the opposite of the truth. An
// admin checking whether mail was healthy was being shown the health of a
// transport that cannot carry a single message while MAIL_FALLBACK=off.
//
// No network: verifyMail takes the account reader, so sandbox, paused and
// unreachable can each be driven directly.

import test from "node:test";
import assert from "node:assert/strict";

process.env.MAIL_TRANSPORT = "ses";
process.env.MAIL_FALLBACK = "off";
// Keep the other rungs out of the way unless a test wants them. buildTransports
// runs at import, so these have to be gone before mailer.js loads.
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

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

test("a healthy Resend behind a closed fallback is not counted as a way out", () => {
  // The exact shape of the bug: SES paused, Resend authenticating fine. The
  // old report said "there is a way out that has been checked" on Resend's
  // strength while MAIL_FALLBACK=off meant nothing could reach it. Driven
  // through the rule itself — producing a real Resend row needs a network
  // call, and the network is not what is under test.
  const report = summariseMailWays([
    { via: "ses", ok: false, live: true, said: "SENDING PAUSED by AWS" },
    { via: "resend-api", ok: true, said: "authenticated" },
    { via: "resend-smtp smtp.resend.com:465", ok: true, said: "authenticated" },
  ]);

  const resend = report.ways.find((r) => r.via === "resend-api");
  assert.equal(resend.ok, true, "its key really does authenticate");
  assert.equal(resend.unused, true, "but it must be marked as unable to carry mail");
  assert.equal(resend.live, false);

  assert.equal(report.transport, "ses");
  assert.equal(
    report.ok,
    false,
    "the report called the system healthy on a transport nothing can reach",
  );
});

test("with no transport selected the old any-way-out rule still applies", () => {
  const was = process.env.MAIL_TRANSPORT;
  delete process.env.MAIL_TRANSPORT;
  try {
    const report = summariseMailWays([{ via: "resend-api", ok: true, said: "authenticated" }]);
    assert.equal(report.transport, "", "nothing is live when none is selected");
    assert.equal(report.ok, true, "a working Resend is a real way out when it can be reached");
    assert.equal(report.ways[0].unused, undefined, "and it is not dead weight");
  } finally {
    if (was === undefined) delete process.env.MAIL_TRANSPORT;
    else process.env.MAIL_TRANSPORT = was;
  }
});
