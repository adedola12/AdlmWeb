// Catches the one mistake the product price form invites: typing the Naira
// figure into a USD box.
//
// USD is an *optional override* (see PriceSchema in server/models/Product.js).
// Leave a USD box blank and the server converts from the Naira price at the
// live rate; fill it in and that figure wins outright — `calcUSD` in
// server/util/fx.js returns the override without looking at the NGN side. So a
// filled-in box is never sanity-checked anywhere downstream, and a Naira figure
// pasted into one reaches the catalogue as a real price.
//
// The error would be ~1000x, so the check does not need to be clever about
// exchange rates — it only needs to notice that a USD price is the same order
// of magnitude as its Naira counterpart.
//
// Note on provenance: this was written in response to ADLM Time Pro showing
// $2,000/month for a ₦2,000 product, on the assumption someone had typed the
// naira figure into the USD box. That turned out to be wrong — the box was
// empty and the server's FX lookup was returning a rate of 1.0. The check is
// kept because the hazard is real and otherwise unguarded, but it was not the
// cause of that incident.

// A dollar price should never be worth more than 1% of the Naira price beside
// it — that would mean pricing the dollar below ₦100. The real catalogue sits
// between roughly ₦670 and ₦2,500 to the dollar, so this leaves a wide margin
// for deliberate premium pricing while still catching a pasted Naira figure.
const MIN_NGN_PER_USD = 100;

// Every USD field in the form, paired with the Naira field it is an override
// for. Keep this in step with PriceSchema — a USD field missing from here is a
// USD field nothing checks.
const PAIRS = [
  { usd: "monthlyUSD", ngn: "monthlyNGN", label: "Monthly" },
  { usd: "sixMonthUSD", ngn: "sixMonthNGN", label: "6-month" },
  { usd: "yearlyUSD", ngn: "yearlyNGN", label: "Yearly" },
  { usd: "installUSD", ngn: "installNGN", label: "Install fee" },
  { usd: "discountedMonthlyUSD", ngn: "discountedMonthlyNGN", label: "Discounted monthly" },
  { usd: "discountedSixMonthUSD", ngn: "discountedSixMonthNGN", label: "Discounted 6-month" },
  { usd: "discountedYearlyUSD", ngn: "discountedYearlyNGN", label: "Discounted yearly" },
];

const money = (n) => Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 });

/**
 * Find USD prices that look like a Naira figure in the wrong box.
 *
 * Only compares a pair when both sides carry a figure: a USD price with no
 * Naira counterpart has nothing to be implausible against, and flagging it
 * would nag whoever prices a product in dollars alone.
 *
 * @param {object} price  the `price` object about to be saved
 * @returns {Array<{label:string, usd:number, ngn:number, max:number}>}
 */
export function findImplausibleUSD(price = {}) {
  const found = [];

  for (const { usd, ngn, label } of PAIRS) {
    const u = Number(price[usd]);
    const n = Number(price[ngn]);
    if (!Number.isFinite(u) || u <= 0) continue;
    if (!Number.isFinite(n) || n <= 0) continue;

    const max = n / MIN_NGN_PER_USD;
    if (u > max) found.push({ label, usd: u, ngn: n, max });
  }

  return found;
}

/**
 * Turn those findings into the text of a confirm dialog.
 *
 * Deliberately a warning rather than a block: a price this high is almost
 * always a typo, but it is the admin's call, and refusing the save outright
 * would mean a legitimate figure could not be entered at all.
 */
export function describeImplausibleUSD(found) {
  const lines = found.map(
    ({ label, usd, ngn, max }) =>
      `  • ${label}: $${money(usd)} against ₦${money(ngn)}: expected under $${money(max)}`,
  );

  return [
    found.length === 1
      ? "This USD price looks like a Naira figure:"
      : "These USD prices look like Naira figures:",
    "",
    ...lines,
    "",
    "Leaving a USD box empty converts the Naira price automatically, which is",
    "usually what you want.",
    "",
    "Save anyway?",
  ].join("\n");
}

/**
 * Check the price in a save payload and, if anything looks wrong, ask first.
 *
 * On confirmation this sets `allowUnusualPrice` on the payload: the API runs
 * the same check (server/util/priceSanity.js) and rejects the save without it,
 * so answering "Save anyway" here has to carry that answer through to the
 * request — otherwise the dialog would promise something the server refuses.
 *
 * @param {object} payload  the PATCH/POST body, containing `price`
 * @returns {boolean} true to go ahead with the save
 */
export function confirmPriceSanity(payload) {
  const found = findImplausibleUSD(payload?.price || {});
  if (!found.length) return true;
  if (!window.confirm(describeImplausibleUSD(found))) return false;
  payload.allowUnusualPrice = true;
  return true;
}
