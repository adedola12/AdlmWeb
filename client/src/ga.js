export const GA_MEASUREMENT_ID = "G-SYS6ONRJ9W"; // used inside GTM GA4 config

function nowMs() {
  return Date.now ? Date.now() : new Date().getTime();
}

export function initGA() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

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
