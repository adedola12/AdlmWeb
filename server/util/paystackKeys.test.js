import test from "node:test";
import assert from "node:assert/strict";
import { paystackAccount, paystackSecret, paystackKeys, cardAccount } from "./paystackKeys.js";

const personalOnly = { PAYSTACK_SECRET_KEY: "sk_personal" };
const both = { PAYSTACK_SECRET_KEY: "sk_personal", PAYSTACK_BUSINESS_SECRET_KEY: "sk_business" };

test("off by default: the personal account, exactly as before", () => {
  assert.equal(paystackAccount(personalOnly), "personal");
  assert.equal(paystackSecret(personalOnly), "sk_personal");
  assert.equal(paystackAccount(both), "personal");
  assert.deepEqual(
    paystackKeys(personalOnly).map((k) => k.account),
    ["personal"],
  );
});

test("the switch moves new charges to the business account", () => {
  const env = { ...both, PAYSTACK_ACCOUNT: "business" };
  assert.equal(paystackAccount(env), "business");
  assert.equal(paystackSecret(env), "sk_business");
  assert.deepEqual(paystackKeys(env), [
    { account: "business", secret: "sk_business" },
    { account: "personal", secret: "sk_personal" },
  ]);
});

test("a switch with no business key stays on personal rather than stopping payments", () => {
  const env = { ...personalOnly, PAYSTACK_ACCOUNT: "business" };
  assert.equal(paystackAccount(env), "personal");
  assert.equal(paystackSecret(env), "sk_personal");
});

test("a saved card is charged through the account it was saved on", () => {
  const env = { ...both, PAYSTACK_ACCOUNT: "business" };
  assert.equal(paystackSecret(env, cardAccount({ authorizationCode: "AUTH_x" })), "sk_personal");
  assert.equal(paystackSecret(env, cardAccount({ account: "business" })), "sk_business");
});
