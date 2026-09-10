// server/routes/diag.js
//
// The network check behind /network-check on the website.
//
// Built for Y.S. Associates, September 2026. Their dashboard read "Failed to
// fetch" for two months while the server logged nothing at all for the
// requests that failed: every request carrying an Authorization header
// vanished between their office and the API, while cookie-only and public
// requests arrived. Nothing on our side can see a request that never gets
// here, so the only evidence had to come from inside their browser.
//
// The page runs a handful of small requests that differ in exactly one way
// each (no headers, a custom header, a bearer token, a cookie), and then
// posts what it saw. Two rules keep it honest:
//
//   * /diag/ping is public and answers with what it RECEIVED, not with what
//     it thinks. A missing Authorization here means the network stripped it.
//   * /diag/report accepts text/plain, which is a "simple" request in CORS
//     terms and needs no preflight, so the findings get through even on a
//     network that blocks OPTIONS.
//
// Everything is logged with a [diag] prefix and the page's reference code,
// so a report can be found in CloudWatch by the code the customer reads out.

import express from "express";

const router = express.Router();

router.get("/ping", (req, res) => {
  const h = req.headers || {};
  res.json({
    ok: true,
    at: new Date().toISOString(),
    saw: {
      authorization: !!h.authorization,
      xAdlmClient: !!h["x-adlm-client"],
      checkCookie: !!(req.cookies && req.cookies.adlm_check),
      origin: h.origin || "",
    },
    ua: h["user-agent"] || "",
  });
});

router.post(
  "/report",
  express.text({ type: ["text/plain", "application/json"], limit: "16kb" }),
  (req, res) => {
    const raw = typeof req.body === "string" ? req.body : "";
    let ref = "";
    try {
      ref = String(JSON.parse(raw)?.ref || "");
    } catch {
      // free-form text is fine; it is logged as-is
    }
    console.log(`[diag] ref=${ref || "-"} ${raw.slice(0, 8000)}`);
    res.json({ ok: true, ref });
  },
);

export default router;
