// Which hosts are staff-only previews, and which paths stay open there so
// staff can sign in. See components/PreviewHostGate.jsx.

const LIVE_HOSTS = new Set(["adlmstudio.net", "www.adlmstudio.net"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isGatedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  return !LIVE_HOSTS.has(h) && !LOCAL_HOSTS.has(h);
}

// The sign-in screens, and where a social sign-in returns to.
const OPEN = [/^\/login\/?$/, /^\/admin\/login\/?$/, /^\/auth\/callback\/?$/, /^\/forgot-password\/?$/, /^\/reset-password(\/.*)?$/];

export function isOpenPath(pathname) {
  const p = String(pathname || "/");
  return OPEN.some((re) => re.test(p));
}
