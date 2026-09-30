// Running one of Ada's actions.
//
// WHY IT IS OUT HERE
//
// The server can return four action types — buy, signup, nav, whatsapp
// (server/services/salesAgent.js) — and they are the only structured output she
// has. One surface rendered and ran them; the other read `json.reply` and threw
// `json.actions` away, so on the project workspace, the screen a QS actually
// works in, every "Add to cart" and "Create an account" Ada offered was
// silently dropped. That is the surface where an upsell matters most.
//
// The logic now lives in one place so both surfaces run an action the same way,
// and so it can be tested without rendering a chat.

/** The action types the server will emit. Anything else is ignored. */
export const AGENT_ACTION_TYPES = Object.freeze(["buy", "signup", "nav", "whatsapp"]);

/** A WhatsApp deep link with the message pre-filled. */
export function waLink(number, text) {
  const n = String(number || "").replace(/[^\d]/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(String(text || ""))}`;
}

/** "Adedolapo Quasim here. " or "" — the greeting only when we know the name. */
export function waGreeting(user) {
  // firstName/lastName, not `name`: buildAuthPayload has never sent a joined
  // one, so reading `name` always fell through to the anonymous wording even
  // for somebody signed in.
  const who = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return who ? `Hi ADLM, ${who} here. I need help.` : "Hi ADLM, I need help.";
}

/**
 * Do what the action says.
 *
 * @param {{type: string, productKey?: string, months?: number, to?: string, number?: string}} a
 * @param {object} deps
 * @param {(to: string) => void} deps.navigate
 * @param {(productKey: string, months: number) => void} [deps.addToCart]
 * @param {object} [deps.user]
 * @param {() => void} [deps.onDone]   close the panel, if it has one
 * @param {(url: string) => void} [deps.openExternal]
 * @returns {boolean} whether anything was done
 */
export function runAgentAction(a, deps = {}) {
  if (!a || !AGENT_ACTION_TYPES.includes(a.type)) return false;
  const { navigate, addToCart, user, onDone, openExternal } = deps;

  if (a.type === "buy" && a.productKey) {
    addToCart?.(a.productKey, a.months || 1);
    onDone?.();
    navigate?.("/purchase");
    return true;
  }
  if (a.type === "signup") {
    onDone?.();
    navigate?.("/signup");
    return true;
  }
  if (a.type === "nav" && a.to) {
    // Only ever an in-app path. The server already refuses anything that does
    // not start with "/", and re-checking here means a surface cannot be talked
    // into opening an external site by a crafted reply.
    //
    // "starts with /" is not enough on its own: "//evil.example" satisfies it
    // and is a protocol-relative URL that leaves the site. So the second
    // character must not be a slash or a backslash — browsers treat "/\" the
    // same way.
    const to = String(a.to);
    if (!/^\/(?![/\\])/.test(to)) return false;
    onDone?.();
    navigate?.(to);
    return true;
  }
  if (a.type === "whatsapp") {
    const url = waLink(a.number, waGreeting(user));
    if (openExternal) openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

export default runAgentAction;
