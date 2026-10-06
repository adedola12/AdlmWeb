// An address that cannot receive mail must not be accepted at sign-up — and a
// resolver that is having a bad day must not cost anybody their sign-up.
//
// Both halves matter and they pull in opposite directions, which is why they are
// tested together. Measured on production 4 Oct 2026: the list held `gmail.ccom`,
// `gmail.comh` and `gmail.con` marked verified, so three people typed a domain
// that does not exist, were handed an account, and were then refused by
// emailGate.js pending a code that could never arrive. The same measurement found
// the check would have refused ZERO of the 84 accounts holding entitlements, so
// the risk here is entirely on the fail-open side.
import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";

import {
  domainOf,
  isMailboxShaped,
  domainCanReceiveMail,
  checkAddressReachable,
  _resetReachableCache,
} from "./emailReachable.js";

const quiet = { warn: () => {}, error: () => {} };

/** Swap the resolver for one that answers however the test needs. */
function withDns({ mx, a }, fn) {
  const realMx = dns.resolveMx;
  const realResolve = dns.resolve;
  dns.resolveMx = mx;
  dns.resolve = a;
  _resetReachableCache();
  return Promise.resolve(fn()).finally(() => {
    dns.resolveMx = realMx;
    dns.resolve = realResolve;
    _resetReachableCache();
  });
}

const nxdomain = () => {
  const e = new Error("not found");
  e.code = "ENOTFOUND";
  throw e;
};
const serverFail = () => {
  const e = new Error("resolver broke");
  e.code = "ESERVFAIL";
  throw e;
};

test("domainOf takes the part after the LAST @", () => {
  assert.equal(domainOf("someone@practice.ng"), "practice.ng");
  assert.equal(domainOf("odd@name@practice.ng"), "practice.ng");
  assert.equal(domainOf("  Someone@Practice.NG  "), "practice.ng");
  assert.equal(domainOf("no-at-sign"), "");
});

test("a messaging gateway or service account is not a mailbox", () => {
  // These were all really in the list.
  assert.equal(isMailboxShaped("8035551234@txt.att.net"), false);
  assert.equal(isMailboxShaped("someone@vtext.com"), false);
  assert.equal(
    isMailboxShaped("sa-build@gtm-tprp6l9g-yjrhn.iam.gserviceaccount.com"),
    false,
    "a cloud service account has no human owner to confirm anything",
  );
  // And the ordinary case is untouched.
  assert.equal(isMailboxShaped("qs@practice.ng"), true);
  assert.equal(isMailboxShaped("someone@gmail.com"), true);
});

test("a domain with no MX and no A record cannot receive mail", async () => {
  await withDns({ mx: nxdomain, a: nxdomain }, async () => {
    assert.equal(await domainCanReceiveMail("gmail.con", { log: quiet }), false);
    assert.equal(await domainCanReceiveMail("gmail.ccom", { log: quiet }), false);
  });
});

test("a domain with an A record but no MX still accepts mail", async () => {
  // RFC 5321: no MX means deliver to the address record. Small self-hosted
  // practice domains do this, and refusing them would be our bug, not theirs.
  await withDns({ mx: async () => [], a: async () => ["198.51.100.4"] }, async () => {
    assert.equal(await domainCanReceiveMail("practice.ng", { log: quiet }), true);
  });
});

test('a single MX of "." means the domain sends no mail (RFC 7505)', async () => {
  await withDns({ mx: async () => [{ exchange: ".", priority: 0 }], a: nxdomain }, async () => {
    assert.equal(await domainCanReceiveMail("no-mail.example", { log: quiet }), false);
  });
});

test("a broken resolver must NOT refuse a sign-up", async () => {
  // The whole point. ESERVFAIL is our problem, not the address's.
  await withDns({ mx: serverFail, a: serverFail }, async () => {
    assert.equal(
      await domainCanReceiveMail("gmail.com", { log: quiet }),
      true,
      "a resolver failure must fail OPEN — refusing a live customer is worse than accepting a dead address",
    );
  });
});

test("a resolver that hangs must not hang the sign-up", async () => {
  const hang = () => new Promise(() => {});
  process.env.SIGNUP_DNS_TIMEOUT_MS = "50";
  try {
    await withDns({ mx: hang, a: hang }, async () => {
      const started = Date.now();
      const ok = await domainCanReceiveMail("slow.example", { log: quiet });
      const took = Date.now() - started;
      assert.equal(ok, true, "a timeout fails open");
      assert.ok(took < 3000, `should have given up quickly, took ${took}ms`);
    });
  } finally {
    delete process.env.SIGNUP_DNS_TIMEOUT_MS;
  }
});

test("a positive answer is cached, so gmail.com costs one lookup", async () => {
  let calls = 0;
  await withDns(
    {
      mx: async () => {
        calls += 1;
        return [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }];
      },
      a: nxdomain,
    },
    async () => {
      await domainCanReceiveMail("gmail.com", { log: quiet });
      await domainCanReceiveMail("gmail.com", { log: quiet });
      await domainCanReceiveMail("GMAIL.COM", { log: quiet });
      assert.equal(calls, 1, "the second and third lookups should come from cache");
    },
  );
});

test("a soft failure is NOT cached as a success", async () => {
  // Caching a fail-open would turn one bad moment into six hours of accepting
  // dead addresses.
  let attempt = 0;
  await withDns(
    {
      mx: async () => {
        attempt += 1;
        if (attempt === 1) serverFail();
        return [];
      },
      a: nxdomain,
    },
    async () => {
      assert.equal(await domainCanReceiveMail("flaky.example", { log: quiet }), true);
      assert.equal(
        await domainCanReceiveMail("flaky.example", { log: quiet }),
        false,
        "once the resolver answers properly, the real answer must be used",
      );
      assert.ok(attempt >= 2, "the soft failure must not have been cached");
    },
  );
});

test("checkAddressReachable tells the person what to do about it", async () => {
  await withDns({ mx: nxdomain, a: nxdomain }, async () => {
    const r = await checkAddressReachable("someone@gmail.con", { log: quiet });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "domain-cannot-receive-mail");
    // It is shown to somebody who has just mistyped their own address, so it has
    // to name the domain and say the useful thing.
    assert.match(r.message, /gmail\.con/);
    assert.match(r.message, /typo/i);
  });

  await withDns({ mx: async () => [{ exchange: "mx.practice.ng", priority: 10 }], a: nxdomain }, async () => {
    const ok = await checkAddressReachable("qs@practice.ng", { log: quiet });
    assert.deepEqual(ok, { ok: true });
  });
});

test("a gateway address is refused without a DNS lookup at all", async () => {
  let looked = false;
  await withDns(
    {
      mx: async () => {
        looked = true;
        return [{ exchange: "x", priority: 1 }];
      },
      a: async () => [],
    },
    async () => {
      const r = await checkAddressReachable("8035551234@txt.att.net", { log: quiet });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "not-a-mailbox");
      assert.equal(looked, false, "the shape check is free and must run first");
    },
  );
});
