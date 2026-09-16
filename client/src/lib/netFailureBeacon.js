// src/lib/netFailureBeacon.js
//
// Tell the API when one of its requests never completed.
//
// "Failed to fetch" happens in the browser, not on the server: the request is
// dropped by a proxy, a firewall or a broken connection before it arrives, so
// the server has nothing to log. That is how one firm's dashboard failed for
// two months without anyone at ADLM knowing. When a request fails that way,
// this sends a short note to /diag/client-error, which lands in the daily
// operations report.
//
// Design choices:
//   * sendBeacon with text/plain: a "simple" request that needs no CORS
//     preflight, so it can get through networks that break the request it is
//     reporting on. It also survives the page being closed.
//   * At most one report per API path per five minutes per tab, so a screen
//     that retries in a loop does not flood the collection.
//   * Never throws. Reporting a failure must not cause another one.

import { API_BASE } from "../config";

const SENT_KEY = "adlm_netfail_sent";
const WINDOW_MS = 5 * 60 * 1000;

function pathOf(url) {
  try {
    const u = new URL(url);
    const base = new URL(API_BASE);
    if (u.origin !== base.origin) return "";
    return u.pathname.slice(0, 200);
  } catch {
    return "";
  }
}

function currentUser() {
  try {
    const auth = JSON.parse(localStorage.getItem("auth") || "null");
    return auth?.user || null;
  } catch {
    return null;
  }
}

export function reportNetworkFailure({ url, method = "GET", error } = {}) {
  try {
    if (typeof window === "undefined" || !API_BASE) return;
    const path = pathOf(url);
    // Never report the reporter, or a dead /diag would report itself forever.
    if (!path || path.startsWith("/diag/")) return;

    const now = Date.now();
    let sent = {};
    try {
      sent = JSON.parse(sessionStorage.getItem(SENT_KEY) || "{}") || {};
    } catch {
      sent = {};
    }
    if (sent[path] && now - sent[path] < WINDOW_MS) return;
    sent[path] = now;
    try {
      sessionStorage.setItem(SENT_KEY, JSON.stringify(sent));
    } catch {
      // storage can be blocked; still send this one
    }

    const user = currentUser();
    const body = JSON.stringify({
      path,
      method: String(method || "GET").toUpperCase(),
      page: window.location.pathname.slice(0, 200),
      online: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
      message: String(error?.message || "").slice(0, 200),
      userId: user?._id || user?.id || user?.sub || null,
      email: user?.email || null,
      ua: navigator.userAgent,
    });

    const target = `${API_BASE}/diag/client-error`;
    const blob = new Blob([body], { type: "text/plain" });
    if (navigator.sendBeacon && navigator.sendBeacon(target, blob)) return;
    fetch(target, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let reporting break the page
  }
}
