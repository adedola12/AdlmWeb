// server/util/paymentMethods.js
// Persists the reusable Paystack card authorization after a successful card
// charge so the auto-renewal cron can charge the card again later.
//
// PCI note: only Paystack's opaque authorization_code plus display metadata
// (brand, last4, expiry) are stored — never the PAN or CVV. The code is
// useless outside this Paystack account and is stripped from API responses
// (select:false on the schema path). Do not log it.
import { User } from "../models/User.js";

// chargeData = the `data` object of a Paystack charge.success event or of a
// /transaction/verify response (both carry the same `authorization` shape).
export async function saveCardAuthorization(userId, chargeData) {
  if (!userId || !chargeData) return { saved: false, reason: "no-data" };

  const auth = chargeData.authorization || {};
  const code = String(auth.authorization_code || "").trim();

  // Only reusable card authorizations are worth keeping — bank transfers,
  // USSD and one-time tokens can't fund a background renewal charge.
  if (auth.reusable !== true) return { saved: false, reason: "not-reusable" };
  if (String(auth.channel || "card").toLowerCase() !== "card") {
    return { saved: false, reason: "not-card" };
  }
  if (!code) return { saved: false, reason: "no-code" };

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        paymentMethod: {
          provider: "paystack",
          authorizationCode: code,
          signature: String(auth.signature || ""),
          last4: String(auth.last4 || ""),
          expMonth: String(auth.exp_month || ""),
          expYear: String(auth.exp_year || ""),
          cardType: String(auth.card_type || "").trim(),
          bank: String(auth.bank || ""),
          countryCode: String(auth.country_code || ""),
          reusable: true,
          savedAt: new Date(),
        },
      },
    },
  );

  return { saved: true };
}

// "Remove card" from the profile page. Also switches off auto-renew on every
// entitlement — a renewal without a stored authorization can never succeed,
// so leaving the flags on would only queue up failure emails.
export async function removeCardAuthorization(userId) {
  await User.updateOne({ _id: userId }, { $unset: { paymentMethod: 1 } });
  // Separate update: `$[]` errors on docs where `entitlements` is missing
  // (ancient accounts), and that must not block removing the card above.
  await User.updateOne(
    { _id: userId, entitlements: { $type: "array" } },
    { $set: { "entitlements.$[].autoRenew": false } },
  ).catch(() => {});
  return { ok: true };
}
