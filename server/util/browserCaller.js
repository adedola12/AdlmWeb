// server/util/browserCaller.js
//
// Is this request coming from a web browser, as opposed to one of our own
// desktop clients (Installer Hub, Rate Gen, QUIV, HERON, the plugins)?
//
// WHICH WAY ROUND THE TEST GOES, AND WHY IT MATTERS
//
// Phrased as "deny unless the caller proves it is one of ours", any older
// desktop build that does not send an identifying header would be locked out,
// breaking paid customers to enforce a presentation rule. So it is phrased the
// other way: only what is positively identifiable AS a browser counts. A
// cross-origin fetch always carries `Origin`, and every current browser also
// sends `Sec-Fetch-*`; a .NET HttpClient sends neither unless told to.
//
// A caller that names itself with X-ADLM-Client is never treated as a browser,
// so a desktop client that someday sets an Origin header cannot be locked out.
//
// First written for GET /me/deployments (Hub-only downloads); shared since the
// rate library's write routes use the same rule.
export function isBrowserCaller(req) {
  const client = String(req?.get?.("x-adlm-client") || "").trim().toLowerCase();
  if (client) return false; // the Hub, Rate Gen and the plugins say who they are
  return !!(req?.get?.("origin") || req?.get?.("sec-fetch-site"));
}
