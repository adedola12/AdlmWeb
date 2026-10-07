// server/middleware/rateGenOnlyWrites.js
//
// RATES ARE BUILT IN RATE GEN, NOT ON THE WEBSITE.
//
// The owner's rule (4 Oct 2026): a rate is built and edited in ADLM Rate Gen
// desktop, and nowhere else. The website shows a customer's library; it does
// not change it. That covers:
//   - custom rates (PUT/DELETE /rategen-v2/library/custom-rates/:id, the bulk
//     PUT /rategen-v2/library/user-rates and the legacy PUT /rategen/library),
//   - a customer's own copy of a published rate
//     (PUT/DELETE /rategen-v2/library/user-rates/override/:rateId),
//   - the material and labour prices behind every rate
//     (PUT /rategen/price-overrides, /bulk and /restore). Changing a price
//     changes what every rate built on it costs, so it is a rate edit too.
//
// Removing the buttons alone would leave the endpoints answering a browser
// that calls them directly, so the server refuses the write as well.
//
// WHAT STAYS OPEN
//   - Every read (GET, and the POST .../resolve lookups, which change nothing).
//   - POST /rategen-v2/library/custom-rates/:id/restore. It only puts back a
//     rate a desktop sync archived (#116), it never builds or edits one, and
//     taking it away would leave a wrongly archived rate with no way back.
//   - Every non-browser caller. Rate Gen, QUIV, HERON and the plugins use a
//     .NET HttpClient that sends no Origin and no Sec-Fetch-*, so the test
//     fails OPEN for them and no desktop sync can be broken by this. The #116
//     custom rate guard still applies to them.
//
// STRICTER THAN /me/deployments ON PURPOSE
//
// util/browserCaller.js lets any caller that sends X-ADLM-Client through.
// That is fine for downloads, but page code in a browser can set that header
// itself, so here it would be a way round the rule. Origin and Sec-Fetch-*
// are set by the browser and cannot be set by page code, and no desktop rate
// client sends them, so this check reads only those and ignores X-ADLM-Client.
// Note that Node's built-in fetch sends Sec-Fetch-Mode too, so a Node script
// writing rates would be refused as well; none does today.

/** A request a browser made: it carries Origin or any Sec-Fetch-* header. */
export function isBrowserRequest(req) {
  if (req?.get?.("origin")) return true;
  const headers = req?.headers;
  if (headers && typeof headers === "object") {
    return Object.keys(headers).some((h) => h.toLowerCase().startsWith("sec-fetch-"));
  }
  return ["sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user"].some(
    (h) => !!req?.get?.(h),
  );
}

export const RATES_BUILT_IN_RATEGEN = "RATES_BUILT_IN_RATEGEN";

export const RATES_BUILT_IN_RATEGEN_MESSAGE =
  "Rates are built and edited in ADLM Rate Gen. The website shows your rate library but cannot change it. Open Rate Gen on your computer to make this change.";

const WRITE_METHODS = new Set(["PUT", "PATCH", "DELETE"]);

/** A write the website may not make: PUT, PATCH or DELETE from a browser. */
export function isBrowserRateWrite(req) {
  const method = String(req?.method || "").toUpperCase();
  return WRITE_METHODS.has(method) && isBrowserRequest(req);
}

/**
 * Router-level guard. Mounted after auth on the /rategen router and on
 * /rategen-v2/library, so it covers every PUT, PATCH and DELETE there,
 * including routes added later. POST is left alone on purpose: on these
 * routers a POST is a lookup or the archive restore.
 */
export function refuseBrowserRateWrites(req, res, next) {
  if (!isBrowserRateWrite(req)) return next();
  return res.status(403).json({
    ok: false,
    code: RATES_BUILT_IN_RATEGEN,
    error: RATES_BUILT_IN_RATEGEN_MESSAGE,
  });
}
