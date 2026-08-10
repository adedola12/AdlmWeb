// Configured inside the GTM container (GTM-THPFGFZS), not read by this file —
// kept here so the ID is discoverable from the codebase.
//
// Note the SIXTH character is a DIGIT ZERO, not a letter O. It was a letter O
// here and in the GTM tag for months, so every hit was sent to a measurement
// ID that does not exist. Google's collector accepts any well-formed tid and
// returns success, so the site looked perfectly instrumented while the real
// property recorded nothing at all.
export const GA_MEASUREMENT_ID = "G-SYS60NRJ9W";

function nowMs() {
  return Date.now ? Date.now() : new Date().getTime();
}

export function initGA() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  // Once per page load. React.StrictMode invokes effects twice in development,
  // which pushed two app_init events per boot — harmless in isolation, but it
  // makes any "sessions started" figure built on this event twice the truth.
  if (window.__ADLM_GA_INIT) return;
  window.__ADLM_GA_INIT = true;

  // Optional: mark app boot (useful in GTM preview)
  window.dataLayer.push({
    event: "app_init",
    ts: nowMs(),
  });
}

/**
 * SPA pageview event for GTM
 * Create a GTM Trigger = Custom Event "spa_page_view"
 * and a GA4 Event tag that sends event_name "page_view"
 */
export function trackPageView(path) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  const payload = {
    event: "spa_page_view",
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    ts: nowMs(),
  };

  window.dataLayer.push(payload);
}

/**
 * Generic event helper (optional)
 * Use for: sign_up, login, purchase, etc.
 */
export function trackEvent(eventName, params = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  window.dataLayer.push({
    event: eventName,
    ...params,
    ts: nowMs(),
  });
}
