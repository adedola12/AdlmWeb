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

/**
 * Identify the signed-in visitor to GA4, and clear it on sign-out.
 *
 * WHY THIS EXISTS
 * Without it a GA "user" is a browser, not a person. The same subscriber on a
 * laptop and a phone counted as two, a cleared cookie counted as a new one, and
 * nothing connected a paying customer to their behaviour on the site. Setting
 * user_id lets GA4 stitch those together and separates customers from
 * strangers in every report.
 *
 * WHAT IS SENT
 * The account's database id and nothing else. Google's terms forbid sending
 * personally identifiable information to Analytics, so no email, no name. The
 * id is opaque to anyone without the database and is already what every other
 * system here keys on.
 *
 * THE OTHER HALF IS IN GTM
 * This pushes the value into the dataLayer. It reaches GA4 only once the GA4
 * Configuration tag in container GTM-THPFGFZS reads a Data Layer Variable
 * named `user_id` and maps it to the User ID field. Until that mapping exists
 * this is inert, which is the safe direction for it to fail.
 */
export function setAnalyticsUser(userId) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];

  const id = userId ? String(userId) : null;

  // Re-pushing the same id on every render would inflate nothing but would
  // bloat the dataLayer, which GTM walks on each event.
  if (window.__ADLM_GA_UID === id) return;
  window.__ADLM_GA_UID = id;

  window.dataLayer.push({
    event: id ? "user_identified" : "user_signed_out",
    // Explicit null on sign-out. Omitting the key would leave the previous
    // visitor's id in the dataLayer for GTM to keep reading, so a shared
    // machine would attribute the next person's session to whoever came first.
    user_id: id,
  });
}
