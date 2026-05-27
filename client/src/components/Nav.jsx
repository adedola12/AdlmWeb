import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { useTheme } from "../theme.jsx";
import { api } from "../api.js";
import adlmLogo from "../assets/logo/adlmLogo.png";

// Lightweight inline icons so we don't pull in another react-icons import.
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}
function DesktopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path strokeLinecap="round" d="M8 20h8M12 16v4" />
    </svg>
  );
}

// Three-state theme toggle button — cycles light → dark → system. The
// icon shown reflects the CURRENT preference (not the active resolved
// mode), so "system" gets its own glyph and the user knows which state
// they're in. Tooltip explains.
function ThemeToggle({ className = "" }) {
  const { preference, toggle, active } = useTheme();
  const icon =
    preference === "dark" ? <MoonIcon />
      : preference === "light" ? <SunIcon />
        : <DesktopIcon />;
  const label =
    preference === "dark" ? "Dark mode"
      : preference === "light" ? "Light mode"
        : `System (${active})`;
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Theme: ${label}. Click to cycle.`}
      aria-label={`Current theme: ${label}. Click to change.`}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition ${className}`}
    >
      {icon}
    </button>
  );
}

function DesktopLink({ to, children }) {
  const { pathname } = useLocation();
  const active =
    (to === "/" && pathname === "/") || (to !== "/" && pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={`px-3 py-1 rounded text-sm transition ${
        active
          ? "bg-white/10 text-white"
          : "text-white/80 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileLink({ to, children, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block w-full text-left px-5 py-3.5 text-[15px] text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
      style={{ minHeight: 44 }}
    >
      {children}
    </Link>
  );
}

export default function Nav() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  React.useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : orig || "";
    return () => {
      document.body.style.overflow = orig || "";
    };
  }, [open]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Clear local auth even if logout request fails.
    }
    clear();
    navigate("/login", { replace: true });
    setTimeout(() => window.location.reload(), 0);
  }

  const next = encodeURIComponent(loc.pathname + loc.search);

  return (
    <>
      {/* Fixed (not sticky) so the navbar always covers the FULL viewport
          width — sticky only locks vertically, which meant wide BoQ tables
          that cause horizontal page scroll would expose the navbar's right
          edge and let table cells bleed through to its right. Fixed +
          inset-x-0 keeps the navbar pinned to both viewport edges no matter
          what the page width is.

          Because fixed removes the navbar from flow, a spacer div below
          (h-14) reserves the 56px so page content doesn't slide up under it. */}
      <header className="fixed inset-x-0 top-0 z-[100] bg-adlm-navy border-b border-adlm-navy-tertiary shadow-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 overflow-visible">
          <Link to="/" className="flex items-center gap-1.5 flex-shrink-0">
            <img src={adlmLogo} alt="ADLM Logo" className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="text-white font-semibold text-[13px] sm:text-base">
              ADLM_Studio
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <DesktopLink to="/">Home</DesktopLink>
            <DesktopLink to="/products">Products</DesktopLink>
            <DesktopLink to="/about">About</DesktopLink>
            <DesktopLink to="/learn">Learn</DesktopLink>
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {!user ? (
              <>
                <Link
                  to={`/login?next=${next}`}
                  className="px-3 py-1.5 rounded border border-white/30 text-white/90 hover:bg-white/10 text-sm"
                >
                  Login
                </Link>
                <Link
                  to={`/signup?next=${next}`}
                  className="px-3 py-1.5 rounded bg-white text-adlm-navy-mid text-sm font-medium hover:bg-blue-50"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                <DesktopLink to="/purchase">Purchase</DesktopLink>
                <DesktopLink to="/dashboard">Dashboard</DesktopLink>
                <DesktopLink to="/profile">Profile</DesktopLink>
                {(user.role === "admin" || user.role === "mini_admin") && <DesktopLink to="/admin">Admin</DesktopLink>}
                <button
                  onClick={logout}
                  className="ml-1 px-3 py-1.5 rounded bg-white text-adlm-navy text-sm font-medium hover:bg-blue-50"
                  disabled={busy}
                >
                  {busy ? "..." : "Logout"}
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger — 44px touch target (Apple HIG) */}
          <button
            className="md:hidden flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg text-white hover:bg-white/10 active:bg-white/20"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Spacer reserves the same 56px the navbar would have taken when it
          was in flow. Without this, page content (banners, main, etc.)
          would slide up under the now-fixed navbar. Marked aria-hidden so
          screen readers skip it. */}
      <div aria-hidden="true" className="h-14 flex-shrink-0" />

      <div
        className={`fixed inset-0 z-[110] bg-black/50 transition-opacity md:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 bottom-0 z-[120] w-72 max-w-[80vw] bg-adlm-navy text-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
          <Link to="/" onClick={() => setOpen(false)} className="flex items-center gap-2 font-semibold">
            <img src={adlmLogo} alt="" className="w-6 h-6" />
            ADLM_Studio
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg hover:bg-white/10 active:bg-white/20"
            style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="py-3 flex flex-col overflow-y-auto" style={{ maxHeight: "calc(100vh - 56px - 48px)" }}>
          <MobileLink to="/" onClick={() => setOpen(false)}>Home</MobileLink>
          <MobileLink to="/products" onClick={() => setOpen(false)}>Products</MobileLink>
          <MobileLink to="/about" onClick={() => setOpen(false)}>About</MobileLink>
          <MobileLink to="/learn" onClick={() => setOpen(false)}>Learn</MobileLink>
          <MobileLink to="/quote" onClick={() => setOpen(false)}>Get Quotation</MobileLink>

          {!user ? (
            <div className="px-4 pt-4 space-y-2">
              <Link
                to={`/login?next=${next}`}
                onClick={() => setOpen(false)}
                className="block w-full px-4 py-3 rounded-lg border border-white/30 text-white text-center font-medium hover:bg-white/10"
              >
                Sign in
              </Link>
              <Link
                to={`/signup?next=${next}`}
                onClick={() => setOpen(false)}
                className="block w-full px-4 py-3 rounded-lg bg-white text-adlm-navy text-center font-medium hover:bg-blue-50"
              >
                Sign up
              </Link>
            </div>
          ) : (
            <>
              <div className="my-2 mx-4 border-t border-white/10" />
              <MobileLink to="/purchase" onClick={() => setOpen(false)}>Purchase</MobileLink>
              <MobileLink to="/dashboard" onClick={() => setOpen(false)}>Dashboard</MobileLink>
              <MobileLink to="/profile" onClick={() => setOpen(false)}>Profile</MobileLink>
              {(user.role === "admin" || user.role === "mini_admin") && (
                <MobileLink to="/admin" onClick={() => setOpen(false)}>Admin</MobileLink>
              )}
              <div className="px-4 pt-3">
                <button
                  onClick={logout}
                  className="w-full px-4 py-3 rounded-lg bg-white text-adlm-navy font-medium hover:bg-blue-50 active:bg-blue-100"
                  disabled={busy}
                >
                  {busy ? "Logging out..." : "Logout"}
                </button>
              </div>
            </>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-white/10 text-xs text-white/50">
          &copy; {new Date().getFullYear()} ADLM Studio
        </div>
      </aside>
    </>
  );
}
