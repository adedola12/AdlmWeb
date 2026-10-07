// Which Paystack account the site charges through (R22, 2026-09-18).
//
// Today: the personal account, PAYSTACK_SECRET_KEY. When the ADLM business
// account is ready, its secret goes in PAYSTACK_BUSINESS_SECRET_KEY and
// PAYSTACK_ACCOUNT=business moves new charges and verifications over at once.
// Off by default, and a switch with no business key stays on personal, so a
// half-done change cannot stop payments.
//
// Two things survive the switch on purpose:
//   - a saved card belongs to the account it was saved on, so renewals charge
//     it through that account (paymentMethod.account; cards saved before this
//     have none and are personal);
//   - the webhook accepts a signature from either of our accounts, because
//     payments started before the switch are still reported after it.
//
// Card and bank transfer both stay: transfer (and invoice) orders never touch
// Paystack.
//
// TODO(adlm): PAYSTACK_BUSINESS_SECRET_KEY once the business account is
// approved, then PAYSTACK_ACCOUNT=business. Both are environment settings; no
// key is ever written in code.

export function paystackAccount(env = process.env) {
  const wantBusiness = /^business$/i.test(String(env.PAYSTACK_ACCOUNT || "").trim());
  return wantBusiness && String(env.PAYSTACK_BUSINESS_SECRET_KEY || "").trim() ? "business" : "personal";
}

/** The secret for an account; the active account when none is named. */
export function paystackSecret(env = process.env, account = paystackAccount(env)) {
  const key = account === "business" ? env.PAYSTACK_BUSINESS_SECRET_KEY : env.PAYSTACK_SECRET_KEY;
  return String(key || "").trim();
}

/** The account a saved card was saved on. Cards saved before R22 are personal. */
export function cardAccount(paymentMethod) {
  return paymentMethod?.account === "business" ? "business" : "personal";
}

/** Every configured secret with its account, the active one first. */
export function paystackKeys(env = process.env) {
  const active = paystackAccount(env);
  const other = active === "business" ? "personal" : "business";
  return [active, other]
    .map((account) => ({ account, secret: paystackSecret(env, account) }))
    .filter((k) => k.secret);
}
