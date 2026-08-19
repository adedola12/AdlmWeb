// Authorization code + PKCE, against Google, Microsoft and Autodesk alike.
//
// One flow for all three, rather than Google's script for one, MSAL for
// another and a hand-rolled redirect for the third. That is not tidiness for
// its own sake:
//
//   * No third-party JavaScript at all. Google's and Microsoft's SDKs are
//     scripts from their servers on a page most visitors never open, and
//     loading one tells that company somebody is looking at our sign-in page
//     before they have chosen to use it.
//   * The buttons are ours, so all three can carry their real logo and look
//     like the same set. Google's drop-in button cannot be restyled, which is
//     why mixing it with a custom one always looks borrowed.
//   * One code path to get right. Every provider returns an id_token which the
//     server verifies the same way.
//
// The browser starts the flow and receives the code. It does NOT exchange it:
// that happens on the server, because Google's web client is a confidential
// client and requires the secret even with PKCE — Google has no SPA client type
// the way Azure does, and "client_secret is missing" is Google saying so. The
// secret must never reach a browser, and doing the exchange server-side also
// means the provider's ID token never exists in the page.
//
// PKCE still earns its place: the verifier proves the code is being redeemed
// for the browser that started the flow, so an intercepted code is useless.

const STORE = "adlm.social.pkce";

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function randomString(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest);
}

/** Where the provider sends the browser back. One route for all three. */
export const redirectUri = () => `${window.location.origin}/auth/callback`;

/**
 * Send the browser to the provider.
 *
 * @param {"google"|"microsoft"|"autodesk"} provider
 * @param {object} endpoint  the provider block from GET /auth/providers
 * @param {object} [opts]
 * @param {string} [opts.next]    where to land afterwards
 * @param {boolean} [opts.connect] connecting to the signed-in account rather
 *                                 than signing in
 */
export async function startSocialAuth(provider, endpoint, { next = "/dashboard", connect = false } = {}) {
  const verifier = randomString();
  const state = randomString(16);

  // sessionStorage, not localStorage: the verifier is worthless after this
  // one exchange and should not outlive the tab that created it.
  sessionStorage.setItem(
    STORE,
    JSON.stringify({
      provider,
      verifier,
      state,
      next,
      connect,
      clientId: endpoint.clientId,
    }),
  );

  const url = new URL(endpoint.authorize);
  url.searchParams.set("client_id", endpoint.clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", endpoint.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  // Ask the person which account they mean rather than silently reusing
  // whichever one their browser happens to be signed in to.
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  if (provider === "microsoft") url.searchParams.set("prompt", "select_account");

  window.location.assign(url.toString());
}

/**
 * Complete the exchange after the provider redirects back.
 *
 * @param {URLSearchParams} params  the query the provider sent
 * @returns {Promise<{provider: string, code: string, codeVerifier: string, redirectUri: string, next: string, connect: boolean}>}
 */
export async function finishSocialAuth(params) {
  const raw = sessionStorage.getItem(STORE);
  if (!raw) throw new Error("That sign-in did not start here. Please try again.");
  sessionStorage.removeItem(STORE);

  const saved = JSON.parse(raw);

  if (params.get("error")) {
    throw new Error(params.get("error_description") || "That sign-in was cancelled.");
  }

  // The state check is what stops somebody handing you a link that completes
  // THEIR sign-in inside YOUR browser.
  if (!params.get("state") || params.get("state") !== saved.state) {
    throw new Error("That sign-in could not be matched to this browser.");
  }

  const code = params.get("code");
  if (!code) throw new Error("The provider returned no authorisation code.");

  // Everything the server needs to finish it. The verifier travels with the
  // code so the server can prove the exchange belongs to this browser.
  return {
    provider: saved.provider,
    code,
    codeVerifier: saved.verifier,
    redirectUri: redirectUri(),
    next: saved.next || "/dashboard",
    connect: !!saved.connect,
  };
}
